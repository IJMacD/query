
class SymbolError extends Error { }

module.exports = {
    evaluate,
    getRowEvaluator,
    evaluateConstantExpression,
    isConstantExpression,
    aggregateValues,
    rowSorter,
    comparator,
    SymbolError,
};

const { NODE_TYPES, KEYWORD_CONSTANTS } = require('./parser');
const { resolveConstant } = require('./resolve');

const {
    OPERATORS,
    VALUE_FUNCTIONS,
    WINDOW_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
    TABLE_VALUED_FUNCTIONS,
} = require('./const');

const { isValidDate } = require('./util');

/**
 * @typedef {import('..').Node} Node
 * @typedef {import('..').ParsedTable} ParsedTable
 * @typedef {import('..').WindowSpec} WindowSpec
 * @typedef {import('..').ResultRow} ResultRow
 * @typedef {import('..').QueryCallbacks} QueryCallbacks
 * @typedef {import('..').QueryContext} QueryContext
 */

 /** @typedef {string|number|boolean|Date} Primitive */

/**
 * Execute an expresion from AST nodes
 * @this {QueryContext}
 * @param {ResultRow} row
 * @param {Node} node
 * @param {ResultRow[]} [rows]
 * @returns {Primitive|Primitive[]}
 */
function evaluate (row, node, rows=null) {
    switch (node.type) {
        case NODE_TYPES.STATEMENT: {
            throw Error("Statements can only be evaluated as one of the explicit column values.");
        }
        case NODE_TYPES.FUNCTION_CALL: {
            const fnName = node.id;

            // First check if we're evaluating a window function
            if (node.window) {
                let group = [ ...rows ];
                const window = typeof node.window === "string" ? this.windows[node.window] : node.window;

                if (window.partition) {
                    const partitionVal = this.evaluate(row, window.partition, group);
                    group = group.filter(r => OPERATORS['='](this.evaluate(r, window.partition, group), partitionVal));
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
                        const currentVal = +this.evaluate(row, window.order, rows);
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

                    /** @type {(index: number, order: Primitive[], rows: ResultRow[], evaluator, ...nodes: Node[]) => Primitive} */
                    const fn = WINDOW_FUNCTIONS[node.id];

                    const orderVals = group.map(getRowEvaluator(this, window.order, rows));
                    return fn(index, orderVals, group, this.evaluate, ...node.children);
                }

                if (node.id in AGGREGATE_FUNCTIONS) {
                    if (node.children.length === 0) {
                        throw new Error(`Function ${node.id} requires at least one paramater.`);
                    }

                    /** @type {(values: any[]) => Primitive} */
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

                    /** @type {(values: any[]) => Primitive} */
                    const fn = AGGREGATE_FUNCTIONS[fnName];

                    return fn(aggregateValues(this, row['group'], node.children[0]));
                }
                return;
            }

            /** @type {(...args) => Primitive} */
            const fn = (typeof this.userFunctions !== "undefined" && this.userFunctions[fnName]) || VALUE_FUNCTIONS[fnName];

            if (!fn) {
                if (fnName in TABLE_VALUED_FUNCTIONS) {
                    throw new Error(`Tried to call a table-valued-function as a value function: ${fnName}`);
                }
                throw new Error(`Tried to call a non-existant function (${fnName})`);
            }

            // We need to wrap each function call paramater in try/catch in case
            // we have some function like COALESCE
            const args = node.children.map(c => {
                try {
                    return this.evaluate(row, c, rows);
                } catch (e) {
                    return null;
                }
            });

            try {
                return fn(...args);
            } catch (e) {
                return null;
            }

        }
        case NODE_TYPES.SYMBOL: {
            const id = String(node.id);
            try {
                // resolveValue won't be defined for constant expressions
                // if it is defined then do normal symbol resolution
                if (this.resolveValue instanceof Function) {
                    return this.resolveValue(row, id, rows);
                }

                // We must be in a constant expression
                const const_val = resolveConstant(id);
                if (typeof const_val !== "undefined") return const_val;

                throw new Error(`Symbol detected in Constant Expression: "${node.id}"`);
            } catch (e) {
                // If no symbol in the result set matched then it might be one of these keywords
                if (id.match(KEYWORD_CONSTANTS)) {
                    return id.toUpperCase();
                }

                // if not, rethrow the exception
                throw e;
            }
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
        case NODE_TYPES.OPERATOR: {
            // Special treatment for AND and OR because we don't need to evaluate all
            // operands beforehand
            if (node.id === "AND") {
                return Boolean(this.evaluate(row, node.children[0], rows) && this.evaluate(row, node.children[1], rows));
            }
            if (node.id === "OR") {
                return Boolean(this.evaluate(row, node.children[0], rows) || this.evaluate(row, node.children[1], rows));
            }

            /** @type {(...operands) => string|number|boolean} */
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
            throw Error(`Cannot evaluate ${node.id} clause`);
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

/**
 * Determines whether or not an expression is purely constant.
 * @param {Node} expr
 * @returns {boolean}
 */
function isConstantExpression (expr) {
    if (expr.type === NODE_TYPES.NUMBER ||
        expr.type === NODE_TYPES.STRING)
    {
        return true;
    }

    if (expr.type === NODE_TYPES.FUNCTION_CALL ||
        expr.type === NODE_TYPES.OPERATOR)
    {
        return expr.children.every(c => isConstantExpression(c));
    }

    return false;
}