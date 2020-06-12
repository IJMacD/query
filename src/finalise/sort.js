const { NODE_TYPES } = require('../types');
const { comparator } = require('../evaluate/evaluate');

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
async function sortRows(evaluate, rows, orderBy) {
    // Pre-create ordering value array for each row
    await rows.map(async row => {
        row['orderBy'] = [];
        for (let depth = 0; depth < orderBy.length; depth++) {
            row['orderBy'][depth] = await getOrderingValue(evaluate, row, orderBy[depth], rows);
        }
    });

    rows = rows.sort((a, b) => {
        for (let depth = 0; depth < orderBy.length; depth++) {
            const orderNode = orderBy[depth];

            const valA = a['orderBy'][depth];
            const valB = b['orderBy'][depth];

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
 */
async function getOrderingValue (evaluate, row, parsedOrder, rows=null) {
    let v;

    // If we have a literal number it means we should
    // sort by nth column
    if (parsedOrder.type === NODE_TYPES.NUMBER) {
        // If the column index is less than 0 then count from right.    Column numbers are 1-indexed
        v = row[+parsedOrder.id < 0 ? (row.length + +parsedOrder.id) : (+parsedOrder.id - 1)];
    }
    else {
        v = await evaluate(row, parsedOrder, rows);
    }

    if (typeof v === "undefined") {
        throw new Error("Order by unknown column: " + parsedOrder.source);
    }

    return v;
}
