const { NODE_TYPES } = require('./parser');
const evaluateQuery = require('./evaluate-query');

const {
    OPERATORS,
    VALUE_FUNCTIONS,
    WINDOW_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
} = require('./const');

const { isValidDate } = require('./util');

class SymbolError extends Error { }

module.exports = {
    evaluate,
    getRowEvaluator,
    evaluateConstantExpression,
    aggregateValues,
    rowSorter,
    comparator,
    SymbolError,
};

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ParsedTable} ParsedTable
 * @typedef {import('../types').WindowSpec} WindowSpec
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').QueryCallbacks} QueryCallbacks
 * @typedef {import('../types').QueryContext} QueryContext
 */

/**
* Execute an expresion from AST nodes
* @this {QueryContext}
* @param {ResultRow} row
* @param {Node} node
* @param {ResultRow[]} [rows]
*/
function evaluate (row, node, rows=null) {
    switch (node.type) {
        case NODE_TYPES.FUNCTION_CALL: {
            const fnName = node.id;

            // First check if we're evaluating a window function
            if (node.window) {
                let group;
                const window = typeof node.window === "string" ? this.windows[node.window] : node.window;

                if (window.partition) {
                    const partitionVal = this.evaluate(row, window.partition, rows);
                    group = rows.filter(r => OPERATORS['='](this.evaluate(r, window.partition, rows), partitionVal));
                } else {
                    group = [ ...rows ];
                }

                if (window.order) {
                    group.sort(rowSorter(this.evaluate, window.order));
                }

                const index = group.indexOf(row);

                if (window.frameUnit) {

                    if (!window.order) {
                        throw Error("Frames can only be specified with an ORDER BY clause");
                    }

                    if (window.frameUnit === "rows") {
                        const start = Math.max(index - window.preceding, 0);
                        group = group.slice(start, index + window.following + 1);

                    } else if (window.frameUnit === "range") {
                        const currentVal = this.evaluate(row, window.order, rows);
                        const min = currentVal - window.preceding;
                        const max = currentVal + window.following;

                        group = group.filter(r => {
                            const v = this.evaluate(r, window.order, rows);
                            return min <= v && v <= max;
                        });
                    }
                }

                if (node.id in WINDOW_FUNCTIONS) {
                    if (!window.order) {
                        throw Error("Window functions require ORDER BY in OVER clause");
                    }

                    const fn = WINDOW_FUNCTIONS[node.id];
                    const orderVals = group.map(getRowEvaluator(this, window.order, rows));
                    return fn(index, orderVals, group, this.evaluate, ...node.children);
                }

                if (node.id in AGGREGATE_FUNCTIONS) {
                    if (node.children.length === 0) {
                        throw new Error(`Function ${node.id} requires at least one paramater.`);
                    }

                    const fn = AGGREGATE_FUNCTIONS[node.id];

                    // Aggregate values could have '*' as a child (paramater) node
                    // so they get run through a special function first
                    return fn(aggregateValues(this, group, node.children[0], node.distinct));
                }

                throw Error(`${node.id} is not a window function`);
            }

            if (fnName in AGGREGATE_FUNCTIONS) {
                if (row['group']) {
                    // Aggregate functions are evaluated after grouping.
                    //
                    // Normally the main query will fill in the aggregates
                    // in a separate step rather than here.
                    //
                    // There is a special case meaning we end up here instead
                    // though, namely a brand new aggregate function named
                    // in a HAVING clase. It gets evaluated here.
                    const fn = AGGREGATE_FUNCTIONS[fnName];
                    return fn(aggregateValues(this, row['group'], node.children[0]));
                }
                return;
            }

            const fn = this.userFunctions[fnName] || VALUE_FUNCTIONS[fnName];

            if (!fn) {
                throw new Error(`Tried to call a non-existant function (${fnName})`);
            }

            const args = node.children.map(c => this.evaluate(row, c, rows));

            try {
                return fn(...args);
            } catch (e) {
                return null;
            }

        }
        case NODE_TYPES.SYMBOL: {
            return this.resolveValue(row, String(node.id), rows);
        }
        case NODE_TYPES.STRING: {
            // We need to check for date here and convert if necessary
            if (/^\d{4}-\d{2}-\d{2}/.test(String(node.id))) {
                const d = new Date(node.id);
                if (isValidDate(d)) {
                    return d;
                }
            }

            return String(node.id);
        }
        case NODE_TYPES.NUMBER: {
            return +node.id;
        }
        case NODE_TYPES.KEYWORD: {
            // Pass keywords like YEAR, SECOND, INT, FLOAT as strings
            return String(node.id);
        }
        case NODE_TYPES.OPERATOR: {
            const op = OPERATORS[node.id];

            if (!op) {
                throw new Error(`Unsupported operator '${node.id}'`);
            }

            return op(...node.children.map(c => this.evaluate(row, c, rows)));
        }
        case NODE_TYPES.CLAUSE: {
            if (node.id === "WHERE" || node.id === "ON") {
                if (node.children.length > 0) {
                    return Boolean(this.evaluate(row, node.children[0], rows));
                } else {
                    throw new Error(`Empty predicate clause: ${node.id}`);
                }
            }
        }
        case NODE_TYPES.LIST: {
            return node.children.map(c => this.evaluate(row, c, rows));
        }
        default: {
            throw new Error(`Can't execute node type ${node.type}: ${node.id}`);
        }
    }
}

/**
 * Creates a row evaluator (suitable for use in .map() or .filter())
 * which turns SymbolErrors into nulls
 * @param {QueryContext} context
 * @param {Node} node
 * @param {ResultRow[]} rows
 * @returns {(row: ResultRow) => any}
 */
function getRowEvaluator(context, node, rows=null) {
    return row => {
        try {
            return context.evaluate(row, node, rows);
        }
        catch (e) {
            if (e instanceof SymbolError) {
                return null;
            }
            else {
                throw e;
            }
        }
    };
}

function evaluateConstantExpression(node) {
    const dummyContext = { evaluate };
    return evaluate.call(dummyContext, null, node);
}

/**
 * Generate a comparator for the purpose of sorting
 * @param {Node} order
 * @param {ResultRow[]} [rows]
 * @returns {(a: ResultRow, b: ResultRow) => number}
 */
function rowSorter(evaluator, order, rows=null) {
    return (ra, rb) => comparator(evaluator(ra, order, rows), evaluator(rb, order, rows)) * (order.desc ? -1 : 1);
}
/**
 * Compares two values of the same type
 * @param {any} a
 * @param {any} b
 */
function comparator (a, b) {
    if (a instanceof Date) {
        a = +a;
    }

    if (b instanceof Date) {
        b = +b;
    }

    // Coerce into numbers if we can
    if (isFinite(a) && isFinite(b)) {
        return +a - +b;
    }

    return String(a).localeCompare(b);
}

/**
 * Map rows to values following the rules for aggregate functions.
 * @param {QueryContext} context
 * @param {ResultRow[]} rows
 * @param {Node} expr
 * @param {boolean} distinct
 * @returns {any[]}
 */
function aggregateValues (context, rows, expr, distinct = false) {
  // COUNT(*) includes all rows, NULLS and all
  // we don't need to evaluate anything and can just bail early
  if (expr.id === "*") {
      return rows.map(r => true);
  }

  let values = rows.map(getRowEvaluator(context, expr, rows));

  // All aggregate functions ignore null except COUNT(*)
  // We'll use our convenient 'IS NOT NULL' function to do the
  // filtering for us.
  values = values.filter(OPERATORS['IS NOT NULL']);

  if (distinct) {
      values = Array.from(new Set(values));
  }

  return values;
}
