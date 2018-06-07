const moment = require('moment');

module.exports = runQuery;

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
 * @typedef WhereNode
 * @prop {string} type
 * @prop {WhereNode[]} [children]
 * @prop {string} [operator]
 * @prop {string} [operand1]
 * @prop {string} [operand2]
 */

/**
 * Parse a where clause into a tree
 * @param {string} where
 * @return {WhereNode}
 */
function parseWhere (where) {
    if (!where) {
        return;
    }

    const whereParts = where.split("AND");

    /** @type {WhereNode} */
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

/**
 * @typedef ParsedFrom
 * @prop {string} name
 * @prop {string} [join]
 * @prop {string} [alias]
 */

/**
 * @param {string} from
 * @return {ParsedFrom[]}
 */
function parseFrom (from) {
    const tables = from ? from.split(",").map(s => s.trim()) : [];
    const parsedTables = tables.map(table => {
        const [ name, join ] = table.split("ON").map(s => s.trim());
        return { name, join };
    });
    return parsedTables;
}

async function runQuery (query) {
    await iL.init({ API_ROOT: process.env.API_ROOT, PHOTO_URL: process.env.PHOTO_URL });

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
    const parsedTables = parseFrom(parsedQuery.from);
    const table = parsedTables.length && parsedTables[0].name;
    const where = parsedQuery.where;
    const parsedWhere = parseWhere(where);
    const having = parsedQuery.having;
    const parsedHaving = parseWhere(having);
    // console.log(parsedWhere);
    const orderBy = parsedQuery['order by'];
    const groupBy = parsedQuery['group by'];

    const colNames = [];
    const colHeaders = [];
    const colAlias = {};

    let initialResultCount = 0;
    let fetchStudents = false;
    
    /**
     * @param {ParsedFrom} table
     * @returns {Promise<any[]>}
     */
    async function primaryTable (table) {
        switch (table.name) {
            case "Tutor":
                if (parsedWhere) {
                    for (let child of parsedWhere.children){
                        const resolved2 = resolveConstant(child.operand2);
                        if (child.operand1 === "name" && child.operator === "=") {
                            return [await iL.Tutor.find(String(resolved2))];
                        }
                        if (child.operand1 === "id" && child.operator === "=") {
                            return [iL.Tutor.get(String(resolved2))];
                        }
                    }
                }
                return await iL.Tutor.all();
            case "Lesson":
            case "Attendance": {
                let results;
                /** @type Date */
                let start;
                /** @type Date */
                let end;
                let needsLogin = false;
                let tutor;
                // By default only show real lessons
                // WHERE magic is used to include all lessons if requested
                let excludePlaceholders = true;
                // Even stricter: only show lessons with students actually attending
                let onlyWithAttendees = false;

                if (parsedWhere) {
                    for (const condition of parsedWhere.children) {
                        /**
                         * TODO: These should all be reversible
                         */
                        const resolved2 = resolveConstant(condition.operand2);
                        if ((condition.operand1 === "start" || condition.operand1 == "end") && resolved2 instanceof Date)  {
                            if (condition.operator === ">" || condition.operator === ">=" || condition.operator === "=") {
                                start = resolved2;
                            } else if (condition.operator === "<" || condition.operator === "<=" || condition.operator === "=") {
                                end = resolved2;
                            }
                        }
                        else if (condition.operand1.startsWith("attendees") || condition.operand2.startsWith("attendees")) {
                            needsLogin = true;
                        }
                        // Make sure second operand is actually a constant
                        else if (condition.operand1 === "tutor.id" && condition.operator === "=" && resolved2) {
                            tutor = iL.Tutor.get(String(resolved2));
                        }
                        // Make sure second operand is actually a constant
                        else if (condition.operand1 === "tutor.name" && condition.operator === "=" && resolved2) {
                            tutor = await iL.Tutor.find(String(resolved2));
                        }

                        // WHERE magic: if you mention attendees at all then you get unfiltered results
                        // i.e. to force unfiltered you could do attendees.length >= 0
                        if (condition.operand1.includes("attendees") || condition.operand2.includes("attendees")) {
                            excludePlaceholders = false;
                        }
                    }
                }

                if (!start) { start = new Date(); }
                if (!end) { end = start; }

                if (!loggedIn && (
                        excludePlaceholders ||
                        onlyWithAttendees ||
                        needsLogin ||
                        cols.some(c => c.includes("attendees")) ||
                        groupBy && groupBy.includes("attendees") ||
                        orderBy && orderBy.includes("attendees") ||
                        table.name === "Attendance"
                    )
                ) {
                    // If we are going to do anything with attendees, we need to be logged in
                    await iL.login(process.env.IL_USER, process.env.IL_PASS);
                    loggedIn = true;
                }

                results = await iL.Lesson.find({ start, end, tutor });

                if (onlyWithAttendees) {
                    results = results.filter(iL.Util.hasAttendees);
                } else if (excludePlaceholders) {
                    results = results.filter(iL.Util.isRealLesson);
                }

                if (table.name === "Attendance") {
                    // Convert Lessons into Attendances
                    // (Re-use all of Lesson searching logic)
                    const newResults = [];
                    for (const lesson of results) {
                        newResults.push(...lesson.attendees);
                    }
                    results = newResults;
                }

                return results;
            }
            case "Course":
                let title;
                let tutor;
                if (parsedWhere) {
                    for (let child of parsedWhere.children){
                        const resolved2 = resolveConstant(child.operand2);
                        if (child.operand1 === "title" && child.operator === "=") {
                            title = String(resolved2);
                            break;
                        }
                        if (child.operand1 === "tutor.id" && child.operator === "=") {
                            tutor = iL.Tutor.get(String(resolved2));
                            break;
                        }
                        if (child.operand1 === "tutor.name" && child.operator === "=") {
                            tutor = await iL.Tutor.find(String(resolved2));
                            break;
                        }
                    }
                }
                return await iL.Course.find({ title, tutor });
            case "Room":
                return await iL.Room.all();
            case "Term":
                return await iL.Term.all();
            case "User":
                return await iL.User.all();
            default:
                throw new Error("Table not recognised: `" + table.name + "`");
        }
    }

    function joinCallback (table) {
        // console.log({ msg: "Joined Table", table });
        switch (table.name) {
            case 'Student':
                if (cols.some(col => col && col.includes("birthDate"))) {
                    return Promise.all(results.map(r => {
                        const student = resolvePath(r, table.join);
                        return student && iL.Student.fetch(student);
                    }));
                }
                break;
            case 'Guardian':
                const studentTable = parsedTables.find(t => t.name === "Student");
                if (!studentTable) {
                    throw new Error("Guardian table is dependant on Student table");
                }
                return Promise.all(results.map(r => {
                    const student = resolvePath(r, studentTable.join);
                    return student && iL.Student.fetch(student);
                }));
        }
    }

    /** @type {Array} */
    let results;

    if (parsedTables.length === 0) {
        // If there is no table specified create one token row
        // so that we can return constants etc.
        results = [[]];
    } else {
        results = await primaryTable(parsedTables[0]);
    }

    if (!results) {
        // Nothing we can do
        throw new Error("No results");
    }
    
    initialResultCount = results.length;
    // console.log(`Initial data set: ${results.length} items`);

    // Define a ROWID
    for(const [i, result] of results.entries()) {
        if (typeof result['ROWID'] === "undefined") {
            Object.defineProperty(result, 'ROWID', { value: String(i), writable: true });
        } else {
            // This means we've infected the SDK
            result['ROWID'] = String(i);
        }
    }

    // We can only process join connections if we have results
    if (results.length > 0) {

        /******************
         * Joins
         *****************/

        // i === 0: Root table can't have joins
        parsedTables[0].join = "";
        await joinCallback(parsedTables[0]);
        
        for(let table of parsedTables.slice(1)) {
            const result = results[0];

            const t = table.name.toLowerCase();
            let path;

            if (table.join) {
                // If we have an explicit join, check it first.

                const val = resolveValue(result, table.join);

                if (typeof val !== "undefined") {
                    // It's valid, so we can carry on
                    await joinCallback(table);
                    continue;
                }

                path = table.join;
            } else {
                // AUTO JOIN! (natural join, comma join, implicit join?)
                // We will find the path automatically
                for (const r of results) {
                    path = findPath(r, t);
                    if (typeof path !== "undefined") break;
                }

                if (typeof path !== "undefined") {
                    table.join = path;
                    await joinCallback(table);
                    continue;
                }
            }

            /*
            * Now for the really cool part!
            * This is like a legit one-to-many join!
            * We will search for the plural of the table name and
            * if that is an array we can do a multi-way join.
            */
            const ts = `${t}s`;
            const pluralPath = findPath(result, ts);

            if (typeof pluralPath === "undefined") {
                throw new Error("Unable to join: " + t);
            }

            if (!Array.isArray(resolvePath(result, pluralPath))) {
                throw new Error("Unable to join, found a plural but not an array: " + ts);
            }
        
            // We've been joined on an array! Wahooo!!
            // The number of results has just been multiplied!
            const newResults = [];
            const subPath = pluralPath.substr(0, pluralPath.lastIndexOf("."));

            // Now iterate over each of the results expanding as necessary
            results.forEach(r => {
                // Fetch the array
                const array = resolvePath(r, pluralPath);

                if (array.length === 0) {
                    /*
                        * We're going to assume LEFT JOIN, this could be configured
                        * in the future.
                        * So for LEFT JOIN we should still include this row even
                        * though the secondary table will effectively be all nulls.
                        */

                    // Update the ROWID to indicate there was no row in this particular table
                    r['ROWID'] += ".-1";

                    newResults.push(r);
                    return;
                }

                array.forEach((sr, si) => {
                    // Clone the row
                    const newResult = deepClone(r, subPath);

                    // attach the sub-array item to the singular name
                    if (subPath.length === 0) {
                        newResult[t] = sr;
                    } else {
                        resolvePath(newResult, subPath)[t] = sr;
                    }

                    // Set the ROWID again, this time including the subquery id too
                    Object.defineProperty(newResult, 'ROWID', { value: `${r['ROWID']}.${si}` });

                    newResults.push(newResult);
                });
            });

            results = newResults;

            const newPath = subPath.length > 0 ? `${subPath}.${t}` : t;

            table.join = newPath;
            await joinCallback(table);
        }
    }

    // console.log(parsedTables);

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
            let newCols = Object.keys(r).filter(k => typeof scalar(r[k]) !== "undefined");

            colNames.push(...newCols);
            colHeaders.push(...newCols);

            // Add all the scalar columns for secondary tables
            for (const table of parsedTables.slice(1)) {
                const { join } = table;

                let tableObj;

                // We need to find a non-null row to extract columns from
                for (const tmpR of results) {
                    tableObj = resolvePath(tmpR, join);
                    if (tableObj) break;
                }

                if (!tableObj) {
                    throw Error("Problem with join: " + join);
                }

                // only add "primitive" columns
                let newCols = Object.keys(tableObj).filter(k => typeof scalar(tableObj[k]) !== "undefined");

                colNames.push(...newCols.map(c => `${join}.${c}`));
                colHeaders.push(...newCols);
            }
        } else {
            const [ c1, alias ] = c.split(" AS ");
            const colName = results.length === 0 ? c1 : findPath(results[0], c1) || c1;
            colNames.push(colName);
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
    rows.forEach(r => output(r.map(scalar)));
    console.log(`${initialResultCount} results initally retrieved. ${rows.length} rows returned.`);

    return output_buffer;

    /**
     * Traverse a sample object to determine absolute path to given name
     * Uses explicit join list.
     * @param {any} result
     * @param {string} name
     * @returns {string}
     */
    function findPath (result, name) {
        for (const { join } of parsedTables) {
            const path = join ? `${join}.${name}` : name;

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
     * @returns {string|number|boolean|Date}
     */
    function resolveConstant (str) {
        if (!str) { // null, undefined, ""
            return; // undefined
        }

        if (str === "true") return true;
        if (str === "false") return false;
        if (str === "TRUE") return true;
        if (str === "FALSE") return false;

        // Check for quoted string
        if ((str.startsWith("'") && str.endsWith("'")) ||
                (str.startsWith('"') && str.endsWith('"'))) {


            const stripped = str.substring(1, str.length-1);

            // Check for date
            const d = new Date(stripped);
            if (!isNullDate(d)) {
                return d;
            }

            return stripped;
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
        for (const { join } of parsedTables) {
            const prefix = join ? `${join}.` : "";

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

        // HAVING values must be in result set or constants (or aggregate function)

        let colNum = colAlias[col];
        if (typeof colNum === "undefined") {
            colNum = colNames.indexOf(col);
        }

        if (colNum >= 0) {
            const la = row[colNum];
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
 * Only let scalar values through.
 *
 * If passed an object or array returns undefined
 * @param {any} data
 * @return {number|string|boolean|Date}
 */
function scalar (data) {
    if (data === null || typeof data === "undefined") {
        return null;
    }
    if (data.toString() === "[object Object]") {
        return; // undefined
    }
    if (Array.isArray(data)) {
        return; // undefined
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

/**
 * Clone an object semi-deeply.
 *
 * All the objects on the specified path need to be deep cloned.
 * Everything else can be shallow cloned.
 *
 * @param {any} result
 * @param {string} path
 * @returns {any}
 */
function deepClone (result, path) {
    // Top level clone only
    if (path.length === 0) return { ...result };

    // Could be deeper... more accurate
    // At the moment it actually only clones one level deep
    const pathParts = path.split(".");
    return { ...result, [pathParts[0]]: { ...result[pathParts[0]] } };
}