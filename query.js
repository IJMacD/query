const moment = require('moment');

module.exports = runQuery;

const CLAUSES = ["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT", "GROUP BY", "OFFSET", "HAVING" ];
const CONDITION_REGEX = /(.*)([!=><]+|IS(?: NOT)? NULL|(?:NOT )?LIKE |(?:NOT )?REGEXP )(.*)/i;
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
    'IS NULL': a => a === null || a === "" || Number.isNaN(a) || isNullDate(a),
    'IS NOT NULL': a => !OPERATORS['IS NULL'](a),
    'LIKE': (a,b) => new RegExp("^" + b.replace(/\?/g, ".").replace(/%/g, ".*") + "$").test(a),
    'NOT LIKE': (a,b) => !OPERATORS['LIKE'](a, b),
    'REGEXP': (a,b) => new RegExp(b, "i").test(a),
    'NOT REGEXP': (a,b) => !OPERATORS['REGEXP'](a, b),
};

let loggedIn = false;

/**
 * Break a flat text SQL query into its clauses
 * @param {string} query
 * @return {{ from?: string, select?: string, where?: string, ["order by"]?: string, limit?: string, ["group by"]?: string, [clause: string]: string }}
 */
function parseQuery (query) {

    const parts = CLAUSES
        .map(clause => ({ clause, start: query.indexOf(clause) }))
        .filter(o => o.start != -1)
        .sort((a,b) => a.start - b.start);

    const parsed = {};

    for(let i = 0; i < parts.length; i++) {
        const { clause, start } = parts[i];
        const end = i < parts.length - 1 ? parts[i+1].start : query.length;
        parsed[clause.toLowerCase()] = query.substring(start + clause.length, end).trim();
    }

    return parsed;
}

/**
 * Parse a where clause into a tree
 * @param {string} where
 */
function parseWhere (where) {
    if (!where) {
        return;
    }

    const whereParts = where.split("AND");

    const out = {
        type: "AND",
        children: [],
    };

    whereParts.forEach(part => {
        const match = part.match(CONDITION_REGEX);
        if (!match) {
            throw new Error(`Unrecognised WHERE/HAVING clause: \`${part}\``);
        }

        out.children.push({
            type: "OPERATOR",
            operator: match[2].trim(),
            operand1: match[1].trim(),
            operand2: match[3].trim(),
        });
    });

    return out;
}

async function runQuery (query) {
    await iL.init({ API_ROOT: process.env.API_ROOT });

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    const parsedQuery = parseQuery(query);

    // console.log(parsedQuery);

    if (!parsedQuery.from && !parsedQuery.select) {
        throw new Error("You must specify FROM or SELECT");
    }

    if (!parsedQuery.select) {
        // Default to selecting all scalar values
        parsedQuery.select = "*";
    }

    const cols = parsedQuery.select.split(",").map(s => s.trim());
    const parsedTables = parsedQuery.from && parsedQuery.from.split(",").map(s => s.trim());
    const table = parsedTables && parsedTables[0];
    const where = parsedQuery.where;
    const parsedWhere = parseWhere(where);
    const having = parsedQuery.having;
    const parsedHaving = parseWhere(having);
    // console.log(parsedWhere);
    const orderBy = parsedQuery['order by'];
    const groupBy = parsedQuery['group by'];

    /** @type {Array} */
    let results;

    if (table === "Tutor") {
        if (parsedWhere) {
            for (let child of parsedWhere.children){
                const resolved2 = resolveConstant(child.operand2);
                if (child.operand1 === "name" && child.operator === "=") {
                    results = [await iL.Tutor.find(resolved2)];
                    break;
                }
                if (child.operand1 === "id" && child.operator === "=") {
                    results = [iL.Tutor.get(resolved2)];
                    break;
                }
            }
        }
        if (!results) {
            results = await iL.Tutor.all();
        }
    } else if (table === "Lesson" || table === "Attendance") {
        let start;
        let end;
        let needsLogin = false;
        let tutor;

        if (parsedWhere) {
            for (const child of parsedWhere.children) {
                const resolved2 = resolveConstant(child.operand2);
                if (child.operand1 === "start" || child.operand1 == "end")  {
                    if (child.operator === ">" || child.operator === ">=" || child.operator === "=") {
                        start = moment(new Date(resolved2)).startOf("day").toDate();
                        child.operand2 = start;
                    } else if (child.operator === "<" || child.operator === "<=" || child.operator === "=") {
                        end = moment(new Date(resolved2)).endOf("day").toDate();
                        child.operand2 = end;
                    }
                }
                else if (child.operand1.startsWith("attendees")) {
                    needsLogin = true;
                }
                else if (child.operand1 === "tutor.id" && child.operator === "=") {
                    tutor = iL.Tutor.get(resolved2);
                }
                else if (child.operand1 === "tutor.name" && child.operator === "=") {
                    tutor = await iL.Tutor.find(resolved2);
                }
            }
        }

        if (!start) { start = new Date(); }
        if (!end) { end = start; }

        if (!loggedIn && (
                needsLogin ||
                cols.some(c => c.includes("attendees")) ||
                groupBy && groupBy.includes("attendees") ||
                orderBy && orderBy.includes("attendees") ||
                table === "Attendance"
            )
        ) {
            // If we are going to do anything with attendees, we need to be logged in
            await iL.login(process.env.IL_USER, process.env.IL_PASS);
            loggedIn = true;
        }

        results = await iL.Lesson.find({ start, end, tutor });

        if (table === "Attendance") {
            // Convert Lessons into Attendances
            // (Re-use all of Lesson searching logic)
            const newResults = [];
            for (const lesson of results) {
                newResults.push(...lesson.attendees);
            }
            results = newResults;
        }
    } else if (table === "Course") {
        let title;
        let tutor;
        if (parsedWhere) {
            for (let child of parsedWhere.children){
                const resolved2 = resolveConstant(child.operand2);
                if (child.operand1 === "title" && child.operator === "=") {
                    title = resolved2;
                    break;
                }
                if (child.operand1 === "tutor.id" && child.operator === "=") {
                    tutor = iL.Tutor.get(resolved2);
                    break;
                }
                if (child.operand1 === "tutor.name" && child.operator === "=") {
                    tutor = await iL.Tutor.find(resolved2);
                    break;
                }
            }
        }
        results = await iL.Course.find({ title, tutor });
    } else if (table === "Room") {
        results = await iL.Room.all();
    } else if (table === "Term") {
        results = await iL.Term.all();
    } else if (table === "User") {
        results = await iL.User.all();
    } else if (typeof table === "undefined") {
        // If there is no table specified create one token row
        // so that we can return constants etc.
        results = [[]];
    } else {
        throw new Error("Table not recognised: `" + table + "`");
    }

    const colNames = [];
    const colHeaders = [];
    const colAlias = {};
    const joins = [];

    if (results) {

        /******************
         * Joins
         *****************/

        // Explicitly list join connections
        if (results.length > 0) {
            const result = results[0];

            parsedTables.forEach((join, i) => {
                if (i === 0) {
                    joins.push("");
                    return;
                }

                const [ table, on ] = join.split("ON").map(s => s.trim());

                const t = table.toLowerCase();

                if (on) {
                    joins.push(on);
                } else {
                    const path = findPath(result, t);

                    if (typeof path === "undefined") {
                        throw new Error("Unable to join: " + t);
                    }

                    joins.push(path);
                }
            });
        }

        /******************
         * Columns
         ******************/

        for (const c of cols) {
            // Special Treatment for *
            if (c === "*") {
                if (results.length === 0) {
                    // We don't have any results so we can't determine the cols
                    colNames.push(c);
                    colHeaders.push(c);
                    continue;
                }

                const r = results[0];

                // only add "primitive" columns
                let newCols = Object.keys(r).filter(k => formatCol(r[k]));

                colNames.push(...newCols);
                colHeaders.push(...newCols);

                // Add all the scalar columns for secondary tables
                for (let i = 1; i < joins.length; i++) {
                    const j = joins[i];

                    const tableObj = resolvePath(r, j);

                    if (!tableObj) {
                        throw Error("Problem with join: " + j);
                    }

                    // only add "primitive" columns
                    let newCols = Object.keys(tableObj).filter(k => formatCol(tableObj[k]));

                    colNames.push(...newCols.map(c => `${j}.${c}`));
                    colHeaders.push(...newCols);
                }
            } else {
                const [ c1, alias ] = c.split(" AS ");
                colNames.push(c1);
                colHeaders.push(alias || c1);

                if (alias && typeof colAlias[alias] !== "undefined") {
                    throw new Error("Alias already in use: " + alias);
                }

                colAlias[alias || c1] = colNames.length - 1;
            }

            colHeaders.forEach((col, i) => {
                if (typeof colAlias[col] === "undefined") {
                    colAlias[col] = i;
                }
            });
        }

        output(colHeaders);
        output(colHeaders.map(c => repeat("-", c.length)));

        /***************
         * Filtering
         ***************/
        if (parsedWhere) {
            for (const child of parsedWhere.children) {
                const compare = OPERATORS[child.operator];
                if (!compare) {
                    throw new Error("Unrecognised operator: " + child.operator);
                }

                results = results.filter(r => {
                    const a = resolveValue(r, child.operand1);
                    const b = resolveValue(r, child.operand2);
                    return compare(a, b);
                });
            }
        }

        /*****************
         * Column Values
         *****************/
        let rows = results.map(r => {
            const values = colNames.map(col => {
                if (FUNCTION_REGEX.test(col)) {
                    // Don't compute aggregate functions until after grouping
                    return null;
                }
                return resolveValue(r, col);
            });

            // Save reference to original object for sorting
            values['result'] = r;

            return values;
        });

        /*************
         * Grouping
         *************/
        if (groupBy) {
            const parsedGroupBy = groupBy.split(",").map(s => s.trim());
            rows = groupRows(rows, parsedGroupBy);
        }

        /**********************
         * Aggregate Functions
         *********************/
        // Now see if there are any aggregate functions to apply
        if (colNames.some(c => FUNCTION_REGEX.test(c))) {
            if (!groupBy) {
                // If we have aggregate functions but we're not grouping,
                // then apply aggregate functions to whole set
                const aggRow = rows[0];
                aggRow['group'] = rows;

                rows = [
                    aggRow // Single row result set
                ];
            }

            rows = rows.map(row => computeAggregates(row['group'], colNames));
        }

        /*******************
         * Having Filtering
         ******************/
        if (parsedHaving) {
            for (const child of parsedHaving.children) {
                const compare = OPERATORS[child.operator];
                if (!compare) {
                    throw new Error("Unrecognised operator: " + child.operator);
                }

                rows = rows.filter(r => {
                    // Having clause can only use constants, result-set columns or aggregate functions
                    // We don't have access to original `result` objects
                    let a = resolveHavingValue(r, child.operand1);
                    let b = resolveHavingValue(r, child.operand2);

                    return compare(a, b);
                });
            }
        }

        /****************
         * Sorting
         ***************/
        if (orderBy) {
            // Parse the orderBy clause into an array of objects
            const parsedOrders = orderBy.split(",").map(order => {
                const [ col, asc_desc ] = order.split(" ");
                const desc = asc_desc === "DESC" ? -1 : 1;

                // Simplest case: col is actually a column index
                let colNum = parseInt(col);

                // If it's not a column index, check if its a named column in selection
                if (isNaN(colNum) && typeof colAlias[col] !== "undefined") {
                    colNum = colAlias[col]
                }

                return { colNum, col, desc };
            });

            // Pre-create ordering value array for each row
            rows.forEach(row => {
                row['orderBy'] = [];
            });

            rows = rows.sort((a,b) => {
                for (let i = 0; i < parsedOrders.length; i++) {
                    const o = parsedOrders[i];

                    const va = getOrderingValue(a, o, i);
                    const vb = getOrderingValue(b, o, i);

                    let sort = (Number.isFinite(va) && Number.isFinite(vb)) ?
                        (va - vb) :
                        (va < vb ? -1 : va > vb ? 1 : 0);

                    if (sort !== 0) {
                        sort *= o.desc;

                        return sort;
                    }

                }

                return 0;
            });
        }

        /******************
         * Limit and Offset
         ******************/
        if (parsedQuery.limit || parsedQuery.offset) {
            const start = parseInt(parsedQuery.offset) || 0;
            const end = start + parseInt(parsedQuery.limit) || rows.length;
            rows = rows.slice(start, end);
        }

        /*****************
         * Output
         ****************/
        rows.forEach(r => output(r.map(formatCol)));

        return output_buffer;
    }

    /**
     * Traverse a sample object to determine absolute path to given name
     * Uses explicit join list.
     * @param {any} result
     * @param {string} name
     * @returns {string}
     */
    function findPath (result, name) {
        for (const prefix of joins) {
            const path = prefix ? `${prefix}.${name}` : name;

            // Check if the parent object has a property matching
            // the secondary table i.e. Tutor => result.tutor
            if (typeof resolvePath(result, path) !== "undefined") {
                return path;
            }
        }
    }

    /**
     * Returns a string or a number if the value is a constant.
     * Returns undefined otherwise.
     * @param {string} str
     * @returns {string|number}
     */
    function resolveConstant (str) {
        if (!str) { // null, undefined, ""
            return; // undefined
        }

        // Check for quoted string
        if ((str.startsWith("'") && str.endsWith("'")) ||
        (str.startsWith('"') && str.endsWith('"'))) {
            return str.substring(1, str.length-1);
        }

        // Check for numbers
        if (!isNaN(+str)) {
            return +str;
        }

        return; // undefined
    }

    /**
     * Resolve a col into a concrete value (constant or from object)
     * @param {any} result
     * @param {string} col
     */
    function resolveValue (result, col) {
        // Check for constant values first
        const constant = resolveConstant(col);

        if (typeof constant !== "undefined") {
            return constant;
        }

        // If row is null, there's nothing left we can do
        if (result === null) {
            return;
        }

        // Now for the real column resolution
        // We will try each of the tables in turn
        for (let i = 0; i < joins.length; i++) {
            const prefix = i === 0 ? "" : joins[i] + ".";

                                    // Resolve a possible alias
            const colName = prefix + (colNames[colAlias[col]] || col);
            // Prefix needs to be added even to aliases as colNames are
            // not necessarily fully resolved.

            const val = resolvePath(result, colName);

            if (typeof val !== "undefined") {
                return val;
            }
        }

        return null;
    }

    /**
     * Traverse a dotted path to resolve a deep value
     * @param {any} result
     * @param {string} path
     * @returns {any}
     */
    function resolvePath(result, path) {
        // resolve path
        let val = result;
        for (const name of path.split(".")) {
            val = val[name];
            if (typeof val === "undefined") {
                val = null;
                break;
            }
        }
        if (val !== null && typeof val !== "undefined") {
            return val;
        }

        return; // undefined
    }

    function resolveHavingValue (row, col) {

        const la = row[colAlias[col]];

        if (typeof la !== "undefined") {
            // Convert to number if possible
            return !isNaN(+la) ? +la : la;
        }

        const ca = resolveConstant(col);
        if (typeof ca !== "undefined") {
            return ca;
        }

        const match = FUNCTION_REGEX.exec(col);
        if (match) {
            const fn = AGGREGATE_FUNCTIONS[match[1]];
            if (!fn) {
                throw new Error("Function not found: " + match[1]);
            }

            if (!row['group']) {
                throw new Error("Aggregate function called on non-group of rows");
            }

            return fn(aggregateValues(row['group'], match[2]));
        }

        throw new Error("Invalid HAVING condition: " + col);

    }

    /**
     * Turns a group of rows into one aggregate row
     * @param {any[][]} rows
     * @param {string[]} colNames
     * @return {any[]}
     */
    function computeAggregates (rows, colNames) {
        // If there are no rows (i.e. due to filtering) then
        // just return an empty row.
        if (rows.length === 0) {
            return [];
        }

        // Pick the first row from each group
        const row = rows[0];

        // Fill in aggregate values
        colNames.forEach((col, i) => {
            const match = FUNCTION_REGEX.exec(col);
            if (match) {
                const fn = AGGREGATE_FUNCTIONS[match[1]];
                if (fn) {
                    row[i] = fn(aggregateValues(rows, match[2]));
                } else {
                    throw new Error("Function not found: " + match[1]);
                }
                return;
            }
        });

        return row;
    }

    /**
     *
     * @param {any[][]} rows
     * @param {string} col
     * @returns {any[]}
     */
    function aggregateValues (rows, col) {
        if (col === "*") {
            return rows.map(r => true);
        }

        let distinct = false;
        if (col.startsWith("DISTINCT")) {
            distinct = true;
            col = col.substr(8).trim();
        }

        // All aggregate functions ignore null except COUNT(*)
        let values = rows.map(row => resolveValue(row['result'], col)).filter(OPERATORS['IS NOT NULL']);

        if (distinct) {
            values = Array.from(new Set(values));
        }

        return values;
    }

    /**
     * @param {any[]} row
     * @param {{ col: string, colNum: number, desc: number }} parsedOrder
     * @param {number} depth
     */
    function getOrderingValue (row, parsedOrder, depth) {
        let va = row['orderBy'][depth];

        // The first time this row is visited (at this depth) we'll
        // calculate its ordering value.
        if (typeof va === "undefined") {
            let v = isNaN(parsedOrder.colNum) ?
                resolveValue(row['result'], parsedOrder.col) :
                row[parsedOrder.colNum];

            // Try to coerce into number if possible
            v = isNaN(+v) ? v : +v;

            // Set value to save resolution next time
            row['orderBy'][depth] = v;
            va = v;
        }

        return va;
    }

    /**
     * Collapse multiple rows into a single row
     * @param {any[][]} rows
     * @param {string[]} parsedGroupBy
     * @returns {any[]}
     */
    function groupRows (rows, parsedGroupBy) {
        const groupByMap = new Map();
        for(const row of rows) {
            const key = parsedGroupBy.length === 1 ?
                resolveValue(row['result'], parsedGroupBy[0]) : // Group could actually be an object e.g. GROUP BY tutor
                parsedGroupBy.map(g => resolveValue(row['result'], g)).join("|");
            if (!groupByMap.has(key)) {
                groupByMap.set(key, []);
            }
            groupByMap.get(key).push(row);
        }

        return Array.from(groupByMap.values()).map(rows => {
            // Just pick the first row from each group
            const aggRow = rows[0];

            // Save reference to original rows
            aggRow['group'] = rows;

            return aggRow;
        });
    }
}

/**
 *
 * @param {any} data
 * @return {string}
 */
function formatCol (data) {
    if (data === null || typeof data === "undefined") {
        return null;
    }
    if (data.toString() === "[object Object]") {
        return "";
    }
    if (Array.isArray(data)) {
        return "";
    }
    return data;
}

/**
 *
 * @param {string} char
 * @param {number} n
 */
function repeat (char, n) {
    return Array(n + 1).join(char);
}

/**
 * Returns true iff param is Date object AND is invalid
 * @param {any} date
 * @returns {boolean}
 */
function isNullDate (date) {
    return date instanceof Date && isNaN(+date);
}