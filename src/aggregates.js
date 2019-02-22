const { OPERATORS, AGGREGATE_FUNCTIONS } = require('./const');
const { NODE_TYPES } = require('./parser');

const {
  getRowEvaluator,
  rowSorter,
  aggregateValues,
} = require('./evaluate');

module.exports = {
  groupRows,
  populateAggregates,
};

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ResultRow} ResultRow
 */

function populateAggregates(evaluate, cols, rows, groupBy) {
    if (cols.some(node => node && node.id in AGGREGATE_FUNCTIONS && !node.window)) {
        if (rows.length === 0) {
            // Special case for COUNT(*)
            const index = cols.findIndex(n => n.id === "COUNT");
            if (index >= 0) {
                const row = [];
                row[index] = 0;
                rows = [row];
            }
        }
        else {
            if (!groupBy) {
                // If we have aggregate functions but we're not grouping,
                // then apply aggregate functions to whole set
                const aggRow = rows[0];
                aggRow['group'] = rows;
                rows = [
                    aggRow // Single row result set
                ];
            }
            rows = rows.map(row => computeAggregates(evaluate, cols, row['group']));
        }
    }
    return rows;
}

/**
 * Turns a group of rows into one aggregate row
 * @param {(row: ResultRow, node: Node, rows?: ResultRow[]) => any} evaluate
 * @param {Node[]} cols
 * @param {any[][]} rows
 * @return {any[]}
 */
function computeAggregates (evaluate, cols, rows) {
    // If there are no rows (i.e. due to filtering) then
    // just return an empty row.
    if (rows.length === 0) {
        return [];
    }

    // Pick the first row from each group
    const row = rows[0];

    // Fill in aggregate values
    cols.forEach((node, i) => {
        // Ignore non-aggregate values
        // i.e. the ones already filled in
        if (typeof row[i] !== "undefined") {
            return;
        }

        if (node.type === NODE_TYPES.FUNCTION_CALL && !node.window) {
            if (node.id in AGGREGATE_FUNCTIONS) {
                const fn = AGGREGATE_FUNCTIONS[node.id];

                if (node.children.length === 0) {
                    throw new Error(`Function ${node.id} requires at least one paramater.`);
                }

                let filteredRows = rows;

                if (node.filter) {
                    filteredRows = filteredRows.filter(getRowEvaluator(evaluate, node.filter));
                }

                if (node.order) {
                    filteredRows.sort(rowSorter(evaluate, node.order));
                }

                // Aggregate values get special treatment for things like '*' and DISTINCT
                const args = node.children.map(n => aggregateValues(evaluate, filteredRows, n, node.distinct));
                row[i] = fn(...args);
            } else {
                throw new Error("Function not found: " + node.id);
            }
        }
    });

    return row;
}

/**
 * Collapse multiple rows into a single row
 * @param {(row: ResultRow, node: Node, rows?: ResultRow[]) => any} evaluate
 * @param {any[][]} rows
 * @param {Node[]} groupBy
 * @returns {any[]}
 */
function groupRows (evaluate, rows, groupBy) {
    const groupByMap = {};

    for(const row of rows) {
        const key = JSON.stringify(groupBy.map(g => evaluate(row, g, rows)));

        if (!groupByMap[key]) {
            groupByMap[key] = [];
        }

        groupByMap[key].push(row);
    }

    return Object.values(groupByMap).map(rows => {
        // Just pick the first row from each group
        const aggRow = rows[0];

        // Save reference to original rows
        aggRow['group'] = rows;

        return aggRow;
    });
}
