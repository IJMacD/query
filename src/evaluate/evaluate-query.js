module.exports = evaluateQuery;

const { scalar } = require('../util');
const { getRows, processColumns, populateValues } = require('./process');
const { setTableAliases } = require('./resolve');
const { filterRows } = require('../finalise/filter');
const { groupRows, populateAggregates } = require ('./aggregates');
const { sortRows } = require('../finalise/sort');
const { explain } = require('../explain');
const { distinctResults } = require('./compound');
const { getCTEsMap } = require('../prepare/subquery');
const { nodeToQueryObject, nodesToTables, getWindowsMap } = require('../prepare/prepare');
const evaluateValues = require('./evaluate-values');
const { applyLimit } = require('../finalise/limit');
const { getQueryContext } = require('../prepare/context');

/**
 * @typedef {import('../..')} Query
 * @typedef {import('../..').Schema} Schema
 * @typedef {import('../..').Node} Node
 * @typedef {import('../..').ParsedTable} ParsedTable
 * @typedef {import('../..').WindowSpec} WindowSpec
 * @typedef {import('../..').ResultRow} ResultRow
 * @typedef {import('../..').QueryCallbacks} QueryCallbacks
 * @typedef {import('../..').QueryContext} QueryContext
 */

/**
 * @typedef OuterContext
 * @prop {QueryContext} context 
 * @prop {ResultRow} row 
 * @prop {ResultRow[]} rows
 */

/**
 * @param {Query} query
 * @param {Node} statementNode
 * @param {OuterContext} [outer]
 * @param {{ [name: string]: any }} [params]
 * @return {Promise<any[]>}
 */
async function evaluateQuery (query, statementNode, outer = null, params = null) {
    const { providers, views } = query;

    // TODO: Only uses first provider
    const key = Object.keys(providers)[0];
    /** @type {Schema} */
    const schema = providers[key] || {};
    schema.name = key;

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    const clauses = nodeToQueryObject(statementNode);

    if (typeof clauses.explain !== "undefined" && clauses.explain.id === "AST") {
        const ast = { ...statementNode };
        ast.source = ast.source.replace("EXPLAIN AST ", "");
        ast.children = ast.children.filter(c => c.id !== "EXPLAIN");
        return [['AST'], [JSON.stringify(ast, null, 4)]];
    }

    if (clauses.values) {
        // VALUES clause trumps everything else
        return evaluateValues(clauses.values, params);
    }

    const select = clauses.select;
    const rawCols = select;

    /** @type {ParsedTable[]} */
    const tables = nodesToTables(clauses.from);
    /** @type {{ [name: string]: any[] }} */
    const CTEs = clauses.with ? await getCTEsMap(query, clauses.with) : {};
    /** @type {{ [name: string]: WindowSpec }} */
    const windows = clauses.window ? getWindowsMap(clauses.window) : {};

    /** @type {QueryContext} */
    const context = getQueryContext(query, {
        tables,
        clauses,
        windows,
        CTEs,
        schema,
        providers,
        views,
        outer,
        params,
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
        rows = await getRows(context);
    }

    /*************
     * EXPLAIN
     ************/

    if (typeof clauses.explain !== "undefined") {
        const analyse = clauses.explain.id == "ANALYSE";
        return explain(tables, analyse);
    }

    /******************
     * Filtering
     *****************/

    // One last filter, this time strict because there shouldn't be
    // anything slipping through since we have all the data now.
    rows = filterRows(context, rows, clauses.where);

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
    if (clauses['group by']) {
        rows = groupRows(context, rows, clauses['group by']);
    }

    /**********************
     * Aggregate Functions
     *********************/
    // Now see if there are any aggregate functions to apply
    rows = populateAggregates(context, context.cols, rows, clauses['group by']);

    /*******************
     * query.Having Filtering
     ******************/
    if (clauses.having) {
        rows = filterRows(context, rows, clauses.having);
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
    if (clauses['order by']) {
        // Parse the orderBy clause into an array of objects
        rows = sortRows(evaluate, rows, clauses['order by']);
    }

    /******************
     * Limit and Offset
     ******************/
    rows = applyLimit(rows, clauses.limit, clauses.offset, params);

    /*****************
     * Output
     ****************/

    output(context.colHeaders);
    rows.forEach(r => output(r.map(scalar)));
    // Print to stderr
    // console.warn(`${initialResultCount} results initally retrieved. ${rows.length} rows returned.`);

    return output_buffer;
}
