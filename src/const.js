const moment = require('moment');
const momentDurationFormatSetup = require('moment-duration-format');
// @ts-ignore
momentDurationFormatSetup(moment);

const { isNullDate } = require('./util');

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
    COUNT: a => a.filter(x => x !== false).length, // Include 0, "", NULL; Exclude false
    SUM: a => a.reduce((total,val) => total + (+val), 0), // Be sure to coerce into number
    AVG: a => AGGREGATE_FUNCTIONS.SUM(a) / a.length,
    MIN: a => Math.min(...a),
    MAX: a => Math.max(...a),
    LISTAGG: a => a.join(),
    JSON_ARRAYAGG: VALUE_FUNCTIONS.JSON_STRINGIFY,
    STDDEV_POP: a => Math.sqrt(AGGREGATE_FUNCTIONS.VAR_POP(a)),
    STDDEV_SAMP: a => Math.sqrt(AGGREGATE_FUNCTIONS.VAR_SAMP(a)),
    VAR_POP: a => VAR_SUM(a) / a.length,
    VAR_SAMP: a => (a.length === 1) ? 0 : VAR_SUM(a) / (a.length - 1),
    COVAR_POP (a, b) {
        const meanA = AGGREGATE_FUNCTIONS.AVG(a);
        const meanB = AGGREGATE_FUNCTIONS.AVG(b);
        const avgOfProducts = AGGREGATE_FUNCTIONS.AVG(a.map((_, i) => a[i] * b[i]));
        return avgOfProducts - meanA * meanB;
    },
    COVAR_SAMP (a, b) {
        if (a.length === 1) return 0;
        const meanA = AGGREGATE_FUNCTIONS.AVG(a);
        const meanB = AGGREGATE_FUNCTIONS.AVG(b);
        const sumOfProducts = AGGREGATE_FUNCTIONS.SUM(a.map((_, i) => a[i] * b[i]));
        return (sumOfProducts / (a.length - 1)) - meanA * meanB;
    },
};

/* Alias */
AGGREGATE_FUNCTIONS.STDDEV = AGGREGATE_FUNCTIONS.STDDEV_SAMP;

function VAR_SUM (a) {
    const mean = AGGREGATE_FUNCTIONS.AVG(a);
    return AGGREGATE_FUNCTIONS.SUM(a.map(v => Math.pow(v - mean, 2)));
}

const OPERATORS = {
    '+': (a,b) => +a + +b,
    '-': (a,b) => +a - +b,
    '*': (a,b) => +a * +b,
    '/': (a,b) => +a / +b,
    /** Concatenate */
    '||': (a,b) => `${a}${b}`,
    /** Compares two values to see if they are equal by collation rules */
    '=' (a,b) {
        if (typeof a !== typeof b) return false;

        if (typeof a === "object") {
            // Assume it is like a date and try to compare numerically
            return +a === +b;
        }

        return a === b;
    },
    '!=': (a,b) => !OPERATORS['='](a, b),
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
    'IN': (v, a) => a.includes(v),
    'NOT IN': (v, a) => !OPERATORS['IN'](v, a),
};

const TABLE_VALUED_FUNCTIONS = {
    RANGE (start, end=undefined, step=1) {
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

/** @typedef {import('./query').ResultRow} ResultRow */
/** @typedef {import('./parser').Node} Node */
/** @typedef {(index: number, values: number[], rows?: ResultRow[], executor?: (row: ResultRow, node: Node) => any, ...other: any) => any} WindowFunction */

/**
 * @type {{ [name: string]: WindowFunction }}
 */
const WINDOW_FUNCTIONS = {
    ROW_NUMBER (index) {
        return index + 1;
    },

    RANK (index, values) {
        let prevVal = values[index];
        while (values[--index] === prevVal) {}
        return index + 2;
    },

    DENSE_RANK (index, values) {
        let rank = 0;
        let prevVal = values[index];
        while (--index >= 0) {
            if (values[index] !== prevVal) rank++;
            prevVal = values[index];
        }
        return rank + 1;
    },

    PERCENT_RANK (index, values) {
        if (values.length === 1) return 0;
        return (WINDOW_FUNCTIONS.RANK(index, values) - 1) / (values.length - 1);
    },

    CUME_DIST (index, values) {
        const n = values[index];
        const cum = values.filter(v => v <= n).length;
        return cum / values.length;
    },

    NTILE (index, values, rows, evaluator, nExpr) {
        const n = evaluator(rows[index], nExpr);
        const bucketSize = values.length / n;
        return Math.floor(index / bucketSize) + 1;
    },

    LAG (index, values, rows, evaluator, expr, offsetExpr = 1) {
        const offset = (typeof offsetExpr === "number") ? offsetExpr : Number(evaluator(rows[index], offsetExpr));
        return rowValue(index - offset, rows, evaluator, expr);
    },

    LEAD (index, values, rows, evaluator, expr, offsetExpr = 1) {
        const offset = (typeof offsetExpr === "number") ? offsetExpr : Number(evaluator(rows[index], offsetExpr));
        return rowValue(index + offset, rows, evaluator, expr);
    },

    FIRST_VALUE (index, values, rows, evaluator, expr) {
        return evaluator(rows[0], expr);
    },

    LAST_VALUE (index, values, rows, evaluator, expr) {
        return evaluator(rows[rows.length - 1], expr);
    },

    NTH_VALUE (index, values, rows, evaluator, expr, nExpr) {
        const n = (typeof nExpr === "number") ? nExpr : Number(evaluator(rows[index], nExpr));
        return rowValue(n - 1 /* 1 based indexing */, rows, evaluator, expr);
    },

    CUME_SUM (index, values) {
        const n = values[index];
        return AGGREGATE_FUNCTIONS.SUM(values.filter(v => v <= n));
    },

    CUME_FRAC (index, values) {
        const val = WINDOW_FUNCTIONS.CUME_SUM(index, values);
        return val / AGGREGATE_FUNCTIONS.SUM(values);
    },

    PERCENTILE_DISC (index, values, rows, evaluator, nExpr) {
        const n = (typeof nExpr === "number") ? nExpr : Number(evaluator(rows[index], nExpr));
        const i = values.findIndex((v,i) => WINDOW_FUNCTIONS.CUME_DIST(i, values) > n);
        return values[i];
    },

    PERCENTILE_CONT (index, values, rows, evaluator, nExpr) {
        const n = (typeof nExpr === "number") ? nExpr : Number(evaluator(rows[index], nExpr));
        const i = values.findIndex((v,i) => WINDOW_FUNCTIONS.CUME_DIST(i, values) > n);
        const valA = values[i - 1];
        const distA = WINDOW_FUNCTIONS.CUME_DIST(i - 1, values);
        const valB = values[i];
        const distB = WINDOW_FUNCTIONS.CUME_DIST(i, values);
        const t = 1 - (distB - n) / (distB - distA);
        return valA + t * (valB - valA);
    },

    FREQ (index, values) {
        const n = values[index];
        return values.filter(v => v === n).length / values.length;
    }
}

/**
 * Adds index bounds check before evaluating
 * @param {number} index
 * @param {ResultRow[]} rows
 * @param {(row: ResultRow, expr: Node) => any} evaluator
 * @param {Node} expr
 */
function rowValue (index, rows, evaluator, expr) {
    if (index < 0 || index >= rows.length) return null;
    return evaluator(rows[index], expr);
}

module.exports = {
    VALUE_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
    OPERATORS,
    TABLE_VALUED_FUNCTIONS,
    WINDOW_FUNCTIONS,
};