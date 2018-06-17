const {
    FUNCTION_REGEX,
    AGGREGATE_FUNCTIONS,
    OPERATORS,
} = require('./const');

const {
    parseQuery,
    parseFrom,
    parseWhere,
} = require('./parse');

const {
    scalar,
    isNullDate,
} = require('./util');

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
 * @param {QueryCallbacks} callbacks
 */
async function Query (query, callbacks) {

    const { primaryTable, afterJoin, beforeJoin } = callbacks;

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

    /**
    * @typedef ParsedTable
    * @prop {string} name
    * @prop {string} [join]
    * @prop {string} [alias]
    * @prop {boolean} [inner]
    * @prop {string} [explain]
    * @prop {number} [rowCount]
    */

    const cols = parsedQuery.select.split(",").map(s => s.trim());
    /** @type {ParsedTable[]} */
    const parsedTables = parseFrom(parsedQuery.from);
    const where = parsedQuery.where;
    const parsedWhere = parseWhere(where);
    const having = parsedQuery.having;
    const parsedHaving = parseWhere(having);
    // console.log(parsedWhere);
    const orderBy = parsedQuery['order by'];
    const groupBy = parsedQuery['group by'];

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

    const colNames = [];
    const colHeaders = [];
    const colAlias = {};

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
        // i === 0: Root table can't have joins
        table.join = "";
        table.inner = false;

        /** @type {Array} */
        const results = await primaryTable.call(self, table) || [];

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
    }


    // We can only process join connections if we have results
    if (rows.length > 0) {

        /******************
         * Joins
         *****************/
        for(let table of parsedTables.slice(1)) {
            if (beforeJoin) {
                await beforeJoin.call(self, table, rows);
            }

            table.join = findJoin(table, rows);

            if (typeof table.join === "undefined") {
                throw new Error("All attempts at joining failed: " + table.name);
            }

            rows = applyJoin(table, rows);

            rows = filterRows(rows);

            table.rowCount = rows.length;

            if (afterJoin) {
                await afterJoin.call(self, table, rows);
            }
        }
    }

    if (typeof parsedQuery.explain !== "undefined") {
        output([ "index", ...Object.keys(parsedTables[0]) ]);
        for (const [i,table] of parsedTables.entries()) {
            output([ i, ...Object.values(table) ]);
        }
        return output_buffer;
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

    for (const c of cols) {
        // Special Treatment for *
        if (c === "*") {
            if (rows.length === 0) {
                // We don't have any results so we can't determine the cols
                colNames.push(c);
                colHeaders.push(c);
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
                        colNames.push([join, null]);
                        colHeaders.push(`${table.name}.*`);
                    }

                    continue;
                }

                // only add "primitive" columns
                let newCols = Object.keys(tableObj).filter(k => typeof scalar(tableObj[k]) !== "undefined");

                colNames.push(...newCols.map(c => [join, c]));
                colHeaders.push(...newCols);
            }
        } else {
            const [ c1, alias ] = c.split(" AS ");
            let path;
            if (rows.length > 0) {
                path = findPath(rows[0], c1);
            }

            colNames.push([path, c1]);
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

    /*****************
     * Column Values
     *****************/
    for(const row of rows) {
        for(const [i, [join, col]] of colNames.entries()) {
            if (col === "ROWID") {
                row[i] = row['ROWID'];
                continue;
            }
            if (FUNCTION_REGEX.test(col)) {
                // Don't compute aggregate functions until after grouping
                continue;
            }
            // Fill values from result data
            if (typeof join !== "undefined") {
                const data = row['data'][join];
                row[i] = data ? resolvePath(data, col) : null;
                continue;
            }
            // This should just be constants
            row[i] = resolveValue(row, col);
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
    if (colNames.some(([p,c]) => FUNCTION_REGEX.test(c))) {
        if (!groupBy) {
            // If we have aggregate functions but we're not grouping,
            // then apply aggregate functions to whole set
            const aggRow = rows[0];
            aggRow['group'] = rows;

            rows = [
                aggRow // Single row result set
            ];
        }

        rows = rows.map(row => computeAggregates(row['group'], colNames.map(([p,c])=>c)));
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
        const start = parseInt(parsedQuery.offset) || 0;
        const end = start + parseInt(parsedQuery.limit) || rows.length;
        rows = rows.slice(start, end);
    }

    /*****************
     * Output
     ****************/

    output(colHeaders);
    rows.forEach(r => output(r.map(scalar)));
    console.log(`${initialResultCount} results initally retrieved. ${rows.length} rows returned.`);

    return output_buffer;

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
        if (row === null) {
            return;
        }

        // Now for the real column resolution

                            // Resolve a possible alias
        let qualified = colNames[colAlias[col]];
        if (typeof qualified !== "undefined") {
            let [ join, colName ] = qualified;

            if (typeof join === "undefined") {
                return; // undefined
            }

            const data = row.data[join];

            if (typeof data === "undefined") {
                // Possibly the result of a LEFT JOIN of a null row
                return; // undefined
            }

            const val = resolvePath(data, colName);

            if (typeof val !== "undefined") {
                return val;
            }
        }

        let head = col;
        let tail;
        while(head.length > 0) {
            const data = row['data'][head];

            if (typeof data !== "undefined" && data != null) {
                return resolvePath(data, tail);
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
            colNum = colNames.findIndex(([p,c]) => c === col);
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
        const t = table.name.toLowerCase();

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