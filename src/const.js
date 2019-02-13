const moment = require('moment');
const momentDurationFormatSetup = require('moment-duration-format');
// @ts-ignore
momentDurationFormatSetup(moment);

const { isNullDate } = require('./util');

const CLAUSES = ["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT", "GROUP BY", "OFFSET", "HAVING", "EXPLAIN" ];
const CONDITION_REGEX = /([^\s]*)\s*([!=><]+|IS(?: NOT)? NULL|(?:NOT )?LIKE |(?:NOT )?REGEXP )(.*)/i;
const FUNCTION_REGEX = /^([a-z_]+)\(([^)]*)\)$/i;

const VALUE_FUNCTIONS = {
    'WEEKDAY': v => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][v],
    'RAND': Math.random,
    'CONCAT': (...vs) => vs.join(""),
    'CHAR': String.fromCodePoint,
    'UNICODE': s => s.codePointAt(0),
    'DATE': d => moment(d).format("YYYY-MM-DD"),
    'TIME': d => moment(d).format("HH:mm:ss"),
    'DATETIME': d => moment(d).format("YYYY-MM-DD HH:mm:ss"),
    // @ts-ignore
    'DURATION': m => moment.duration(m, "milliseconds").format(),
    'JSON_STRINGIFY': JSON.stringify,
    'DATEADD': (part, v, date) => moment(date).add(v, part).toDate(),

    EXTRACT (part, v) {
        const m = moment(v);
        switch (part) {
            case 'CENTURY': return Math.ceil(m.year() / 100);
            case 'DAY': return m.date();
            case 'DECADE': return Math.floor(m.year() / 10);
            case 'DOW': return m.day();
            case 'DOY': return m.dayOfYear();
            case 'EPOCH': return Math.floor(+m / 1000);
            case 'HOUR': return m.hour();
            case 'ISODOW': return m.isoWeekday();
            case 'ISOYEAR': return m.isoWeekYear();
            case 'MICROSECONDS': return m.second() * 1000000 + m.millisecond() * 1000;
            case 'MILLENNIUM': return Math.ceil(m.year() / 1000);
            case 'MILLISECONDS': return m.second() * 1000 + m.millisecond();
            case 'MINUTE': return m.minute();
            case 'MONTH': return m.month() + 1;
            case 'QUARTER': return m.quarter();
            case 'SECOND': return m.second() + m.millisecond() / 1000;
            case 'TIMEZONE': return m.utcOffset() * 60;
            case 'TIMEZONE_HOUR': return Math.floor(m.utcOffset() / 60);
            case 'TIMEZONE_MINUTE': return m.utcOffset() % 60;
            case 'WEEK': return m.isoWeek();
            case 'YEAR': return m.year();
        }
    },

    CAST (v, type) {
        if (/^int/i.test(type)) return parseInt(v);
        if (/^float|^real/i.test(type)) return parseFloat(v);
        if (/^num/i.test(type)) return +v;
        return String(v);
    }
};

const AGGREGATE_FUNCTIONS = {
    'COUNT': a => a.filter(x => x !== false).length, // Include 0, "", NULL; Exclude false
    'SUM': v => v.reduce((total,val) => total + (+val), 0), // Be sure to coerce into number
    'AVG': v => AGGREGATE_FUNCTIONS.SUM(v) / v.length,
    'MIN': v => Math.min(...v),
    'MAX': v => Math.max(...v),
    'LISTAGG': v => v.join(),
    'JSON_ARRAYAGG': VALUE_FUNCTIONS.JSON_STRINGIFY,
};

const OPERATORS = {
    '+': (a,b) => +a + +b,
    '-': (a,b) => +a - +b,
    '*': (a,b) => +a * +b,
    '/': (a,b) => +a / +b,
    '||': (a,b) => `${a}${b}`, // concatenate
    '=': (a,b) => a == b,
    '!=': (a,b) => a != b,
    '<': (a,b) => a < b,
    '>': (a,b) => a > b,
    '<=': (a,b) => a <= b,
    '>=': (a,b) => a >= b,
    '%': (a,b) => a % b,
    'NOT': a => !a,
    'IS NULL': a => typeof a === "undefined" || a === null || a === "" || Number.isNaN(a) || isNullDate(a),
    'IS NOT NULL': a => !OPERATORS['IS NULL'](a),
    'LIKE': (a,b) => new RegExp("^" + b.replace(/\?/g, ".").replace(/%/g, ".*") + "$").test(a),
    'NOT LIKE': (a,b) => !OPERATORS['LIKE'](a, b),
    'REGEXP': (a,b) => new RegExp(b, "i").test(a),
    'NOT REGEXP': (a,b) => !OPERATORS['REGEXP'](a, b),
    'AND': (a,b) => a && b,
    'OR': (a,b) => a || b,
};

const TABLE_VALUED_FUNCTIONS = {
    RANGE: (start, end=undefined, step=1) => {
        if (typeof end === "undefined") {
            end = start;
            start = 0;
        }
        const diff = Math.abs(end - start);
        step = Math.abs(step);
        const count = Math.ceil(diff / step);

        return start < end ?
            Array(count).fill(0).map((n,i) => ({ value: start + i * step })) :
            Array(count).fill(0).map((n,i) => ({ value: start - i * step }));
    },
};

module.exports = {
    CLAUSES,
    CONDITION_REGEX,
    FUNCTION_REGEX,
    VALUE_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
    OPERATORS,
    TABLE_VALUED_FUNCTIONS,
};