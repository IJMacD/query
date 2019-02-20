const { NODE_TYPES } = require('./parser');
const { comparator } = require('./evaluate');

module.exports = {
  sortRows,
};

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ResultRow} ResultRow
 */

/**
 * Supposed to be an efficient sorter which aims to avoid evaluating
 * any more than necessary by caching results and bailing as soon as possible
 * @param {any} context
 * @param {ResultRow[]} rows
 * @param {Node[]} orderBy
 */
function sortRows({ evaluate, colAlias }, rows, orderBy) {
    // Pre-create ordering value array for each row
    rows.forEach(row => {
        row['orderBy'] = [];
    });

    rows = rows.sort((a, b) => {
        for (let depth = 0; depth < orderBy.length; depth++) {
            const orderNode = orderBy[depth];

            const valA = getOrderingValue({ evaluate, colAlias }, a, orderNode, depth);
            const valB = getOrderingValue({ evaluate, colAlias }, b, orderNode, depth);

            const sort = comparator(valA, valB, orderNode.desc);

            if (sort !== 0) {
                return sort;
            }
        }

        return 0;
    });

    return rows;
}

/**
 * @param {any} context
 * @param {any[]} row
 * @param {Node} parsedOrder
 * @param {ResultRow[]} [rows]
 * @param {number} depth
 */
function getOrderingValue ({ evaluate, colAlias }, row, parsedOrder, depth, rows=null) {
    let va = row['orderBy'][depth];

    // The first time this row is visited (at this depth) we'll
    // calculate its ordering value.
    if (typeof va === "undefined") {
        let v;

        if (parsedOrder.type === NODE_TYPES.NUMBER) {
            // Column numbers are 1-indexed
            v = row[+parsedOrder.id - 1];
        }
        else if (parsedOrder.type === NODE_TYPES.SYMBOL && parsedOrder.id in colAlias) {
            v = row[colAlias[parsedOrder.id]];
        }
        else {
            v = evaluate(row, parsedOrder, rows);
        }

        if (typeof v === "undefined") {
            throw new Error("Order by unknown column: " + parsedOrder.source);
        }

        // Try to coerce into number if possible
        v = isNaN(+v) ? v : +v;

        // Set value to save resolution next time
        row['orderBy'][depth] = v;
        va = v;
    }

    return va;
}
