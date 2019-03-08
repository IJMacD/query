const { evaluateConstantExpression, isConstantExpression } = require('./evaluate');

module.exports = {
    applyLimit,
};

function applyLimit(rows, limit, offset) {
    if (typeof limit !== "undefined" && !isConstantExpression(limit)) {
        throw new Error(`LIMIT must be a constant expression: ${limit.source}`);
    }
    if (typeof offset !== "undefined" && !isConstantExpression(offset)) {
        throw new Error(`OFFSET must be a constant expression: ${offset.source}`);
    }
    const start = offset ? evaluateConstantExpression(offset) : 0;
    const end = limit ? (start + evaluateConstantExpression(limit)) : rows.length;
    return rows.slice(start, end);
}
