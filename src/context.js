const { setJoin, setJoinPredicate, getRowData, setRowData } = require('./joins');
const { resolveConstant, resolvePath } = require('./resolve');
const { valueResolver } = require('./resolve');
const { evaluate } = require('./evaluate');
const { traverseWhereTree } = require('./filter');

module.exports = {
  getQueryContext,
};

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
 * @returns {QueryContext}
 */
function getQueryContext({ tables, query, windows, subqueries, CTEs, schema, views, providers }) {
    const context = {
        query: this,

        cols: [],
        colHeaders: [],
        colAlias: {},
        tables,

        where: query.where,
        having: query.having,
        orderBy: query['order by'],
        groupBy: query['group by'],
        windows,

        evaluate: null,

        resolveConstant,
        resolvePath,
        resolveValue: null,

        findTable,
        findWhere,

        setJoin,
        setJoinPredicate,
        getRowData,
        setRowData,

        subqueries,
        CTEs,
        views,

        schema,
        providers,
        userFunctions: schema.userFunctions || {},
    };

    context.evaluate = evaluate.bind(context);
    context.resolveValue = valueResolver.bind(context);
    context.findTable = findTable.bind(context);
    context.findWhere = findWhere.bind(context);

    return context;
}

function findTable (name) {
    return this.tables.find(t => t.name === name && t.join !== undefined);
}

  /**
   * @param {string} symbol
   * @param {string|string[]} [operator]
   */
function findWhere (symbol, operator="=") {
    if (!this.where) {
        return; // undefined
    }

    return traverseWhereTree(this.where, symbol, operator);
}