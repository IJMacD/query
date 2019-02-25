const { evaluateConstantExpression } = require('./evaluate');

module.exports = {
    applyLimit,
};

function applyLimit(rows, limit, offset) {
    const start = offset ? evaluateConstantExpression(offset) : 0;
    const end = limit ? (start + evaluateConstantExpression(limit)) : rows.length;
    return rows.slice(start, end);
}
