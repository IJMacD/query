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
    repeat,
    isNullDate,
    deepClone,
} = require('./util');

module.exports = Query;

/**
 * @typedef QueryCallbacks
 * @prop {(ParsedFrom) => Promise<any[]>} primaryTable
 * @prop {(ParsedFrom, results: any[]) => Promise} [joinedTable]
 * @prop {(ParsedFrom, results: any[]) => Promise} [beforeJoin]
 */

/**
 *
 * @param {string} query
 * @param {QueryCallbacks} callbacks
 */
async function Query (query, callbacks) {

    const { primaryTable, joinedTable, beforeJoin } = callbacks;

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
    };

    const colNames = [];
    const colHeaders = [];
    const colAlias = {};

    let initialResultCount = 0;
    let fetchStudents = false;

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

        /** @type {Array} */
        const results = await primaryTable.call(self, table);

        if (!results) {
            // Nothing we can do
            throw new Error("No results");
        }

        initialResultCount = results.length;
        // console.log(`Initial data set: ${results.length} items`);


        // Poulate inital rows
        rows = results.map((r,i) => {
            /** @type {ResultRow} */
            const row = [];
            row.data = {
                [table.join]: r,
            };
            // Define a ROWID
            Object.defineProperty(row, 'ROWID', { value: String(i), writable: true });
            return row;
        });

    }


    // We can only process join connections if we have results
    if (rows.length > 0) {

        /******************
         * Joins
         *****************/
        jointables: for(let table of parsedTables.slice(1)) {
            if (beforeJoin) {
                await beforeJoin.call(self, table, rows);
            }

            const t = table.name.toLowerCase();

            if (table.join) {
                // If we have an explicit join, check it first.

                // Iterate over rows until we find one that works
                for (const row of rows) {
                    const val = resolveValue(row, table.join);

                    if (typeof val !== "undefined") {

                        for (let row of rows) {
                            row['data'][table.join] = resolveValue(row, table.join);
                            row['ROWID'] += ".0";
                        }

                        if (joinedTable) {
                            await joinedTable.call(self, table, rows);
                        }
                        continue jointables;
                    }
                }

                throw new Error("Invalid ON clause: " + table.join);

            } else {
                let path;

                // AUTO JOIN! (natural join, comma join, implicit join?)
                // We will find the path automatically
                for (const r of rows) {
                    path = findPath(r, t);
                    if (typeof path !== "undefined") break;
                }

                if (typeof path !== "undefined") {
                    const join = path.length === 0 ? t : `${path}.${t}`;

                    for (let row of rows) {
                        row['data'][join] = resolveValue(row, t);
                        row['ROWID'] += ".0";
                    }

                    table.join = join;
                    if (joinedTable) {
                        await joinedTable.call(self, table, rows);
                    }

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
            let pluralPath;
            let join;

            for (const r of rows) {
                join = findPath(r, ts);

                if (typeof join !== "undefined") {
                    const data = r['data'][join];
                    pluralPath = join.length === 0 ? ts : `${join}.${ts}`;

                    const array = resolvePath(data, pluralPath);

                    if (!Array.isArray(array)) {
                        throw new Error("Unable to join, found a plural but not an array: " + ts);
                    }

                    break;
                }
            }

            if (typeof pluralPath === "undefined") {
                throw new Error("Unable to join: " + t);
            }

            // We've been joined on an array! Wahooo!!
            // The number of results has just been multiplied!
            const newRows = [];
            const subPath = pluralPath.substr(0, pluralPath.lastIndexOf("."));
            const newPath = subPath.length > 0 ? `${subPath}.${t}` : t;


            // Now iterate over each of the results expanding as necessary
            rows.forEach(r => {
                // Fetch the array
                const data = r['data'][join];
                const array = resolvePath(data, pluralPath);

                if (array.length === 0) {
                    /*
                        * We're going to assume LEFT JOIN, this could be configured
                        * in the future.
                        * So for LEFT JOIN we should still include this row even
                        * though the secondary table will effectively be all nulls.
                        */

                    // Update the ROWID to indicate there was no row in this particular table
                    r['ROWID'] += ".-1";

                    newRows.push(r);
                    return;
                }

                array.forEach((sr, si) => {
                    // Clone the row
                    const newRow = [ ...r ];
                    newRow['data'] = { ...r['data'], [newPath]: sr };

                    // Set the ROWID again, this time including the subquery id too
                    Object.defineProperty(newRow, 'ROWID', { value: `${r['ROWID']}.${si}`, writable: true });

                    newRows.push(newRow);
                });
            });

            rows = newRows;

            table.join = newPath;
            if (joinedTable) {
                await joinedTable.call(self, table, rows);
            }
        }
    }

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

            const r = rows[0];
            const data = r['data'][""];

            // only add "primitive" columns
            let newCols = Object.keys(data).filter(k => typeof scalar(data[k]) !== "undefined");

            colNames.push(...newCols.map(c => ["", c]));
            colHeaders.push(...newCols);

            // Add all the scalar columns for secondary tables
            for (const table of parsedTables.slice(1)) {
                const { join } = table;

                let tableObj;

                // We need to find a non-null row to extract columns from
                for (const tmpR of rows) {
                    tableObj = tmpR['data'][join];
                    if (tableObj) break;
                }

                if (!tableObj) {
                    throw Error("Problem with join: " + join);
                }

                // only add "primitive" columns
                let newCols = Object.keys(tableObj).filter(k => typeof scalar(tableObj[k]) !== "undefined");

                colNames.push(...newCols.map(c => [join, c]));
                colHeaders.push(...newCols);
            }
        } else {
            const [ c1, alias ] = c.split(" AS ");
            const path = findPath(rows[0], c1);

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

            rows = rows.filter(r => {
                const a = resolveValue(r, child.operand1);
                const b = resolveValue(r, child.operand2);
                return compare(a, b);
            });
        }
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

            if (typeof data === "undefined") {
                throw new Error("Row is missing data: " + join);
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

            const val = resolvePath(data, colName);

            if (typeof val !== "undefined") {
                return val;
            }
        }

        // We will try each of the tables in turn
        for (const { join } of parsedTables) {
            if (typeof join === "undefined") {
                continue;
            }

            const data = row.data[join];

            if (typeof data === "undefined") {
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
}