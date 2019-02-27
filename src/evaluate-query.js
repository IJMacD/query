module.exports = evaluateQuery;

const { scalar } = require('./util');
const { getRows, processColumns, populateValues } = require('./process');
const { setTableAliases } = require('./resolve');
const { filterRows } = require('./filter');
const { groupRows, populateAggregates } = require ('./aggregates');
const { sortRows } = require('./sort');
const { explain } = require('./explain');
const { distinctResults } = require('./compound');
const { getSubqueries, getCTEsMap } = require('./subquery');
const { nodeToQueryObject, nodesToTables, getWindowsMap } = require('./prepare');
const evaluateValues = require('./evaluate-values');
const { applyLimit } = require('./limit');
const { getQueryContext } = require('./context');

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
 * @this {QueryContext}
 * @param {Node} statementNode
 * @return {Promise<any[]>}
 */
async function evaluateQuery (statementNode) {
    const { providers, views } = this;

    // TODO: Only uses first provider
    const key = Object.keys(providers)[0];
    /** @type {Schema} */
    const schema = providers[key] || {};
    schema.name = key;

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    const query = nodeToQueryObject(statementNode);

    if (query.values) {
        // VALUES clause trumps everything else
        return evaluateValues(query.values);
    }

    const select = query.select;
    const rawCols = select;

    const eQ = evaluateQuery.bind(this);

    const subqueries = await getSubqueries(eQ, query.from);
    /** @type {ParsedTable[]} */
    const tables = nodesToTables(query.from);
    /** @type {boolean} */
    const analyse = query.explain && (query.explain.id === "ANALYSE" || query.explain.id === "ANALYZE");
    /** @type {{ [name: string]: any[] }} */
    const CTEs = query.with ? await getCTEsMap(eQ, query.with) : {};
    /** @type {{ [name: string]: WindowSpec }} */
    const windows = query.window ? getWindowsMap(query.window) : {};

    /** @type {QueryContext} */
    const context = getQueryContext.call(this, {
        tables,
        query,
        windows,
        subqueries,
        CTEs,
        schema,
        providers,
        views,
    });

    const evaluate = context.evaluate;

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
        rows = await getRows.call(this, context);
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
    rows = filterRows(context, rows, query.where);

    /******************
     * Columns
     ******************/
    processColumns(context, rawCols, rows);

    /*****************
     * Column Values
     *****************/
    await populateValues(context, context.cols, rows);

    /*************
     * Grouping
     *************/
    if (query['group by']) {
        rows = groupRows(context, rows, query['group by']);
    }

    /**********************
     * Aggregate Functions
     *********************/
    // Now see if there are any aggregate functions to apply
    rows = populateAggregates(context, context.cols, rows, query['group by']);

    /*******************
     * query.Having Filtering
     ******************/
    if (query.having) {
        rows = filterRows(context, rows, query.having);
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

    output(context.colHeaders);
    rows.forEach(r => output(r.map(scalar)));
    // Print to stderr
    // console.warn(`${initialResultCount} results initally retrieved. ${rows.length} rows returned.`);

    return output_buffer;
}
