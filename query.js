const {
    FUNCTION_REGEX,
    VALUE_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
    OPERATORS,
} = require('./const');

const {
    parseQuery,
    parseSelect,
    parseFrom,
    parseWhere,
    parseArgumentList,
} = require('./parse');

const {
    scalar,
    isNullDate,
} = require('./util');

const { NODE_TYPES } = require('./parser');

/**
 * @typedef Node
 * @prop {number} type
 * @prop {string|number} id
 * @prop {string} alias
 * @prop {Node[]} children
 */

module.exports = Query;

/**
 * @typedef QueryCallbacks
 * @prop {(ParsedFrom) => Promise<any[]>} primaryTable
 * @prop {(ParsedFrom, results: any[]) => Promise} [beforeJoin]
 * @prop {(ParsedFrom, results: any[]) => Promise} [afterJoin]
 */

/**
 *
 * @param {string} query
 * @param {QueryCallbacks} [callbacks]
 */
async function Query (query, callbacks = {}) {

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    const parsedQuery = parseQuery(query);

    // console.log(parsedQuery);

    if (parsedQuery.transpose) {
        const m = /^\s*\((.*)\)\s*$/.exec(parsedQuery.transpose);

        if (!m) {
            throw new Error(`Empty TRANSPOSE body "${parsedQuery.transpose}"`);
        }

        const subQuery = await Query(m[1], callbacks);

        const out = [];

        if (subQuery.length > 0) {
            const headers = subQuery[0];
            const dummyArray = Array(subQuery.length - 1).fill("");

            if (headers[0] !== "headers") {
                // Try to make this invertable
                out.push(['headers', ...dummyArray.map((x,i) => `row ${i}`)]);
            }

            for (let i = 0; i < headers.length; i++) {
                if (headers[0] === "headers") {
                    // If header 0 is "headers" it probably means we're inverting a transpose
                    // So ignore the column containing "headers", "row 0", "row 1" etc.
                    out.push([...dummyArray.map((x, j) => subQuery[j+1][i])]);
                } else {
                    out.push([headers[i], ...dummyArray.map((x, j) => subQuery[j+1][i])]);
                }
            }

            return out;
        }
    }

    if (!parsedQuery.from && !parsedQuery.select) {
        throw new Error("You must specify FROM or SELECT");
    }

    if (!parsedQuery.select) {
        // Default to selecting all scalar values
        parsedQuery.select = "*";
    }

    /**
    * @typedef ParsedColumn
    * @prop {string} value
    * @prop {string} [alias]
    * @prop {Node} [node]
    */

    /**
    * @typedef ParsedTable
    * @prop {string} name
    * @prop {string} [join]
    * @prop {string} [alias]
    * @prop {boolean} [inner]
    * @prop {string} [explain]
    * @prop {number} [rowCount]
    * @prop {any} [analyse]
    */

    /** @type {ParsedColumn[]} */
    const cols = parseSelect(parsedQuery.select);
    /** @type {ParsedTable[]} */
    const parsedTables = parseFrom(parsedQuery.from);
    const where = parsedQuery.where;
    const parsedWhere = parseWhere(where);
    const having = parsedQuery.having;
    const parsedHaving = parseWhere(having);
    // console.log(parsedWhere);
    const orderBy = parsedQuery['order by'];
    const groupBy = parsedQuery['group by'];
    const analyse = parsedQuery.explain === "ANALYSE" || parsedQuery.explain === "ANALYZE";

    const self = {
        cols,
        parsedTables,
        parsedWhere,
        parsedHaving,
        orderBy,
        groupBy,

        resolveConstant,
        resolvePath,
        resolveValue,

        findTable,
        findWhere,
    };

    /** @type {Node[]} */
    const colNodes = [];
    const colHeaders = [];
    const colAlias = {};

    /** @type {{ [key: string]: ParsedTable }} */
    const tableAlias = {};
    for (const t of parsedTables) {
        const n = t.alias || t.name;
        if (!tableAlias[n]) {
            tableAlias[n] = t;
        }
    }

    let initialResultCount = 0;

    /** @typedef {any[] & { data?: { [join: string]: any }, ROWID?: string }} ResultRow */

    /** @type {ResultRow[]} */
    let rows;

    if (parsedTables.length === 0) {
        // If there is no table specified create one token row
        // so that we can return constants etc.
        rows = [[]];
    } else {
        const table = parsedTables[0];
        table.join = table.alias || table.name;
        table.inner = false;

        const start = Date.now();

        if (typeof callbacks.primaryTable === "undefined") {
            throw new Error("PrimaryTable callback not defined");
        }

        /** @type {Array} */
        const results = await callbacks.primaryTable.call(self, table) || [];

        const totalTime = Date.now() - start;

        initialResultCount = results.length;
        // console.log(`Initial data set: ${results.length} items`);

        // Poulate inital rows
        rows = results.map((r,i) => {
            /** @type {ResultRow} */
            const row = [];

            // Set inital data object
            row.data = {
                [table.join]: r,
            };

            // Define a ROWID
            Object.defineProperty(row, 'ROWID', { value: String(i), writable: true });

            return row;
        });

        rows = filterRows(rows);

        table.rowCount = rows.length;

        if (analyse) {
            table.analyse = {
                "Node Type": "Seq Scan",
                "Relation Name": table.name,
                "Alias": table.alias || table.name,
                "Startup Cost": 0,
                "Total Cost": totalTime,
                "Plan Rows": results.length,
                "Plan Width": 1,
                "Actual Startup Time": 0,
                "Actual Total Time": totalTime,
                "Actual Rows": rows.length,
                "Actual Loops": 1,
            };
        }
    }


    // We can only process join connections if we have results
    if (rows.length > 0) {

        /******************
         * Joins
         *****************/
        for(let table of parsedTables.slice(1)) {

            const start = Date.now()

            if (callbacks.beforeJoin) {
                await callbacks.beforeJoin.call(self, table, rows);
            }

            const startup = Date.now() - start;

            table.join = findJoin(table, rows);

            if (typeof table.join === "undefined") {
                // All attempts at joining failed, intead we're going to do a
                // CROSS JOIN!

                if (typeof callbacks.primaryTable === "undefined") {
                    throw new Error(`All attempts at joining failed: ${table.name}`);
                }

                const results = await callbacks.primaryTable.call(self, table) || [];

                table.join = table.alias || table.name;
                table.explain += " cross-join";

                for (const row of rows) {
                    row['data'][table.join] = results;
                }

            }

            rows = applyJoin(table, rows);

            rows = filterRows(rows);

            table.rowCount = rows.length;

            if (callbacks.afterJoin) {
                await callbacks.afterJoin.call(self, table, rows);
            }

            if (analyse) {
                const totalTime = Date.now() - start;
                table.analyse = {
                    "Node Type": "Seq Scan",
                    "Relation Name": table.name,
                    "Alias": table.alias || table.name,
                    "Startup Cost": startup,
                    "Total Cost": totalTime,
                    "Plan Rows": rows.length,
                    "Plan Width": 1,
                    "Actual Startup Time": startup,
                    "Actual Total Time": totalTime,
                    "Actual Rows": rows.length,
                    "Actual Loops": 1,
                };
            }
        }
    }

    /*************
     * EXPLAIN
     ************/

    if (typeof parsedQuery.explain !== "undefined") {

        if (analyse) {
            // Build Tree
            const analyses = parsedTables.map(t => t.analyse);
            let curr = analyses.shift();

            for (const analyse of analyses) {
                curr = {
                    "Node Type": "Nested Loop",
                    "Startup Cost": curr["Startup Cost"] + analyse["Startup Cost"],
                    "Total Cost": curr["Total Cost"] + analyse["Total Cost"],
                    "Plans": [curr, analyse],
                    "Actual Startup Time": curr["Startup Cost"] + analyse["Startup Cost"],
                    "Actual Total Time": curr["Actual Total Time"] + analyse["Actual Total Time"],
                    "Actual Rows": curr["Actual Rows"],
                    "Actual Loops": 1,
                };
            }

            output(["QUERY PLAN"]);
            // for (const table of parsedTables) {
            //     const a = table.analyse;
            //     output([`Seq Scan on ${a["Relation Name"]} ${a["Alias"] !== a["Relation Name"] ? a["Alias"] : ""} (cost=${a["Startup Cost"].toFixed(2)}..${a["Total Cost"].toFixed(2)} rows=${a["Plan Rows"]} width=${a["Plan Width"]})`]);
            // }
            output([JSON.stringify([{"Plan": curr, "Total Runtime": curr["Actual Total Time"]}])]);
            return output_buffer;
        }
        else {
            output([ "index", ...Object.keys(parsedTables[0]) ]);
            for (const [i,table] of parsedTables.entries()) {
                output([ i, ...Object.values(table) ]);
            }
            return output_buffer;
        }
    }

    /******************
     * Filtering
     *****************/

    // One last filter, this time strict because there shouldn't be
    // anything slipping through since we have all the data now.
    rows = filterRows(rows, true);

    /******************
     * Columns
     ******************/

    for (const { node } of cols) {

        // Special Treatment for *
        if (node.type === NODE_TYPES.SYMBOL && node.id === "*") {
            if (rows.length === 0) {
                // We don't have any results so we can't determine the cols
                colNodes.push(node);
                colHeaders.push("*");
                continue;
            }

            // Add all the scalar columns for all tables
            for (const table of parsedTables) {
                const { join } = table;

                let tableObj;

                // We need to find a non-null row to extract columns from
                for (const tmpR of rows) {
                    tableObj = tmpR && tmpR['data'][join];
                    if (tableObj) break;
                }

                if (!tableObj) {
                    // No results to extract column data from

                    // If we're not the root table, then add placeholder headers
                    if (table.join != "") {
                        colNodes.push(null);
                        colHeaders.push(`${table.alias || table.name}.*`);
                    }

                    continue;
                }

                // only add "primitive" columns
                let newCols = Object.keys(tableObj).filter(k => typeof scalar(tableObj[k]) !== "undefined");

                colNodes.push(...newCols.map(c => ({ type: NODE_TYPES.SYMBOL, id: `${table.join}.${c}` })));
                colHeaders.push(...newCols);
            }
        } else {
            let path;
            if (rows.length > 0) {
                path = findPath(rows[0], node.source);
            }

            colNodes.push(node);
            colHeaders.push(node.alias || node.source);

            if (node.alias && typeof colAlias[node.alias] !== "undefined") {
                throw new Error("Alias already in use: " + node.alias);
            }

            colAlias[node.alias || node.source] = colNodes.length - 1;
        }

        colHeaders.forEach((col, i) => {
            if (typeof colAlias[col] === "undefined") {
                colAlias[col] = i;
            }
        });
    }

    // console.log(parsedTables);
    // console.log(colNodes);

    /*****************
     * Column Values
     *****************/
    for(const row of rows) {
        for(const [i, node] of colNodes.entries()) {
            if (node.id === "ROWID") {
                row[i] = row['ROWID'];
                continue;
            }

            row[i] = executeExpression(row, node);
        }
    }

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
    if (colNodes.some(node => node.id in AGGREGATE_FUNCTIONS)) {
        if (!groupBy) {
            // If we have aggregate functions but we're not grouping,
            // then apply aggregate functions to whole set
            const aggRow = rows[0];
            aggRow['group'] = rows;

            rows = [
                aggRow // Single row result set
            ];
        }

        rows = rows.map(row => computeAggregates(row['group'], colNodes));
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
            const [ col, asc_desc ] = order.trim().split(" ");
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
                    String(va).localeCompare(vb);

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
        const offset = parseInt(parsedQuery.offset);
        const limit = parsedQuery.limit === "" ? rows.length : parseInt(parsedQuery.limit);

        if (isNaN(limit)) {
            throw new Error(`Invalid limit ${parsedQuery.limit}`);
        }

        const start = offset || 0;
        const end = start + limit;
        rows = rows.slice(start, end);
    }

    /*****************
     * Output
     ****************/

    output(colHeaders);
    rows.forEach(r => output(r.map(scalar)));
    // Print to stderr
    // console.warn(`${initialResultCount} results initally retrieved. ${rows.length} rows returned.`);

    return output_buffer;

    /**
     * Execute an expresion from AST nodes
     * @param {ResultRow} row
     * @param {Node} node
     */
    function executeExpression(row, node) {
        if (node.type === NODE_TYPES.FUNCTION_CALL) {
            const fnName = node.id;
            if (fnName in AGGREGATE_FUNCTIONS) {
                // Don't compute aggregate functions until after grouping
                return;
            }
            if (fnName in VALUE_FUNCTIONS) {
                return VALUE_FUNCTIONS[fnName](...node.children.map(c => executeExpression(row, c)));
            }
        } else if (node.type === NODE_TYPES.SYMBOL) {
            return resolveValue(row, node.id);
        } else if (node.type === NODE_TYPES.STRING) {
            return node.id;
        } else if (node.type === NODE_TYPES.NUMBER) {
            return node.id;
        } else if (node.type === NODE_TYPES.KEYWORD) {
            // Pass keywords like YEAR, SECOND, INT, FLOAT as strings
            return node.id;
        } else if (node.type === NODE_TYPES.OPERATOR) {
            const op = OPERATORS[node.id];
            if (op) {
                return op(...node.children.map(c => executeExpression(row, c)));
            }
            throw new Error(`Unsupported operator '${node.id}'`);
        } else {
            throw new Error(`Can't execute node type ${node.type}: ${node.id}`);
        }
    }

    /**
     * Function to filter rows based on WHERE clause
     * @param {ResultRow[]} rows
     * @return {ResultRow[]}
     */
    function filterRows (rows, strict = false) {
        if (parsedWhere) {
            for (const child of parsedWhere.children) {
                const compare = OPERATORS[child.operator];
                if (!compare) {
                    throw new Error("Unrecognised operator: " + child.operator);
                }

                rows = rows.filter(r => {
                    const a = resolveValue(r, child.operand1);
                    const b = resolveValue(r, child.operand2);

                    // Check to see if we have enough information to process this yet
                    if (typeof a === "undefined" && !strict) {
                        // n.b. `b` can be undefined (e.g. a IS NULL)
                        return true;
                    }

                    return compare(a, b);
                });
            }
        }
        return rows;
    }

    /**
     * Traverse a sample object to determine absolute path
     * up to, but not including, given name.
     * Uses explicit join list.
     * @param {ResultRow} row
     * @param {string} name
     * @returns {string}
     */
    function findPath (row, name) {
        for (const { join } of parsedTables) {
            if (typeof join === "undefined") {
                continue;
            }

            const data = row.data[join];

            if (typeof data === "undefined" || data === null) {
                // Could be missing data because of a LEFT JOIN on null row
                continue;
            }

            // Check if the parent object has a property matching
            // the secondary table i.e. Tutor => result.tutor
            if (typeof resolvePath(data, name) !== "undefined") {
                return join;
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
            if (/^\d/.test(stripped)) {
                // Must start with a number - for some reason
                // 'Room 2' parses as a valid date
                const d = new Date(stripped);
                if (!isNullDate(d)) {
                    return d;
                }
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
     * @param {ResultRow} row
     * @param {string} col
     */
    function resolveValue (row, col) {
        // Check for constant values first
        const constant = resolveConstant(col);

        if (typeof constant !== "undefined") {
            return constant;
        }

        // If row is null, there's nothing left we can do
        if (row === null || !row['data']) {
            return;
        }

        // Now for the real column resolution

        //                 // Resolve a possible alias
        // let node = colNodes[colAlias[col]];
        // if (typeof node !== "undefined") {
        //     let [ join, colName ] = node.id.split(".", 2);

        //     console.log({ join, colName });

        //     if (typeof join === "undefined") {
        //         return; // undefined
        //     }

        //     const data = row.data[join];

        //     if (typeof data === "undefined") {
        //         // Possibly the result of a LEFT JOIN of a null row
        //         return; // undefined
        //     }

        //     const val = resolvePath(data, colName);

        //     if (typeof val !== "undefined") {
        //         return val;
        //     }
        // }

        let head = col;
        let tail;
        while(head.length > 0) {
            let data = row['data'][head];

            if (typeof data !== "undefined" && data != null) {
                return resolvePath(data, tail);
            }

            const t = tableAlias[head];
            if (t) {
                data = row['data'][t.join];

                if (typeof data !== "undefined" && data != null) {
                    return resolvePath(data, tail);
                }
            }

            head = head.substr(0, head.lastIndexOf("."));
            tail = col.substr(head.length + 1);
        }

        // We will try each of the tables in turn
        for (const { join } of parsedTables) {
            if (typeof join === "undefined") {
                continue;
            }

            const data = row.data[join];

            if (typeof data === "undefined" || data === null) {
                continue;
            }

            const val = resolvePath(data, col);

            if (typeof val !== "undefined") {
                return val;
            }
        }

        return; // undefined
    }

    /**
     * Traverse a dotted path to resolve a deep value
     * @param {any} data
     * @param {string} path
     * @returns {any}
     */
    function resolvePath(data, path) {
        if (typeof data === "undefined" || data === null) {
            throw new Error("Trying to resolve a path on a null object: " + path)
        }
        if (process.env.NODE_ENV !== "production" && typeof data['ROWID'] !== "undefined") {
            console.error("It looks like you passed a row to resolvePath");
        }
        if (typeof path === "undefined") {
            throw new Error("No path provided");
        }
        // resolve path
        let val = data;
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
            colNum = colNodes.findIndex(node => node.source === col);
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
     * @param {Node[]} colNodes
     * @return {any[]}
     */
    function computeAggregates (rows, colNodes) {
        // If there are no rows (i.e. due to filtering) then
        // just return an empty row.
        if (rows.length === 0) {
            return [];
        }

        // Pick the first row from each group
        const row = rows[0];

        // Fill in aggregate values
        colNodes.forEach((node, i) => {

            if (node.id in AGGREGATE_FUNCTIONS) {
                const fn = AGGREGATE_FUNCTIONS[node.id];

                if (fn) {
                    // TODO: Fix Aggregates for expressions
                    row[i] = fn(aggregateValues(rows, node));
                } else {
                    throw new Error("Function not found: " + node.id);
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
        // We'll use our convenient 'IS NOT NULL' function to do the
        // filtering for us.
        let values = rows.map(row => resolveValue(row, col)).filter(OPERATORS['IS NOT NULL']);

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
                resolveValue(row, parsedOrder.col) :
                row[parsedOrder.colNum];

            if (typeof v === "undefined") {
                throw new Error("Order by unknown column: " + parsedOrder.col);
            }

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
                resolveValue(row, parsedGroupBy[0]) : // Group could actually be an object e.g. GROUP BY tutor
                parsedGroupBy.map(g => resolveValue(row, g)).join("|");
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

    function findTable (name) {
        return parsedTables.find(t => t.name === name && t.join !== undefined);
    }

    function findWhere (condition) {
        return parsedWhere && parsedWhere.children.find(w => w.operand1 === condition || w.operand2 === condition);
    }

    function findJoin (table, rows) {

        if (table.join) {
            // If we have an explicit join, check it first.

            // First check of explicit join check is in data object.
            // This may already have been set for us by a beforeJoin callback.
            for (const row of rows) {
                const data = row['data'][table.join];

                if (typeof data !== "undefined" && data !== null) {
                    return table.join;
                }
            }

            // We didn't have the data set for us, so let's search ourselves

            // Iterate over rows until we find one that works
            for (const row of rows) {
                const val = resolveValue(row, table.join);

                if (typeof val !== "undefined") {
                    // If we found `val` that means `table.join` is correct
                    return table.join;
                }
            }

            throw new Error("Invalid ON clause: " + table.join);

        } else {
            // AUTO JOIN! (natural join, comma join, implicit join?)
            // We will find the path automatically
            const t = table.name.toLowerCase();

            for (const r of rows) {
                const path = findPath(r, t);

                if (typeof path !== "undefined"){
                    return path.length === 0 ? t : `${path}.${t}`;
                }
            }

            /*
            * This will search for the plural of the table name and
            * if that is an array we can do a multi-way join.
            */
            const ts = `${t}s`;

            for (const r of rows) {
                const join = findPath(r, ts);

                if (typeof join !== "undefined") {
                    const data = r['data'][join];

                    const array = resolvePath(data, ts);

                    if (Array.isArray(array)) {
                        return join.length === 0 ? ts : `${join}.${ts}`;
                    }

                    throw new Error("Unable to join, found a plural but not an array: " + ts);
                }
            }
        }

        // return undefined
    }

    /**
     * This function first makes sure every row has a data object
     * for this table.
     *
     * Then if the data object is an array, it will split the row as necessary.
     *
     * Finally this function will update ROWIDs
     * @param {ParsedTable} table
     * @param {ResultRow[]} rows
     * @returns {ResultRow[]}
     */
    function applyJoin (table, rows) {
        const newRows = [];
        let one2many = false;

        for (let row of rows) {
            // Check to make sure we have data object saved,
            // if not fill in the data object of each row now
            if (typeof row['data'][table.join] === "undefined") {
                row['data'][table.join] = resolveValue(row, table.join);
            }

            const data = row['data'][table.join];

            if (Array.isArray(data)) {
                // We've been joined on an array! Wahooo!!
                // The number of results has just been multiplied!

                // For EXPLAIN
                one2many = true;

                if (!data || data.length === 0) {

                    /*
                    * If this is an inner join, we do nothing.
                    * In the case it is not an INNER JOIN (i.e it is a LEFT JOIN),
                    * we need to add a null row.
                    */
                    if (!table.inner) {
                        // Update the ROWID to indicate there was no row in this particular table
                        row['ROWID'] += ".-1";
                        row['data'] = { ...row['data'], [table.join]: undefined }

                        newRows.push(row);
                    }

                    continue;
                }

                data.forEach((sr, si) => {
                    // Clone the row
                    const newRow = [ ...row ];
                    newRow['data'] = { ...row['data'], [table.join]: sr };

                    // Set the ROWID again, this time including the subquery id too
                    Object.defineProperty(newRow, 'ROWID', { value: `${row['ROWID']}.${si}`, writable: true });

                    newRows.push(newRow);
                });
            } else {
                // Update all the row IDs for one-to-one JOIN
                row['ROWID'] += ".0";

                newRows.push(row);
            }
        }

        if (one2many) {
            table.explain += ` one-to-many`;
        }

        return newRows;
    }
}