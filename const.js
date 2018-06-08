const { isNullDate } = require('./util');

const CLAUSES = ["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT", "GROUP BY", "OFFSET", "HAVING" ];
const CONDITION_REGEX = /([^\s]*)\s*([!=><]+|IS(?: NOT)? NULL|(?:NOT )?LIKE |(?:NOT )?REGEXP )(.*)/i;
const FUNCTION_REGEX = /^([a-z_]+)\(([^)]+)\)$/i;

const AGGREGATE_FUNCTIONS = {
    'COUNT': a => a.length,
    'SUM': v => v.reduce((total,val) => total + (+val), 0), // Be sure to coerce into number
    'AVG': v => AGGREGATE_FUNCTIONS.SUM(v) / v.length,
    'MIN': v => Math.min(...v),
    'MAX': v => Math.max(...v),
    'LISTAGG': v => v.join(),
};

const OPERATORS = {
    '=': (a,b) => a == b,
    '!=': (a,b) => a != b,
    '<': (a,b) => a < b,
    '>': (a,b) => a > b,
    '<=': (a,b) => a <= b,
    '>=': (a,b) => a >= b,
    'IS NULL': a => typeof a === "undefined" || a === null || a === "" || Number.isNaN(a) || isNullDate(a),
    'IS NOT NULL': a => !OPERATORS['IS NULL'](a),
    'LIKE': (a,b) => new RegExp("^" + b.replace(/\?/g, ".").replace(/%/g, ".*") + "$").test(a),
    'NOT LIKE': (a,b) => !OPERATORS['LIKE'](a, b),
    'REGEXP': (a,b) => new RegExp(b, "i").test(a),
    'NOT REGEXP': (a,b) => !OPERATORS['REGEXP'](a, b),
};

module.exports = {
    CLAUSES,
    CONDITION_REGEX,
    FUNCTION_REGEX,
    AGGREGATE_FUNCTIONS,
    OPERATORS,
};