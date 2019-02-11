const {
    VALUE_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
    OPERATORS,
    TABLE_VALUED_FUNCTIONS,
} = require('./const');

const {
    parseQuery,
    parseSelect,
    parseFrom,
    parseWhere,
    parseGroupBy,
    parseOrderBy,
} = require('./parse');

const {
    scalar,
    isValidDate,
    matchInBrackets,
} = require('./util');

const {
    intersectResults,
    exceptResults,
    unionResults,
    unionAllResults,
    distinctResults
} = require('./compound');

const { parseString, NODE_TYPES } = require('./parser');

class SymbolError extends Error { }

/**
 * @typedef {import('./parser').Node} Node
 */

module.exports = Query;

/**
* @typedef {import('./parse').ParsedTable} ParsedTable
*/

/**
 * @typedef QueryCallbacks
 * @prop {(ParsedFrom) => Promise<any[]>|any[]} primaryTable
 * @prop {(ParsedFrom, results: any[]) => Promise} [beforeJoin]
 * @prop {(ParsedFrom, results: any[]) => Promise} [afterJoin]
 */

/**
 * @typedef QueryContext
 * @property {Node[]} cols
 * @property {ParsedTable[]} parsedTables
 * @property {Node} parsedWhere
 * @property {Node} parsedHaving
 * @property {string} orderBy
 * @property {string} groupBy
 *
 * @property {(path: string) => string|number|boolean|Date} resolveConstant
 * @property {(data: any, path: string) => any} resolvePath
 * @property {(row: ResultRow, col: string) => any} resolveValue
 *
 * @property {(name: string) => ParsedTable} findTable
 * @property {(symbol: string, operator?: string|string[]) => string|number} findWhere
 *
 * @property {(table: ParsedTable, targetTable: ParsedTable) => void} setJoin
 * @property {(table: ParsedTable, predicate: string) => void} setJoinPredicate
 *
 * @property {(row: ResultRow, table: ParsedTable) => any} getRowData
 * @property {(row: ResultRow, table: ParsedTable, data: any) => void} setRowData
 */

/** @typedef {any[] & { data?: { [join: string]: any }, ROWID?: string }} ResultRow */

/**
 * @type {{ [name: string]: string }}
 */
const views = {};

/**
 *
 * @param {string} query
 * @param {{ callbacks?: QueryCallbacks, userFunctions?: { [name: string]: (...args: any[]) => any }}} [options]
 */
async function Query (query, options = {}) {

    const viewMatch = /^CREATE VIEW ([a-zA-Z0-9_]+) AS\s+/.exec(query);
    if (viewMatch)
    {
        const name = viewMatch[1];
        const view = matchInBrackets(query) || query.substring(viewMatch[0].length);

        views[name] = view;

        return [];
    }

    const { callbacks, userFunctions = {} } = options;

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    /***************************
     * Common Table Expressions
     ***************************/
    const CTEs = {};

    const withMatch = /^WITH ([a-zA-Z0-9_]+) AS\s+/.exec(query);
    if (withMatch)
    {
        const name = withMatch[1];
        const cte = matchInBrackets(query);

        CTEs[name] = queryResultToObjectArray(await Query(cte, options));

        const endIdx = withMatch[0].length + 2 + cte.length;
        query = query.substr(endIdx);
    }

    /****************
     * Set Functions
     ****************/

    if (/INTERSECT/.test(query)) {
        const [ resultsL, resultsR ] = await runQueries(query.split("INTERSECT", 2), options);
        return intersectResults(resultsL, resultsR);
    }

    if (/EXCEPT/.test(query)) {
        const [ resultsL, resultsR ] = await runQueries(query.split("EXCEPT", 2), options);
        return exceptResults(await resultsL, await resultsR);
    }

    const unionMatch = /UNION (ALL)?/.exec(query)
    if (unionMatch) {
        const qLEnd = unionMatch.index;
        const qRStart = qLEnd + unionMatch[0].length;
        const all = unionMatch[1] === "ALL";
        const queryL = query.substring(0, qLEnd);
        const queryR = query.substring(qRStart);
        const [ resultsL, resultsR ] = await runQueries([queryL, queryR], options);
        return all ? unionAllResults(resultsL, resultsR) : unionResults(resultsL, resultsR);
    }

    /**************
     * Matrix
     **************/

    if (/^TRANSPOSE/.test(query)) {
        const subQuery = await Query(query.replace(/TRANSPOSE\s*/, ""), options);

        const out = [];

        if (subQuery.length > 0) {
            const headers = subQuery[0];
            const dummyArray = Array(subQuery.length - 1).fill("");

            for (let i = 0; i < headers.length; i++) {
                out.push([headers[i], ...dummyArray.map((x, j) => subQuery[j+1][i])]);
            }

        }
        return out;
    }

    /* ########################################################
     * Beginning of simple (i.e. non-compound) query parsing
     * ######################################################## */

    const parsedQuery = parseQuery(query);

    // console.log(parsedQuery);

    if (!parsedQuery.from && !parsedQuery.select) {
        throw new Error("You must specify FROM or SELECT");
    }

    if (!parsedQuery.select) {
        // Default to selecting all scalar values
        parsedQuery.select = "*";
    }

    const select = parseSelect(parsedQuery.select);
    /** @type {Node[]} */
    const cols = select.children;
    /** @type {ParsedTable[]} */
    const parsedTables = parseFrom(parsedQuery.from);
    // console.log(parsedTables);
    const where = parsedQuery.where;
    const parsedWhere = parseWhere(where);
    const having = parsedQuery.having;
    const parsedHaving = parseWhere(having);
    // console.log(parsedWhere);
    const orderBy = parsedQuery['order by'];
    const groupBy = parsedQuery['group by'];
    const analyse = parsedQuery.explain === "ANALYSE" || parsedQuery.explain === "ANALYZE";

    /** @type {QueryContext} */
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

        setJoin,
        setJoinPredicate,

        getRowData,
        setRowData,
    };

    /** @type {Node[]} */
    const colNodes = [];
    const colHeaders = [];
    const colAlias = {};

    /** @type {{ [key: string]: ParsedTable }} */
    const tableAlias = {};
    for (const t of parsedTables) {
        let n = t.alias || t.name;
        let i = 1;
        while (n in tableAlias) {
            n = `${t.alias || t.name}_${i++}`;
        }
        t.alias = n;
        t.join = n;
        tableAlias[n] = t;
    }

    /** @type {ResultRow[]} */
    let rows;

    if (parsedTables.length === 0) {
        // If there is no table specified create one token row
        // so that we can return constants etc.
        rows = [[]];
    } else {
        const table = parsedTables[0];
        table.join = table.alias || table.name;

        const start = Date.now();

        /** @type {Array} */
        let results;

        if (table.name in CTEs) {
            results = CTEs[table.name];
        }
        else if (table.name in views) {
            results = queryResultToObjectArray(await Query(views[table.name], options));
        }
        else if (table.name in TABLE_VALUED_FUNCTIONS) {
            results = TABLE_VALUED_FUNCTIONS[table.name](...table.params.map(c => evaluateExpression([], c)));
        }
        else {
            if (typeof callbacks.primaryTable === "undefined") {
                throw new Error("PrimaryTable callback not defined");
            }

            results = await callbacks.primaryTable.call(self, table) || [];

            if (!Array.isArray(results)) {
                console.log(results);
                throw Error("Provider Error: Expected array but got " + typeof results);
            }
        }

        const totalTime = Date.now() - start;

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

        // Filter out any rows we can early to avoid extra processing
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

            const findResult = findJoin(table, rows);

            if (!findResult) {
                // All attempts at joining failed, intead we're going to do a
                // CROSS JOIN!

                let results;

                if (table.name in TABLE_VALUED_FUNCTIONS) {
                    results = TABLE_VALUED_FUNCTIONS[table.name](...table.params.map(c => evaluateExpression([], c)));
                }
                else {
                    if (typeof callbacks.primaryTable === "undefined") {
                        throw new Error(`All attempts at joining failed: ${table.name}`);
                    }

                    results = await callbacks.primaryTable.call(self, table) || [];
                }

                table.join = table.alias || table.name;
                table.explain += " cross-join";

                for (const row of rows) {
                    setRowData(row, table, results);
                }

            }

            rows = applyJoin(table, rows);

            // Filter out any rows we can early to avoid extra processing
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
            // @ts-ignore
            for (const [i,table] of parsedTables.entries()) {
                output([ i, ...Object.values(table).map(formatExplainCol) ]);
            }
            return output_buffer;
        }
    }

    function formatExplainCol (col) {
        return col && (col.source || col);
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

    for (const node of cols) {

        const nodeId = String(node.id);

        // Special Treatment for *
        if (node.type === NODE_TYPES.SYMBOL && nodeId.endsWith("*")) {
            if (rows.length === 0) {
                // We don't have any results so we can't determine the cols
                colNodes.push(node);
                colHeaders.push(node.id);
                continue;
            }

            const tName = nodeId.substring(0, nodeId.indexOf("."));

            const tables = node.id === "*" ? parsedTables : [ tableAlias[tName] ];

            // Add all the scalar columns for required tables
            for (const table of tables) {
                if (typeof table === "undefined") {
                    continue;
                }

                let tableObj;

                // We need to find a non-null row to extract columns from
                for (const tmpR of rows) {
                    tableObj = getRowData(tmpR, table);
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

                if (parsedTables.length > 1) {
                    newCols = newCols.map(c => `${table.alias || table.name}.${c}`);
                }
                colHeaders.push(...newCols);
            }
        } else {
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
        // @ts-ignore
        for(const [i, node] of colNodes.entries()) {
            if (node === null) {
                // This occurs when there were no rows to extract poperties from as columns
                //  e.g. Tutor.*
                row[i] = null;
                continue;
            }

            if (node.id === "ROWID") {
                row[i] = row['ROWID'];
                continue;
            }

            try {
                // First check if we're evaluating a window function
                if (node.over && node.id in AGGREGATE_FUNCTIONS) {
                    const partitionVal = evaluateExpression(row, node.over);
                    const group = rows.filter(r => collateEqual(evaluateExpression(r, node.over), partitionVal));
                    if (node.order) {
                        group.sort((ra, rb) => evaluateExpression(ra, node.order) - evaluateExpression(rb, node.order));
                    }

                    const fn = AGGREGATE_FUNCTIONS[node.id];
                    row[i] = fn(aggregateValues(group, node.children[0], node.distinct));
                } else {
                    row[i] = evaluateExpression(row, node);
                }
            } catch (e) {
                if (e instanceof SymbolError) {
                    row[i] = null;
                } else {
                    throw e;
                }
            }
        }
    }

    /*************
     * Grouping
     *************/
    if (groupBy) {
        rows = groupRows(rows, parseGroupBy(groupBy));
    }

    /**********************
     * Aggregate Functions
     *********************/
    // Now see if there are any aggregate functions to apply
    if (colNodes.some(node => node && node.id in AGGREGATE_FUNCTIONS && !node.over)) {
        if (rows.length === 0) {
            // Special case for COUNT(*)
            const index = colNodes.findIndex(n => n.id === "COUNT");
            if (index >= 0) {
                const row = [];
                row[index] = 0;
                rows = [row];
            }
        }
        else {
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
    }

    /*******************
     * Having Filtering
     ******************/
    if (parsedHaving) {
        rows = filterRowsByPredicate(rows, parsedHaving);
    }

    /*******************
     * Distinct
     *******************/
    if (select.distinct) {
        rows = distinctResults(rows);
    }

    /****************
     * Sorting
     ***************/
    if (orderBy) {
        // Parse the orderBy clause into an array of objects
        const parsedOrders = parseOrderBy(orderBy);

        // Pre-create ordering value array for each row
        rows.forEach(row => {
            row['orderBy'] = [];
        });

        rows = rows.sort((a,b) => {
            for (let depth = 0; depth < parsedOrders.length; depth++) {
                const orderNode = parsedOrders[depth];

                const valA = getOrderingValue(a, orderNode, depth);
                const valB = getOrderingValue(b, orderNode, depth);

                let sort = (Number.isFinite(valA) && Number.isFinite(valB)) ?
                    (valA - valB) :
                    String(valA).localeCompare(valB);

                if (sort !== 0) {
                    sort *= orderNode.desc ? -1 : 1;

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

    /***************************************************************************
     * #########################################################################
     * #                                                                       #
     * # END OF PROCESSING                                                     #
     * #                                                                       #
     * # Everything below is a helper function                                 #
     * #                                                                       #
     * #########################################################################
     **************************************************************************/

    /**
     * Execute an expresion from AST nodes
     * @param {ResultRow} row
     * @param {Node} node
     */
    function evaluateExpression(row, node) {
        if (node.type === NODE_TYPES.FUNCTION_CALL) {
            const fnName = node.id;

            if (fnName in AGGREGATE_FUNCTIONS) {
                // Don't evaluate aggregate functions until after grouping
                if (row['group']) {
                    const fn = AGGREGATE_FUNCTIONS[fnName];
                    return fn(aggregateValues(row['group'], node.children[0]));
                }
                return;
            }

            if (fnName in userFunctions) {
                const args = node.children.map(c => evaluateExpression(row, c));
                try {
                    return userFunctions[fnName](...args);
                } catch (e) {
                    return null;
                }
            }

            if (fnName in VALUE_FUNCTIONS) {
                try {
                    return VALUE_FUNCTIONS[fnName](...node.children.map(c => evaluateExpression(row, c)));
                } catch (e) {
                    return null;
                }
            }

            throw new Error(`Tried to call a non-existant function (${fnName})`);
        } else if (node.type === NODE_TYPES.SYMBOL) {
            const val = resolveValue(row, String(node.id));

            if (typeof val === "undefined") {
                // We must throw a SymbolError so that e.g. filterRows() can catch it
                throw new SymbolError("Unable to resolve symbol: " + node.id);
            }

            return val;
        } else if (node.type === NODE_TYPES.STRING) {
            // We need to check for date here and convert if necessary
            if (/^\d{4}-\d{2}-\d{2}/.test(String(node.id))) {
                const d = new Date(node.id);
                if (isValidDate(d)) {
                    return d;
                }
            }

            return String(node.id);
        } else if (node.type === NODE_TYPES.NUMBER) {
            return +node.id;
        } else if (node.type === NODE_TYPES.KEYWORD) {
            // Pass keywords like YEAR, SECOND, INT, FLOAT as strings
            return String(node.id);
        } else if (node.type === NODE_TYPES.OPERATOR) {
            const op = OPERATORS[node.id];

            if (!op) {
                throw new Error(`Unsupported operator '${node.id}'`);
            }

            return op(...node.children.map(c => evaluateExpression(row, c)));
        } else if (node.type === NODE_TYPES.CLAUSE
            && (node.id === "WHERE" || node.id === "ON")
        ) {
            if (node.children.length > 0) {
                return Boolean(evaluateExpression(row, node.children[0]));
            } else {
                throw new Error(`Empty predicate clause: ${node.id}`);
            }
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
            return rows.filter(r => {
                try {
                    return evaluateExpression(r, parsedWhere);
                } catch (e) {
                    if (e instanceof SymbolError) {
                        // If we got a symbol error it means we don't have enough
                        // symbols yet. If we're not strict we need to return true
                        // to carry on. If we are strict then the row fails.
                        return !strict;
                    } else {
                        throw e;
                    }
                }
            });
        }
        return rows;
    }

    /**
     * Creates a row evaluator (suitable for use in .map() or .filter())
     * which turns SymbolErrors into nulls
     * @param {Node} node
     * @returns {(row: ResultRow) => any}
     */
    function getRowEvaluator(node) {
        return row => {
            try {
                return evaluateExpression(row, node);
            }
            catch (e) {
                if (e instanceof SymbolError) {
                    return null;
                }
                else {
                    throw e;
                }
            }
        };
    }

    /**
     * Function to filter rows based on arbitrary expression
     * @param {ResultRow[]} rows
     * @param {Node} predicate
     * @return {ResultRow[]}
     */
    function filterRowsByPredicate (rows, predicate) {
        return rows.filter(getRowEvaluator(predicate));
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

        if (str === "null") return null;

        // Check for quoted string
        if ((str.startsWith("'") && str.endsWith("'")) ||
                (str.startsWith('"') && str.endsWith('"'))) {


            const stripped = str.substring(1, str.length-1);

            // Check for date
            if (/^\d/.test(stripped)) {
                // Must start with a number - for some reason
                // 'Room 2' parses as a valid date
                const d = new Date(stripped);
                if (isValidDate(d)) {
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

        // If row is null, there's nothing we can do
        if (row === null) {
            throw Error("Resolve Value Error: NULL Row");
        }

        // First check if we have an exact alias match,
        // this trumps other methods in name collisions
        if (typeof colAlias[col] !== "undefined") {
            const i = colAlias[col];

            if (typeof row[i] !== "undefined") {
                return row[i];
            }
        }

        // All methods after this require row data
        if (!row['data']) {
            throw Error("Resolve Value Error: No row data");
        }

        let head = col;
        let tail;
        while(head.length > 0) {

            // FROM Table AS t SELECT t.value
            if (head in tableAlias) {
                const t = tableAlias[head];

                // resolveValue() is called when searching for a join
                // if we're at that stage getRowData(row, t) will be
                // empty so we need to return undefined.
                const data = getRowData(row, t);

                if (typeof data === "undefined") {
                    return void 0;
                }

                return resolvePath(getRowData(row, t), tail);
            }

            // FROM Table SELECT Table.value
            const matching = parsedTables.filter(t => t.name === head);
            if (matching.length > 0) {
                const t = matching[0];
                return resolvePath(getRowData(row, t), tail);
            }

            if (head in row['data']) {
                return resolvePath(row['data'][head], tail);
            }

            for (let join in row['data']) {
                const joinedName = `${join}.${head}`;
                if (joinedName in row['data']) {
                    return resolvePath(row['data'][joinedName], tail);
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
            return null;
            // throw new Error("Trying to resolve a path on a null object: " + path)
        }
        if (process.env.NODE_ENV !== "production" && typeof data['ROWID'] !== "undefined") {
            console.error("It looks like you passed a row to resolvePath");
        }
        if (typeof path === "undefined") {
            return data;
            // throw new Error("No path provided");
        }

        // Check if the object key name exists with literal dots
        // nb. this can only search one level deep
        if (path in data) {
            return data[path];
        }

        // resolve dotted path
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
            if (node.type === NODE_TYPES.FUNCTION_CALL) {
                if (node.id in AGGREGATE_FUNCTIONS) {
                    const fn = AGGREGATE_FUNCTIONS[node.id];

                    let filteredRows = rows;

                    if (node.filter) {
                        filteredRows = filteredRows.filter(getRowEvaluator(node.filter));
                    }

                    row[i] = fn(aggregateValues(filteredRows, node.children[0], node.distinct));
                } else {
                    throw new Error("Function not found: " + node.id);
                }
            }
        });

        return row;
    }

    /**
     *
     * @param {any[][]} rows
     * @param {Node} expr
     * @param {boolean} distinct
     * @returns {any[]}
     */
    function aggregateValues (rows, expr, distinct = false) {
        // COUNT(*) includes all rows, NULLS and all
        // we don't need to evaluate anything and can just bail early
        if (expr.id === "*") {
            return rows.map(r => true);
        }

        let values = rows.map(getRowEvaluator(expr));

        // All aggregate functions ignore null except COUNT(*)
        // We'll use our convenient 'IS NOT NULL' function to do the
        // filtering for us.
        values = values.filter(OPERATORS['IS NOT NULL']);

        if (distinct) {
            values = Array.from(new Set(values));
        }

        return values;
    }

    /**
     * @param {any[]} row
     * @param {Node} parsedOrder
     * @param {number} depth
     */
    function getOrderingValue (row, parsedOrder, depth) {
        let va = row['orderBy'][depth];

        // The first time this row is visited (at this depth) we'll
        // calculate its ordering value.
        if (typeof va === "undefined") {
            let v;

            if (parsedOrder.type === NODE_TYPES.NUMBER) {
                // Column numbers are 1-indexed
                v = row[+parsedOrder.id - 1];
            }
            else if (parsedOrder.type === NODE_TYPES.SYMBOL && parsedOrder.id in colAlias) {
                v = row[colAlias[parsedOrder.id]];
            }
            else {
                v = evaluateExpression(row, parsedOrder);
            }

            if (typeof v === "undefined") {
                throw new Error("Order by unknown column: " + parsedOrder.source);
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
     * @param {Node[]} parsedGroupBy
     * @returns {any[]}
     */
    function groupRows (rows, parsedGroupBy) {
        const groupByMap = {};

        for(const row of rows) {
            const key = JSON.stringify(parsedGroupBy.map(g => evaluateExpression(row, g)));

            if (!groupByMap[key]) {
                groupByMap[key] = [];
            }

            groupByMap[key].push(row);
        }

        return Object.values(groupByMap).map(rows => {
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

    /**
     *
     * @param {string} symbol
     * @param {string|string[]} [operator]
     */
    function findWhere (symbol, operator="=") {
        if (!parsedWhere) {
            return; // undefined
        }

        return traverseWhereTree(parsedWhere, symbol, operator);
    }

    /**
     *
     * @param {Node} node
     * @param {string} symbol
     * @param {string|string[]} operator
     * @returns {string|number}
     */
    function traverseWhereTree (node, symbol, operator="=") {
        if (node.type !== NODE_TYPES.OPERATOR) {
            return; // undefined
        }

        if (operator === null || node.id === operator ||
            (Array.isArray(operator) && operator.includes(String(node.id))))
        {
            let operand1 = node.children[0];
            let operand2 = node.children[1];

            if (operand2.type === NODE_TYPES.SYMBOL) {
                [ operand1, operand2 ] = [ operand2, operand1 ];
            }

            if (operand1.type === NODE_TYPES.SYMBOL &&
                operand1.id === symbol &&
                (operand2.type === NODE_TYPES.NUMBER ||
                operand2.type === NODE_TYPES.STRING))
            {
                return operand2.id;
            }
        }
        else if (node.id === "AND") {
            const child1 = traverseWhereTree(node.children[0], symbol, operator);
            if (typeof child1 !== "undefined") {
                return child1;
            }

            const child2 = traverseWhereTree(node.children[1], symbol, operator);
            return child2;
        } else {
            return; // undefined
        }
    }

    /**
     * Given a set of rows, try to identify where a table can be joined.
     *
     * It will look at data on the table object and search the rows to try
     * and auto join if possible. Once it has found the join location it
     * will set the join path on the table object.
     *
     * It will return a boolean indicating its success.
     * @param {ParsedTable} table
     * @param {ResultRow[]} rows
     * @returns {boolean}
     */
    function findJoin (table, rows) {
        if (table.join) {
            // If we have an explicit join, check it first.

            // First check of explicit join check is in data object.
            // This may already have been set for us by a beforeJoin callback.
            for (const row of rows) {
                const data = getRowData(row, table);

                if (typeof data !== "undefined" && data !== null) {
                    return true;
                }
            }

            // If we get to this point no data has been set for us on the rows
            // But if we have a predicate which was set in beforeJoin()
            // we will do a primary table join.
            // For that we need to unset `table.join` so that the higher up
            // functions know the data doesn't exist on the rows yet
            if (table.predicate) {
                return false;
            }
        }

        //     // We didn't have the data set for us, so let's search ourselves

        //     // Iterate over rows until we find one that works
        //     for (const row of rows) {
        //         const val = resolveValue(row, table.join);

        //         if (typeof val !== "undefined") {
        //             // If we found `val` that means `table.join` is correct
        //             return true;
        //         }
        //     }

        //     throw new Error("Invalid ------join?----- clause: " + table.join);

        // } else {
            // AUTO JOIN! (natural join, comma join, implicit join?)
            // We will find the path automatically
            const t = table.name.toLowerCase();

            for (const r of rows) {
                const path = findPath(r, t);

                if (typeof path !== "undefined"){
                    table.join = path.length === 0 ? t : `${path}.${t}`;
                    return true;
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
                        table.join = join.length === 0 ? ts : `${join}.${ts}`;
                        return true;
                    }

                    throw new Error("Unable to join, found a plural but not an array: " + ts);
                }
            }

        return false;
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
            if (typeof getRowData(row, table) === "undefined") {
                setRowData(row, table, resolveValue(row, table.join));
            }

            const data = getRowData(row, table);

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

        if (table.predicate) {
            return filterRowsByPredicate(newRows, table.predicate);
        }

        return newRows;
    }
}

/**
 *
 * @param {string[]} queries
 * @param {*} options
 * @returns {Promise<any[][][]>}
 */
function runQueries (queries, options) {
    return Promise.all(queries.map(q => Query(q, options)));
}

/**
 *
 * @param {any[][]} result
 * @returns {any[]}
 */
function queryResultToObjectArray (result) {
    const headers = result.shift();

    return result.map(r => zip(headers, r));
}

/**
 *
 * @param {string[]} keys
 * @param {any[]} values
 * @returns {{ [key: string]: any }}
 */
function zip (keys, values) {
    const out = {};
    for (let i = 0; i < keys.length; i++) {
        out[keys[i]] = values[i];
    }
    return out;
}

/**
 * Compares two values to see if they are equal by collation rules
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function collateEqual (a, b) {
    if (typeof a !== typeof b) return false;

    if (typeof a === "object") {
        // Assume it is like a date and try to compare numerically
        return +a === +b;
    }

    return a === b;
}

function setJoin (table, targetTable) {
    table.join = `${targetTable.join}.${table.name}`;
}

/**
 * @param {ParsedTable} table
 * @param {string} predicate
 */
function setJoinPredicate (table, predicate) {
    table.predicate = parseString(predicate);
}

function getRowData (row, table) {
    return row['data'][table.join];
}

function setRowData (row, table, data) {
    row['data'][table.join] = data;
}