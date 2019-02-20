const {
    NODE_TYPES,
    OPERATORS,
    VALUE_FUNCTIONS,
    WINDOW_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
} = require('./const');

const {
    isValidDate,
} = require('./util');

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ParsedTable} ParsedTable
 * @typedef {import('../types').WindowSpec} WindowSpec
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').QueryCallbacks} QueryCallbacks
 * @typedef {import('../types').QueryContext} QueryContext
 */

export class SymbolError extends Error { }

export function getEvaluator ({ resolveValue, userFunctions, windows }) {

    return evaluator;

    /**
    * Execute an expresion from AST nodes
    * @param {ResultRow} row
    * @param {Node} node
    * @param {ResultRow[]} [rows]
    */
    function evaluator(row, node, rows=null) {
        if (node.type === NODE_TYPES.FUNCTION_CALL) {
            const fnName = node.id;

            // First check if we're evaluating a window function
            if (node.window) {
                let group;
                const window = typeof node.window === "string" ? windows[node.window] : node.window;

                if (window.partition) {
                    const partitionVal = evaluator(row, window.partition, rows);
                    group = rows.filter(r => OPERATORS['='](evaluator(r, window.partition, rows), partitionVal));
                } else {
                    group = [ ...rows ];
                }

                const index = group.indexOf(row);

                if (window.order) {
                    group.sort(rowSorter(evaluator, window.order));

                    if (window.frameUnit === "rows") {
                        const start = Math.max(index - window.preceding, 0);
                        group = group.slice(start, index + window.following + 1);

                    } else if (window.frameUnit === "range") {
                        const currentVal = evaluator(row, window.order, rows);
                        const min = currentVal - window.preceding;
                        const max = currentVal + window.following;

                        group = group.filter(r => {
                            const v = evaluator(r, window.order, rows);
                            return min <= v && v <= max;
                        });
                    }
                } else if (window.frameUnit) {
                    throw Error("Frames can only be specified with an ORDER BY clause");
                }

                if (node.id in WINDOW_FUNCTIONS) {
                    if (!window.order) {
                        throw Error("Window functions require ORDER BY in OVER clause");
                    }

                    const fn = WINDOW_FUNCTIONS[node.id];
                    const orderVals = aggregateValues(evaluator, group, window.order, node.distinct);
                    return fn(index, orderVals, group, evaluator, ...node.children);
                }

                if (node.id in AGGREGATE_FUNCTIONS) {
                    if (node.children.length === 0) {
                        throw new Error(`Function ${node.id} requires at least one paramater.`);
                    }

                    const fn = AGGREGATE_FUNCTIONS[node.id];
                    // Aggregate values could have '*' as the node
                    // so they get run through a special function first
                    const args = node.children.map(n => aggregateValues(evaluator, group, n, node.distinct));
                    return fn(...args);
                }

                throw Error(`${node.id} is not a window function`);
            }

            if (fnName in AGGREGATE_FUNCTIONS) {
                // Don't evaluate aggregate functions until after grouping
                if (row['group']) {
                    const fn = AGGREGATE_FUNCTIONS[fnName];
                    return fn(aggregateValues(evaluator, row['group'], node.children[0]));
                }
                return;
            }

            const fn = userFunctions[fnName] || VALUE_FUNCTIONS[fnName];

            if (!fn) {
                throw new Error(`Tried to call a non-existant function (${fnName})`);
            }

            const args = node.children.map(c => evaluator(row, c, rows));

            try {
                return fn(...args);
            } catch (e) {
                return null;
            }

        } else if (node.type === NODE_TYPES.SYMBOL) {
            const val = resolveValue(row, String(node.id), rows);

            if (typeof val === "undefined") {
                // We must throw a SymbolError so that e.g. filterRows() can catch it
                throw new SymbolError("Unable to resolve symbol: " + node.id);
            }

            return val;
        } else if (node.type === NODE_TYPES.STRING) {
            // We need to check for date here and convert if necessary
            if (/^\d{4}-\d{2}-\d{2}/.test(String(node.id))) {
                const d = new Date(node.id);
                if (isValidDate(d)) {
                    return d;
                }
            }

            return String(node.id);
        } else if (node.type === NODE_TYPES.NUMBER) {
            return +node.id;
        } else if (node.type === NODE_TYPES.KEYWORD) {
            // Pass keywords like YEAR, SECOND, INT, FLOAT as strings
            return String(node.id);
        } else if (node.type === NODE_TYPES.OPERATOR) {
            const op = OPERATORS[node.id];

            if (!op) {
                throw new Error(`Unsupported operator '${node.id}'`);
            }

            return op(...node.children.map(c => evaluator(row, c, rows)));
        } else if (node.type === NODE_TYPES.CLAUSE
            && (node.id === "WHERE" || node.id === "ON")
        ) {
            if (node.children.length > 0) {
                return Boolean(evaluator(row, node.children[0], rows));
            } else {
                throw new Error(`Empty predicate clause: ${node.id}`);
            }
        } else {
            throw new Error(`Can't execute node type ${node.type}: ${node.id}`);
        }
    }
}

/**
 * Creates a row evaluator (suitable for use in .map() or .filter())
 * which turns SymbolErrors into nulls
 * @param {Node} node
 * @param {ResultRow[]} rows
 * @returns {(row: ResultRow) => any}
 */
export function getRowEvaluator(evaluator, node, rows=null) {
    return row => {
        try {
            return evaluator(row, node, rows);
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

/**
 * Map rows to values following the rules for aggregate functions.
 * @param {ResultRow[]} rows
 * @param {Node} expr
 * @param {boolean} distinct
 * @returns {any[]}
 */
export function aggregateValues (evaluator, rows, expr, distinct = false) {
    // COUNT(*) includes all rows, NULLS and all
    // we don't need to evaluate anything and can just bail early
    if (expr.id === "*") {
        return rows.map(r => true);
    }

    let values = rows.map(getRowEvaluator(evaluator, expr));

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
 * Generate a comparator for the purpose of sorting
 * @param {Node} order
 * @param {ResultRow[]} [rows]
 * @returns {(a: ResultRow, b: ResultRow) => number}
 */
export function rowSorter(evaluator, order, rows=null) {
    return (ra, rb) => comparator(evaluator(ra, order, rows), evaluator(rb, order, rows), order.desc);
}
/**
 * Compares two values of the same type
 * @param {any} a
 * @param {any} b
 * @param {boolean} desc
 */
export function comparator (a, b, desc) {
    let sort = (Number.isFinite(a) && Number.isFinite(b)) ?
        (a - b) :
        String(a).localeCompare(b);

    return sort * (desc ? -1 : 1);
}