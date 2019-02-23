const Parser = require('./parser');
const { scalar } = require('./util');
const { getRows, processColumns, populateValues } = require('./process');
const { setJoin, setJoinPredicate, getRowData, setRowData } = require('./joins');
const { resolveConstant, resolvePath, valueResolver, setTableAliases } = require('./resolve');
const { getEvaluator, evaluateConstantExpression } = require('./evaluate');
const { filterRows, traverseWhereTree } = require('./filter');
const { groupRows, populateAggregates } = require ('./aggregates');
const { sortRows } = require('./sort');
const { explain } = require('./explain');
const persist = require('./persist');
const { intersectResults, exceptResults, unionResults, unionAllResults, distinctResults } = require('./compound');
const { getSubqueries, getCTEsMap } = require('./subquery');
const { nodeToQueryObject, nodesToTables, getWindowsMap } = require('./prepare');

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ParsedTable} ParsedTable
 * @typedef {import('../types').WindowSpec} WindowSpec
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').QueryCallbacks} QueryCallbacks
 * @typedef {import('../types').QueryContext} QueryContext
 */

const VIEW_KEY = "views";

/**
 * @type {{ [name: string]: string }}
 */
const views = persist.getItem(VIEW_KEY) || {};

class Query {
    constructor () {
        this.providers = {};
    }

    addProvider (name, options) {
        this.providers[name] = options;
    }

    /**
     * @param {string} query
     * @returns {Promise<any[][]>}
     */
    async run (query) {

        const viewMatch = /^CREATE VIEW ([a-zA-Z0-9_]+) AS\s+/.exec(query);
        if (viewMatch)
        {
            const name = viewMatch[1];
            const view = query.substring(viewMatch[0].length);

            views[name] = view;

            persist.setItem(VIEW_KEY, views);

            return [];
        }

        /****************
         * Set Functions
         ****************/

        if (/INTERSECT/.test(query)) {
            const [ resultsL, resultsR ] = await this.runQueries(query.split("INTERSECT", 2));
            return intersectResults(resultsL, resultsR);
        }

        if (/EXCEPT/.test(query)) {
            const [ resultsL, resultsR ] = await this.runQueries(query.split("EXCEPT", 2));
            return exceptResults(await resultsL, await resultsR);
        }

        const unionMatch = /UNION (ALL)?/.exec(query)
        if (unionMatch) {
            const qLEnd = unionMatch.index;
            const qRStart = qLEnd + unionMatch[0].length;
            const all = unionMatch[1] === "ALL";
            const queryL = query.substring(0, qLEnd);
            const queryR = query.substring(qRStart);
            const [ resultsL, resultsR ] = await this.runQueries([queryL, queryR]);
            return all ? unionAllResults(resultsL, resultsR) : unionResults(resultsL, resultsR);
        }

        /**************
         * Matrix
         **************/

        if (/^TRANSPOSE/.test(query)) {
            const subQuery = await this.run(query.replace(/TRANSPOSE\s*/, ""));

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

        // Everything above was to process a compound query of some
        // description. If we've got to this point we just need to
        // perform a "simple" query.

        return simpleQuery.call(this, query);
    }

    /**
     *
     * @param {string[]} queries
     * @returns {Promise<any[][][]>}
     */
    runQueries (queries) {
        return Promise.all(queries.map(q => this.run(q)));
    }

}

module.exports = Query;


/**
 *
 * @param {string} sql
 * @this {Query}
 */
async function simpleQuery (sql) {
    const parsedQuery = Parser.parse(sql);

    return await evaluateQuery.call(this, parsedQuery);
}

/**
 * @this {Query}
 * @param {Node} statementNode
 */
async function evaluateQuery (statementNode) {

    // TODO: Only uses first provider
    const key = Object.keys(this.providers)[0];
    const options = this.providers[key] || {};
    options.name = key;

    const { userFunctions = {} } = options;

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    const query = nodeToQueryObject(statementNode);

    if (query.values) {
        // VALUES clause trumps everything else
        return evaluateValues(query.values);
    }

    const select = query.select;
    const rawCols = select;

    const subqueries = await getSubqueries(evaluateQuery.bind(this), query.from);
    /** @type {ParsedTable[]} */
    const tables = nodesToTables(query.from);
    /** @type {boolean} */
    const analyse = query.explain && (query.explain.id === "ANALYSE" || query.explain.id === "ANALYZE");
    /** @type {{ [name: string]: any[] }} */
    const CTEs = query.with ? await getCTEsMap(evaluateQuery.bind(this), query.with) : {};
    /** @type {{ [name: string]: WindowSpec }} */
    const windows = query.window ? getWindowsMap(query.window) : {};

    const colNodes = [];
    const colHeaders = [];
    const colAlias = {};

    /** @type {QueryContext} */
    const self = {
        cols: colNodes,
        parsedTables: tables,
        parsedWhere: query.where,
        parsedHaving: query.having,
        orderBy: query['order by'],
        groupBy: query['group by'],
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

        subqueries,
        CTEs,
        views,
        userFunctions,

        options,
    };

    const evaluate = getEvaluator(self);

    /** @type {ResultRow[]} */
    let rows;

    // Set auto aliases i.e. avoid duplicates
    setTableAliases(tables);

    if (tables.length === 0) {
        // If there is no table specified create one token row
        // so that we can return constants etc.
        rows = [
            []
        ];
    } else {
        rows = await getRows(this, self);
    }

    /*************
     * EXPLAIN
     ************/

    if (typeof query.explain !== "undefined") {
        return explain(tables, analyse);
    }

    /******************
     * Filtering
     *****************/

    // One last filter, this time strict because there shouldn't be
    // anything slipping through since we have all the data now.
    rows = filterRows(evaluate, rows, query.where);

    /******************
     * Columns
     ******************/
    const colVars = { colNodes, colHeaders, colAlias };
    processColumns({ tables, colVars }, rawCols, rows);

    /*****************
     * Column Values
     *****************/
    populateValues(evaluate, colNodes, rows);

    /*************
     * Grouping
     *************/
    if (query['group by']) {
        rows = groupRows(evaluate, rows, query['group by']);
    }

    /**********************
     * Aggregate Functions
     *********************/
    // Now see if there are any aggregate functions to apply
    rows = populateAggregates(evaluate, colNodes, rows, query['group by']);

    /*******************
     * query.Having Filtering
     ******************/
    if (query.having) {
        rows = filterRows(evaluate, rows, query.having);
    }

    /*******************
     * Distinct
     *******************/
    if (statementNode.children.some(c => c.id === "SELECT" && c.distinct)) {
        rows = distinctResults(rows);
    }

    /****************
     * Sorting
     ***************/
    if (query['order by']) {
        // Parse the orderBy clause into an array of objects
        rows = sortRows({ evaluate, colAlias }, rows, query['order by']);
    }

    /******************
     * Limit and Offset
     ******************/
    rows = applyLimit(rows, query.limit, query.offset);

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
        return valueResolver({ evaluate, tables, colAlias, cols: colNodes }, row, col, rows);
    }

    function findTable (name) {
        return tables.find(t => t.name === name && t.join !== undefined);
    }

    /**
     * @param {string} symbol
     * @param {string|string[]} [operator]
     */
    function findWhere (symbol, operator="=") {
        if (!query.where) {
            return; // undefined
        }

        return traverseWhereTree(query.where, symbol, operator);
    }
}

function applyLimit(rows, limit, offset) {
    const start = offset ? evaluateConstantExpression(offset) : 0;
    const end = limit ? (start + evaluateConstantExpression(limit)) : rows.length;
    return rows.slice(start, end);
}

/**
 *
 * @param {Node[]} values
 */
function evaluateValues (values) {
    const firstRow = values[0];

    if (!firstRow) {
        return [];
    }

    const width = firstRow.children.length;
    const headers = Array(width).fill(0).map((_, i) => `Col ${i + 1}`);

    const out = values.map(row => row.children.map(col => col.id));

    out.unshift(headers);

    return out;
}