const { queryResultToObjectArray, zip } = require('../util');

const moment = require('moment');
const momentDurationFormatSetup = require('moment-duration-format');
// @ts-ignore
momentDurationFormatSetup(moment);

const { isNullDate, toUTF8Array } = require('../util');

const DAYS_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const VALUE_FUNCTIONS = {
    // Conditional functions
    COALESCE: (...vs) => vs.find(OPERATORS['IS NOT NULL']),

    // Number functions - Also all from Math.*
    RAND: Math.random,
    CAST (v, type, format=undefined) {
        if (/^int|^float|^real/i.test(type) && v instanceof Date) return +v;
        if (/^int/i.test(type)) return parseInt(v);
        if (/^float|^real/i.test(type)) return parseFloat(v);
        if (/^num/i.test(type)) return +v;
        if (/^date$/i.test(type)) return moment(v).utc().format(format);
        return String(v);
    },
    HEX: v => `0x${(+v).toString(16)}`,
    BIN: v => `0b${(+v).toString(2)}`,

    // String functions
    SUBSTR: (v, from, length) => isStrictNull(v) ? null : String(v).substr(from, length),
    REPLACE: (v, from, to) => isStrictNull(v) ? null : String(v).split(from).join(to),
    REVERSE: v => isStrictNull(v) ? null : String(v).split("").reverse().join(""),
    LOWER: v => isStrictNull(v) ? null : String(v).toLowerCase(),
    UPPER: v => isStrictNull(v) ? null : String(v).toUpperCase(),
    CONCAT: (...vs) => vs.join(""),
    CHAR: String.fromCodePoint,
    UNICODE: s => isStrictNull(s) ? null : String(s).codePointAt(0),
    JSON_STRINGIFY: JSON.stringify,
    TO_UTF8_HEX: v => toUTF8Array(v).map(n => n.toString(16).padStart(2, "0")).join(" "),
    LPAD: (v, n, c="") => String(v).padStart(n, c),
    RPAD: (v, n, c="") => String(v).padEnd(n, c),
    TRIM: (v) => isStrictNull(v) ? null : String(v).trim(),

    REGEXP_EXTRACT (value, regexp) {
        try {
            const re = RegExp(regexp);
            const match = re.exec(value);
            return match ? (match[1] || match[0]) : null;
        } catch (e) {
            return null;
        }
    },

    // Date functions
    WEEKDAY: v => DAYS_OF_WEEK[v],
    DATE: d => moment(d).format("YYYY-MM-DD"),
    TIME: d => moment(d).format("HH:mm:ss"),
    DATETIME: d => moment(d).format("YYYY-MM-DD HH:mm:ss"),
    CURRENT_DATE: () => new Date(),
    // @ts-ignore
    DURATION: m => moment.duration(m, "milliseconds").format(),
    DATE_ADD: (date, v, part) => moment(date).add(v, part).toDate(),
    DATE_DIFF: (dateA, dateB, part) => moment(dateA).diff(dateB, part),
    AGE: (date, part) => moment().diff(date, part),
    EXTRACT (part, v) {
        const m = moment(v);
        switch (part) {
            case 'CENTURY':
            case 'CENTURIES': return Math.ceil(m.year() / 100);
            case 'DAY':
            case 'DAYS': return m.date();
            // Should be ceil, no? Postgres uses floor
            case 'DECADE':
            case 'DECADES': return Math.floor(m.year() / 10);
            case 'DOW': return m.day();
            case 'DOY': return m.dayOfYear();
            case 'EPOCH': return Math.floor(+m / 1000);
            case 'HOUR':
            case 'HOURS': return m.hour();
            case 'ISO': return m.toISOString();
            case 'ISODOW': return m.isoWeekday();
            case 'ISOYEAR': return m.isoWeekYear();
            case 'MICROSECOND':
            case 'MICROSECONDS': return m.second() * 1000000 + m.millisecond() * 1000;
            case 'MILLENNIA':
            case 'MILLENNIUM': return Math.ceil(m.year() / 1000);
            case 'MILLISECOND':
            case 'MILLISECONDS': return m.second() * 1000 + m.millisecond();
            case 'MINUTE':
            case 'MINUTES': return m.minute();
            case 'MONTH':
            case 'MONTHS': return m.month() + 1;
            case 'QUARTER':
            case 'QUARTERS': return m.quarter();
            case 'SECOND':
            case 'SECONDS': return m.second() + m.millisecond() / 1000;
            case 'TIMEZONE': return m.utcOffset() * 60;
            case 'TIMEZONE_HOUR': return Math.floor(m.utcOffset() / 60);
            case 'TIMEZONE_MINUTE': return m.utcOffset() % 60;
            case 'WEEK':
            case 'WEEKS': return m.isoWeek();
            case 'WEEKDAY': return DAYS_OF_WEEK[m.day()];
            case 'YEAR':
            case 'YEARS': return m.year();
        }
    },

    // Geo Functions
    /**
     * Haversine formula for calculating distance between two points.
     *
     * Assumes a spherical Earth.
     * @see https://www.movable-type.co.uk/scripts/latlong.html
     * @param {number} lat1 Latitude of first point in degrees
     * @param {number} lon1 Longitude of first point in degrees
     * @param {number} lat2 Latitude of second point in degrees
     * @param {number} lon2 Longitude of second point in degrees
     * @returns {number} Distance in metres
     */
    DISTANCE (lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Mean Earth radius in metres
        const φ1 = toRadians(lat1);
        const φ2 = toRadians(lat2);
        const Δφ = toRadians(lat2-lat1);
        const Δλ = toRadians(lon2-lon1);

        const a =   Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;

        function toRadians (deg) {
            return deg * (Math.PI/180)
        }
    },

    KEYS (v) {
        return Object.keys(v)
    },
};

// Alias
VALUE_FUNCTIONS.TO_CODE_POINT = VALUE_FUNCTIONS.UNICODE;
VALUE_FUNCTIONS.FROM_CODE_POINT = VALUE_FUNCTIONS.CHAR;

// Copy all Math functions
for (const name of Object.getOwnPropertyNames(Math)) {
    if (Math[name] instanceof Function) {
        VALUE_FUNCTIONS[name.toUpperCase()] = Math[name];
    }
}

const AGGREGATE_FUNCTIONS = {
    /** @type {(a: any[]) => number} */
    COUNT: a => a.filter(x => x !== false).length, // Include 0, "", NULL; Exclude false
    /** @type {(a: number[]) => number} */
    SUM: a => a.reduce((total,val) => total + (+val), 0), // Be sure to coerce into number
    /** @type {(a: number[]) => number} */
    AVG: a => AGGREGATE_FUNCTIONS.SUM(a) / a.length,
    /** @type {(a: number[]) => number} */
    MIN: a => Math.min(...a),
    /** @type {(a: number[]) => number} */
    MAX: a => Math.max(...a),
    /** @type {(a: string[], s?: string) => string} */
    LISTAGG: (a,s) => {
        if (Array.isArray(s)) s = s[0];
        return a.join(s);
    },
    /** @type {(a: any[]) => string} */
    JSON_ARRAYAGG: JSON.stringify,
    /** @type {(a: string[], b: any[]) => string} */
    JSON_OBJECTAGG: (a,b) => JSON.stringify(zip(a, b)),
    /** @type {(a: number[]) => number} */
    STDDEV_POP: a => Math.sqrt(AGGREGATE_FUNCTIONS.VAR_POP(a)),
    /** @type {(a: number[]) => number} */
    STDDEV_SAMP: a => Math.sqrt(AGGREGATE_FUNCTIONS.VAR_SAMP(a)),
    /** @type {(a: number[]) => number} */
    VAR_POP: a => VAR_SUM(a) / a.length,
    /** @type {(a: number[]) => number} */
    VAR_SAMP: a => (a.length === 1) ? 0 : VAR_SUM(a) / (a.length - 1),
    /** @type {(a: number[], b: number[]) => number} */
    COVAR_POP (a, b) {
        const meanA = AGGREGATE_FUNCTIONS.AVG(a);
        const meanB = AGGREGATE_FUNCTIONS.AVG(b);
        const avgOfProducts = AGGREGATE_FUNCTIONS.AVG(a.map((_, i) => a[i] * b[i]));
        return avgOfProducts - meanA * meanB;
    },
    /** @type {(a: number[], b: number[]) => number} */
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

/**
 *
 * @param {number[]} a
 */
function VAR_SUM (a) {
    const mean = AGGREGATE_FUNCTIONS.AVG(a);
    return AGGREGATE_FUNCTIONS.SUM(a.map(v => Math.pow(v - mean, 2)));
}

const isStrictNull = a => typeof a === "undefined" || a === null || Number.isNaN(a) || isNullDate(a);
const isNull = a => a === "" || isStrictNull(a);

const OPERATORS = {
    '+': (a,b) => +a + +b,
    '-': (a,b) => +a - +b,
    '*': (a,b) => +a * +b,
    '/': (a,b) => +a / +b,
    /** Concatenate */
    '||': (a,b) => isStrictNull(a) || isStrictNull(b) ? null : `${a}${b}`,
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
    '??': VALUE_FUNCTIONS['COALESCE'],
    'NOT': a => !a,
    'IS NULL': isNull,
    'IS NOT NULL': a => !isNull(a),
    'LIKE': (a,b) => new RegExp("^" + b.replace(/\?/g, ".").replace(/%/g, ".*") + "$").test(a),
    'NOT LIKE': (a,b) => !OPERATORS['LIKE'](a, b),
    'REGEXP': (a,b) => new RegExp(b, "i").test(a),
    'NOT REGEXP': (a,b) => !OPERATORS['REGEXP'](a, b),
    'AND': (a,b) => Boolean(a && b),
    'OR': (a,b) => Boolean(a || b),
    'IN': (v, a) => a.includes(v),
    'NOT IN': (v, a) => !OPERATORS['IN'](v, a),
    'BETWEEN': (x, a, b) => a <= x && x < b,
};

const TABLE_VALUED_FUNCTIONS = {
    /** @type {(start: number, end?: number, step?: number) => { value: number }[]} */
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

    /**
     * Load JSON
     * @type {(url: string) => Promise}
     */
    async LOAD (url) {
        const r = await fetch(url);
        return r.ok ? r.json() : (console.error(`${r.statusText}: ${url}`), null);
    },

    /**
     * Load data from an HTML table
     * @type {(url: string) => Promise}
     */
    async HTML (url) {
        const r = await fetch(url);
        const dom = new DOMParser().parseFromString(await r.text(), "text/html");
        const fragment = new URL(url).hash.replace("#", "") || "1";

        const table = isNumeric(fragment) ? dom.getElementsByTagName("table")[+fragment-1] : dom.getElementById(fragment);

        if (!(table instanceof HTMLTableElement)) {
            throw Error(`Could not find table ${fragment} in ${url}`)
        }

        return queryResultToObjectArray(Array.from(table.getElementsByTagName("tr")).map(tr =>
            Array.from(tr.querySelectorAll("th,td")).map(td => td.textContent)
        ));
    },

    /**
     * Load CSV
     * @type {(url: string) => Promise}
     */
    async CSV (url, skipLines = 0) {
        const r = await fetch(url);
        if (r.ok) {
            const text = await r.text();
            const lines = text.split("\n");
            while (skipLines-- > 0) lines.shift();
            const headerline = lines.shift();
            const headers = parseCSVLine(headerline);

            return lines.map(l => zip(headers, parseCSVLine(l)));
        }

        console.error(`${r.statusText}: ${url}`);
        return null;
    },
};

/**
 * @param {string} line
 */
function parseCSVLine (line) {
    const values = line.split(",");
    return values.map(v => v.replace(/^"|"$/g, "").trim());
}

function isNumeric (n) { return +n == n; }

/** @typedef {import('../..').ResultRow} ResultRow */
/** @typedef {import('../..').Node} Node */
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
        while (OPERATORS["="](values[--index], prevVal)) {}
        return index + 2;
    },

    DENSE_RANK (index, values) {
        let rank = 0;
        let prevVal = values[index];
        while (--index >= 0) {
            if (OPERATORS["!="](values[index], prevVal)) rank++;
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
    },

    MAP (index, values, rows, evaluator, expr) {
        return rows.map(r => evaluator(r, expr));
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
    isStrictNull,
};