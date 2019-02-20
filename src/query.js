const {
    VALUE_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
    OPERATORS,
    TABLE_VALUED_FUNCTIONS,
    WINDOW_FUNCTIONS
} = require('./const');

const {
    parseQuery,
    parseSelect,
    parseFrom,
    parseWhere,
    parseGroupBy,
    parseOrderBy,
    parseWindow,
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

const {
    getEvaluator,
    getRowEvaluator,
    evaluateConstantExpression,
    aggregateValues,
    rowSorter,
    comparator,
    SymbolError,
} = require('./evaluate');

const {
    explain,
    setAnalysis
} = require('./explain');

const persist = require('./persist');

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ParsedTable} ParsedTable
 * @typedef {import('../types').WindowSpec} WindowSpec
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').QueryCallbacks} QueryCallbacks
 * @typedef {import('../types').QueryContext} QueryContext
 */

const PendingValue = Symbol("Pending Value");

module.exports = Query;

const VIEW_KEY = "views";

/**
 * @type {{ [name: string]: string }}
 */
const views = persist.getItem(VIEW_KEY) || {};

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
        const view = query.substring(viewMatch[0].length);

        views[name] = view;

        persist.setItem(VIEW_KEY, views);

        return [];
    }

    const { callbacks, userFunctions = {} } = options;

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    /***************************
     * Common Table Expressions
     ***************************/
    /** @type {{ [name: string]: any[] }} */
    const CTEs = {};

    const withMatch = /^WITH ([a-zA-Z0-9_]+)\s*(?:\(([^)]+)\))? AS\s+/.exec(query);
    if (withMatch)
    {
        const name = withMatch[1];
        const headers = withMatch[2] && withMatch[2].split(",").map(v => v.trim());
        const cte = matchInBrackets(query.substr(withMatch[0].length));

        CTEs[name] = queryResultToObjectArray(await Query(cte, options), headers);

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

    /****************
     * VALUES Clause
     ****************/
    if (/^VALUES/.test(query)) {
        let index = "VALUES".length;
        const out = [];

        while (index < query.length) {
            const subString = query.substr(index);
            const match = matchInBrackets(subString);

            if (!match) break;

            // Parse comma list as JSON array for quoting and number forms
            out.push(JSON.parse(`[${match.replace(/'/g, '"')}]`));

            const start = subString.indexOf(match);
            index += start + match.length + 2;
        }

        if (out.length) {
            const width = out[0].length;
            const headers = Array(width).fill(0).map((_, i) => `Col ${i + 1}`);
            out.unshift(headers);
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
    const rawCols = select.children;
    /** @type {ParsedTable[]} */
    const parsedTables = parseFrom(parsedQuery.from);
    // console.log(parsedTables);
    const where = parsedQuery.where;
    const parsedWhere = parseWhere(where);
    const having = parsedQuery.having;
    const parsedHaving = parseWhere(having);
    // console.log(parsedWhere);
    const orderBy = parseOrderBy(parsedQuery['order by']);
    const groupBy = parseGroupBy(parsedQuery['group by']);
    const analyse = parsedQuery.explain === "ANALYSE" || parsedQuery.explain === "ANALYZE";

    /** @type {{ [name: string]: WindowSpec }} */
    const windows = parseWindow(parsedQuery.window);

    /** @type {QueryContext} */
    const self = {
        cols: rawCols,
        parsedTables,
        parsedWhere,
        parsedHaving,
        orderBy,
        groupBy,
        windows,

        resolveConstant,
        resolvePath,
        resolveValue,

        findTable,
        findWhere,

        setJoin,
        setJoinPredicate,

        getRowData,
        setRowData,

        CTEs,
        views,
        userFunctions,

        options,
    };

    const evaluate = getEvaluator(self);

    let colNodes;
    let colHeaders;
    let colAlias = {};

    /** @type {ResultRow[]} */
    let rows;

    // Set auto aliases i.e. avoid duplicates
    setTableAliases(parsedTables);

    if (parsedTables.length === 0) {
        // If there is no table specified create one token row
        // so that we can return constants etc.
        rows = [[]];
    } else {
        rows = await getRows({ ...self, evaluate, findJoin, callbacks });
    }

    /*************
     * EXPLAIN
     ************/

    if (typeof parsedQuery.explain !== "undefined") {
        return explain(parsedTables, analyse);
    }

    /******************
     * Filtering
     *****************/

    // One last filter, this time strict because there shouldn't be
    // anything slipping through since we have all the data now.
    rows = filterRows(evaluate, rows, parsedWhere);

    /******************
     * Columns
     ******************/
    const colVars = processColumns({ tables: parsedTables }, rawCols, rows);

    colNodes = colVars.colNodes;
    colHeaders = colVars.colHeaders;
    colAlias = colVars.colAlias;

    // console.log(parsedTables);
    // console.log(colNodes);

    /*****************
     * Column Values
     *****************/
    populateValues({ evaluate }, colNodes, rows);

    /*************
     * Grouping
     *************/
    if (groupBy) {
        rows = groupRows({ evaluate }, rows, groupBy);
    }

    /**********************
     * Aggregate Functions
     *********************/
    // Now see if there are any aggregate functions to apply
    rows = populateAggregates({ evaluate }, colNodes, rows, groupBy);

    /*******************
     * Having Filtering
     ******************/
    if (parsedHaving) {
        rows = filterRows(evaluate, rows, parsedHaving);
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
        rows = sortRows({ evaluate, colAlias }, rows, orderBy);
    }

    /******************
     * Limit and Offset
     ******************/
    rows = applyLimit(rows, parseInt(parsedQuery.limit), parseInt(parsedQuery.offset));

    /*****************
     * Output
     ****************/

    output(colHeaders);
    rows.forEach(r => output(r.map(scalar)));
    // Print to stderr
    // console.warn(`${initialResultCount} results initally retrieved. ${rows.length} rows returned.`);

    return output_buffer;

    /*************************
     * Helper functions
     ************************/

    function resolveValue (row, col, rows=null) {
        return valueResolver({ evaluate, tables: parsedTables, colAlias, cols: colNodes }, row, col, rows);
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
}

function applyLimit(rows, limit, offset) {
    const start = offset || 0;
    const end = start + (isNaN(limit) ? rows.length : limit);
    return rows.slice(start, end);
}

/**
 * Supposed to be an efficient sorter which aims to avoid evaluating
 * any more than necessary by caching results and bailing as soon as possible
 * @param {any} context
 * @param {ResultRow[]} rows
 * @param {Node[]} orderBy
 */
function sortRows({ evaluate, colAlias }, rows, orderBy) {
    // Pre-create ordering value array for each row
    rows.forEach(row => {
        row['orderBy'] = [];
    });

    rows = rows.sort((a, b) => {
        for (let depth = 0; depth < orderBy.length; depth++) {
            const orderNode = orderBy[depth];

            const valA = getOrderingValue({ evaluate, colAlias }, a, orderNode, depth);
            const valB = getOrderingValue({ evaluate, colAlias }, b, orderNode, depth);

            const sort = comparator(valA, valB, orderNode.desc);

            if (sort !== 0) {
                return sort;
            }
        }

        return 0;
    });

    return rows;
}

/**
 * @param {any} context
 * @param {any[]} row
 * @param {Node} parsedOrder
 * @param {ResultRow[]} [rows]
 * @param {number} depth
 */
function getOrderingValue ({ evaluate, colAlias }, row, parsedOrder, depth, rows=null) {
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
            v = evaluate(row, parsedOrder, rows);
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


async function getRows(ctx) {
    const { parsedTables, callbacks, findJoin, evaluate, resolveValue, parsedWhere } = ctx;
    let rows;

    for (let table of parsedTables) {
        const start = Date.now();
        let startupTime;

        table.join = table.alias || table.name;

        if (!rows) {
            /** @type {Array} */
            let results;

            results = await getPrimaryResults(ctx, table);

            startupTime = Date.now() - start;

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
        }
        else {
            if (callbacks.beforeJoin) {
                await callbacks.beforeJoin.call(self, table, rows);
            }

            startupTime = Date.now() - start;

            const findResult = findJoin(parsedTables, table, rows);

            if (!findResult) {
                // All attempts at joining failed, intead we're going to do a
                // CROSS JOIN!
                const results = await getPrimaryResults(ctx, table);

                table.explain += " cross-join";

                for (const row of rows) {
                    setRowData(row, table, results);
                }
            }

            rows = applyJoin({ evaluate, resolveValue }, table, rows);
        }

        const initialCount = rows.length;

        // Filter out any rows we can early to avoid extra processing
        rows = filterRows(evaluate, rows, parsedWhere, false);

        table.rowCount = rows.length;

        if (callbacks.afterJoin) {
            await callbacks.afterJoin.call(self, table, rows);
        }

        const totalTime = Date.now() - start;
        setAnalysis(table, startupTime, totalTime, initialCount, rows.length);
    }

    return rows;
}

/**
 * Function to filter rows based on WHERE clause
 * @param {ResultRow[]} rows
 * @param {Node} condition
 * @return {ResultRow[]}
 */
function filterRows (evaluate, rows, condition, strict = true) {
    if (condition) {
        return rows.filter(r => {
            try {
                return evaluate(r, condition, rows);
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
 * Traverse a sample object to determine absolute path
 * up to, but not including, given name.
 * Uses explicit join list.
 * @param {ParsedTable[]} tables
 * @param {ResultRow} row
 * @param {string} name
 * @returns {string}
 */
function findPath (tables, row, name) {
    for (const { join } of tables) {
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
 * Given a set of rows, try to identify where a table can be joined.
 *
 * It will look at data on the table object and search the rows to try
 * and auto join if possible. Once it has found the join location it
 * will set the join path on the table object.
 *
 * It will return a boolean indicating its success.
 * @param {ParsedTable[]} tables
 * @param {ParsedTable} table
 * @param {ResultRow[]} rows
 * @returns {boolean}
 */
function findJoin (tables, table, rows) {
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

    // AUTO JOIN! (natural join, comma join, implicit join?)
    // We will find the path automatically
    const t = table.name.toLowerCase();

    for (const r of rows) {
        const path = findPath(tables, r, t);

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
        const join = findPath(tables, r, ts);

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
 * @param {any} context
 * @param {ParsedTable} table
 * @param {ResultRow[]} rows
 * @returns {ResultRow[]}
 */
function applyJoin ({ resolveValue, evaluate }, table, rows) {
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
        return filterRows(evaluate, newRows, table.predicate);
    }

    return newRows;
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
function queryResultToObjectArray (result, newHeaders = null) {
    const originalHeaders = result.shift();

    return result.map(r => zip(newHeaders || originalHeaders, r));
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

/**
 * Make sure each table has a unique alias
 * @param {ParsedTable[]} tables
 */
function setTableAliases (tables) {
    /** @type {{ [alias: string]: ParsedTable }} */
    const tableAlias = {};

    for (const t of tables) {
        let n = t.alias || t.name;
        let i = 1;
        while (n in tableAlias) {
            n = `${t.alias || t.name}_${i++}`;
        }
        t.alias = n;
        t.join = n;
        tableAlias[n] = t;
    }
}

/**
 * Creates a map from alias to table
 * @param {ParsedTable[]} tables
 * @returns {{ [alias: string]: ParsedTable }}
 */
function getTableAliasMap (tables) {
    /** @type {{ [alias: string]: ParsedTable }} */
    const tableAlias = {};

    for (const t of tables) {
        let n = t.alias;
        tableAlias[n] = t;
    }

    return tableAlias;
}

function processColumns ({ tables }, cols, rows) {
    const colNodes = [];
    const colHeaders = [];
    const colAlias = {};

    const tableAlias = getTableAliasMap(tables);

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

            // Add all the scalar columns for required tables
            for (const table of (node.id === "*" ? tables : [ tableAlias[tName] ])) {
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

                if (tables.length > 1) {
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
        }

        colHeaders.forEach((col, i) => {
            if (typeof colAlias[col] === "undefined") {
                colAlias[col] = i;
            }
        });
    }

    return {
        colNodes,
        colHeaders,
        colAlias,
    };
}

/**
 * @param {any} context
 * @param {ParsedTable} table
 * @returns {Promise<any[]>}
 */
async function getPrimaryResults(context, table) {
    const { self, CTEs, views, callbacks, findWhere, options } = context;
    if (table.name in CTEs) {
        return CTEs[table.name];
    }

    if (table.name in views) {
        return queryResultToObjectArray(await Query(views[table.name], options));
    }

    const infoMatch = /^information_schema\.([a-z_]+)/.exec(table.name);
    if (infoMatch) {
        return await informationSchema({ callbacks, findWhere, options }, infoMatch[1]);
    }

    if (table.name in TABLE_VALUED_FUNCTIONS) {
        return TABLE_VALUED_FUNCTIONS[table.name](...table.params.map(c => evaluateConstantExpression(c)));
    }

    if (typeof callbacks.primaryTable === "undefined") {
        throw new Error("PrimaryTable callback not defined");
    }

    return await callbacks.primaryTable.call(context, table) || [];
}

async function informationSchema({ callbacks, findWhere, options }, schema) {
    switch (schema) {
        case "tables": {
            const results = [];
            let table_type = "BASE TABLE";

            if (typeof callbacks.getTables === "function") {
                results.push(...callbacks.getTables().map(table_name => ({ table_name, table_type })));
            }

            table_type = "VIEW";
            for (const table_name in views) {
                results.push({ table_name, table_type });
            }

            return results;
        }
        case "columns": {
            const results = [];
            const whereName = findWhere("table_name");

            if (typeof callbacks.getTables === "function" &&
                typeof callbacks.getColumns === "function") {
                const tables = callbacks.getTables();

                for (const table_name of tables) {
                    if (!whereName || table_name === whereName) {
                        const cols = await callbacks.getColumns(table_name);
                        results.push(...cols.map(({ name, type }, i) => ({
                            table_name,
                            column_name: name,
                            ordinal_position: i + 1,
                            data_type: type,
                        })));
                    }
                }
            }

            for (const table_name in views) {
                if (!whereName || table_name === whereName) {
                    const rows = await Query(views[table_name], options);
                    const headers = rows[0];
                    for (let i = 0; i < headers.length; i++) {
                        results.push({
                            table_name,
                            column_name: headers[i],
                            ordinal_position: i + 1,
                            data_type: rows.length > 1 ? typeof rows[1][i] : null,
                        });
                    }
                }
            }

            return results;
        }
        case "views": {
            const results = [];

            for (const table_name in views) {
                results.push({ table_name, view_definition: views[table_name] });
            }

            return results;
        }
        case "routines": {
            const results = [];

            function formatRoutine(routine_name, fn, data_type = null) {
                const definition = String(fn);
                const nativeMatch = /function ([a-zA-Z]+)\(\) { \[native code\] }/.exec(definition);

                return {
                    routine_name,
                    routine_type: "FUNCTION",
                    data_type,
                    routine_body: "EXTERNAL",
                    routine_definition: nativeMatch ? null : definition,
                    external_name: nativeMatch ? nativeMatch[1] : routine_name,
                    external_language: nativeMatch ? "c" : "js",
                };
            }

            for (const name in VALUE_FUNCTIONS) {
                results.push(formatRoutine(name, VALUE_FUNCTIONS[name]));
            }

            for (const name in AGGREGATE_FUNCTIONS) {
                results.push(formatRoutine(name, AGGREGATE_FUNCTIONS[name]));
            }

            for (const name in TABLE_VALUED_FUNCTIONS) {
                results.push(formatRoutine(name, TABLE_VALUED_FUNCTIONS[name], "table"));
            }

            for (const name in WINDOW_FUNCTIONS) {
                results.push(formatRoutine(name, WINDOW_FUNCTIONS[name]));
            }

            return results;
        }
        case "routine_columns": {
            const results = [];
            const whereName = findWhere("table_name");

            for (const table_name in TABLE_VALUED_FUNCTIONS) {
                if (!whereName || table_name === whereName) {
                    results.push({
                        table_name,
                        column_name: "value",
                        ordinal_position: 1,
                        data_type: null,
                    });
                }
            }

            return results;
        }
    }
}

function populateValues ({ evaluate }, cols, rows) {
    for(const row of rows) {
        // @ts-ignore
        for(const [i, node] of cols.entries()) {

            // Check to see if column's already been filled in
            if (typeof row[i] !== "undefined" && row[i] !== PendingValue) {
                continue;
            }

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
                // Use PendingValue flag to avoid infinite recursion
                row[i] = PendingValue;
                row[i] = evaluate(row, node, rows);
            } catch (e) {
                if (e instanceof SymbolError) {
                    row[i] = null;
                } else {
                    throw e;
                }
            }
        }
    }
}

function populateAggregates({ evaluate }, cols, rows, groupBy) {
    if (cols.some(node => node && node.id in AGGREGATE_FUNCTIONS && !node.window)) {
        if (rows.length === 0) {
            // Special case for COUNT(*)
            const index = cols.findIndex(n => n.id === "COUNT");
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
            rows = rows.map(row => computeAggregates({ evaluate }, cols, row['group']));
        }
    }
    return rows;
}

/**
 * Turns a group of rows into one aggregate row
 * @param {any} context
 * @param {Node[]} cols
 * @param {any[][]} rows
 * @return {any[]}
 */
function computeAggregates ({ evaluate }, cols, rows) {
    // If there are no rows (i.e. due to filtering) then
    // just return an empty row.
    if (rows.length === 0) {
        return [];
    }

    // Pick the first row from each group
    const row = rows[0];

    // Fill in aggregate values
    cols.forEach((node, i) => {
        // Ignore non-aggregate values
        // i.e. the ones already filled in
        if (typeof row[i] !== "undefined") {
            return;
        }

        if (node.type === NODE_TYPES.FUNCTION_CALL && !node.window) {
            if (node.id in AGGREGATE_FUNCTIONS) {
                const fn = AGGREGATE_FUNCTIONS[node.id];

                if (node.children.length === 0) {
                    throw new Error(`Function ${node.id} requires at least one paramater.`);
                }

                let filteredRows = rows;

                if (node.filter) {
                    filteredRows = filteredRows.filter(getRowEvaluator(evaluate, node.filter));
                }

                if (node.order) {
                    filteredRows.sort(rowSorter(evaluate, node.order));
                }

                // Aggregate values get special treatment for things like '*' and DISTINCT
                const args = node.children.map(n => aggregateValues(evaluate, filteredRows, n, node.distinct));
                row[i] = fn(...args);
            } else {
                throw new Error("Function not found: " + node.id);
            }
        }
    });

    return row;
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
            operand1.id === symbol)
        {
            // We've found the right node
            try {
                // Now try to evaluate it as a constant expression
                return evaluateConstantExpression(operand2);
            } catch (e) {
                return; // undefined
            }
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
 * Collapse multiple rows into a single row
 * @param {any} context
 * @param {any[][]} rows
 * @param {Node[]} groupBy
 * @returns {any[]}
 */
function groupRows ({ evaluate }, rows, groupBy) {
    const groupByMap = {};

    for(const row of rows) {
        const key = JSON.stringify(groupBy.map(g => evaluate(row, g, rows)));

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

/**
 * Resolve a col into a concrete value (constant or from object)
 * @param {any} context
 * @param {ResultRow} row
 * @param {string} col
 * @param {ResultRow[]} [rows]
 */
function valueResolver ({ evaluate, tables, colAlias, cols }, row, col, rows=null) {
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

        // We've struck upon an alias but the value hasn't been
        // evaluated yet.
        // Let's see if we can be helpful and fill it in now.
        if (typeof row[i] === "undefined") {
            row[i] = PendingValue;
            row[i] = evaluate(row, cols[i], rows);
        }

        if (typeof row[i] !== "undefined" && row[i] !== PendingValue) {
            return row[i];
        }
    }

    // All methods after this require row data
    if (!row['data']) {
        throw Error("Resolve Value Error: No row data");
    }

    const tableAlias = getTableAliasMap(tables);

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

            return resolvePath(data, tail);
        }

        // FROM Table SELECT Table.value
        const matching = tables.filter(t => t.name === head);
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
    for (const { join } of tables) {
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