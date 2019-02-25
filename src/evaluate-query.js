const { scalar } = require('./util');
const { getRows, processColumns, populateValues } = require('./process');
const { setJoin, setJoinPredicate, getRowData, setRowData } = require('./joins');
const { resolveConstant, resolvePath, setTableAliases } = require('./resolve');
const { filterRows } = require('./filter');
const { groupRows, populateAggregates } = require ('./aggregates');
const { sortRows } = require('./sort');
const { explain } = require('./explain');
const { distinctResults } = require('./compound');
const { getSubqueries, getCTEsMap } = require('./subquery');
const { nodeToQueryObject, nodesToTables, getWindowsMap } = require('./prepare');
const evaluateValues = require('./evaluate-values');
const { applyLimit } = require('./limit');

module.exports = evaluateQuery;

/**
 * @typedef {import('../types')} Query
 * @typedef {import('../types').Schema} Schema
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ParsedTable} ParsedTable
 * @typedef {import('../types').WindowSpec} WindowSpec
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').QueryCallbacks} QueryCallbacks
 * @typedef {import('../types').QueryContext} QueryContext
 */


/**
 * @this {Query}
 * @param {Node} statementNode
 */
async function evaluateQuery (statementNode) {

    // TODO: Only uses first provider
    const key = Object.keys(this.providers)[0];
    /** @type {Schema} */
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
    /** @type {{ [alias: string]: number }} */
    const colAlias = {};

    /** @type {QueryContext} */
    const context = {
        cols: colNodes,
        colAlias,
        tables,

        where: query.where,
        having: query.having,
        orderBy: query['order by'],
        groupBy: query['group by'],
        windows,

        resolveConstant,
        resolvePath,
        resolveValue: this.resolveValue.bind(this),

        findTable: this.findTable.bind(this),
        findWhere: this.findWhere.bind(this),

        setJoin,
        setJoinPredicate,

        getRowData,
        setRowData,

        subqueries,
        CTEs,
        userFunctions,

        options,
    };

    this.context = context;

    const evaluate = this.evaluate.bind(this);

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
        rows = await getRows(this);
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
    rows = filterRows(this, rows, query.where);

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
        rows = filterRows(this, rows, query.having);
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
        rows = sortRows(evaluate, rows, query['order by']);
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
}