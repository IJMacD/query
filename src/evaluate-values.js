module.exports = evaluateValues;

const { evaluateConstantExpression } = require('./evaluate');

/** @typedef {import('..').Node} Node */

/**
 * Evaluate VALUES clause
 * @param {Node[]} values
 */
function evaluateValues (values) {
    const firstRow = values[0];

    if (!firstRow) {
        return [];
    }

    const width = firstRow.children.length;
    const headers = Array(width).fill(0).map((_, i) => `Col ${i + 1}`);

    const out = values.map(row => row.children.map(evaluateConstantExpression));

    out.unshift(headers);

    return out;
}