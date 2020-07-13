const { NODE_TYPES } = require('../types');
const { comparator } = require('../evaluate/evaluate');
const { isStrictNull } = require('../evaluate/const');

module.exports = {
  sortRows,
};

/**
 * @typedef {import('../..').Node} Node
 * @typedef {import('../..').ResultRow} ResultRow
 */

/**
 * Supposed to be an efficient sorter which aims to avoid evaluating
 * any more than necessary by caching results and bailing as soon as possible
 * @param {any} evaluate
 * @param {ResultRow[]} rows
 * @param {Node[]} orderBy
 */
function sortRows(evaluate, rows, orderBy) {
    // Pre-create ordering value array for each row
    rows.forEach(row => {
        row['orderBy'] = [];
    });

    rows = rows.sort((a, b) => {
        for (let depth = 0; depth < orderBy.length; depth++) {
            const orderNode = orderBy[depth];

            const valA = getOrderingValue(evaluate, a, orderNode, depth);
            const valB = getOrderingValue(evaluate, b, orderNode, depth);

            if (orderNode.nulls === "first") {
                if (isStrictNull(valA) && isStrictNull(valB)) continue;
                if (isStrictNull(valA)) return -1;
                if (isStrictNull(valB)) return 1;
            }
            else if (orderNode.nulls === "last") {
                if (isStrictNull(valA) && isStrictNull(valB)) continue;
                if (isStrictNull(valA)) return 1;
                if (isStrictNull(valB)) return -1;
            }

            const sort = comparator(valA, valB) * (orderNode.desc ? -1 : 1);

            if (sort !== 0) {
                return sort;
            }
        }

        return 0;
    });

    return rows;
}

/**
 * @param {any} evaluate
 * @param {any[]} row
 * @param {Node} parsedOrder
 * @param {ResultRow[]} [rows]
 * @param {number} depth
 */
function getOrderingValue (evaluate, row, parsedOrder, depth, rows=null) {
    let va = row['orderBy'][depth];

    // The first time this row is visited (at this depth) we'll
    // calculate its ordering value.
    if (typeof va === "undefined") {
        let v;

        // If we have a literal number it means we should
        // sort by nth column
        if (parsedOrder.type === NODE_TYPES.NUMBER) {
            // If the column index is less than 0 then count from right.    Column numbers are 1-indexed
            v = row[+parsedOrder.id < 0 ? (row.length + +parsedOrder.id) : (+parsedOrder.id - 1)];
        }
        else {
            v = evaluate(row, parsedOrder, rows);
        }

        if (typeof v === "undefined") {
            throw new Error("Order by unknown column: " + parsedOrder.source);
        }

        // Set value to save resolution next time
        row['orderBy'][depth] = v;
        va = v;
    }

    return va;
}
