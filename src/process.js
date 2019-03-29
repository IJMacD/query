module.exports = {
  getRows,
  getPrimaryResults,
  processColumns,
  populateValues,
  populateValue,
};

/**
 * @typedef {import('..')} Query
 * @typedef {import('..').Node} Node
 * @typedef {import('..').ResultRow} ResultRow
 * @typedef {import('..').ParsedTable} ParsedTable
 * @typedef {import('..').QueryContext} QueryContext
 */

const Query = require('./query');
const { NODE_TYPES } = require('./parser');
const { informationSchema } = require('./information');
const { TABLE_VALUED_FUNCTIONS } = require('./const');
const { findJoin, applyJoin, setRowData, getRowData,  } = require('./joins');
const { filterRows } = require('./filter');
const { setAnalysis } = require('./explain');
const { getTableAliasMap, PendingValue } = require('./resolve');
const { scalar, queryResultToObjectArray } = require('./util');
const { evaluateConstantExpression, SymbolError, isConstantExpression } = require('./evaluate');
const evaluateStatement = require('./evaluate-query');

/**
 * @param {QueryContext} context
 */
async function getRows(context) {
    const { tables, where, query } = context;
    const { schema: { callbacks } } = query;
    let rows;

    for (let table of tables) {
        const start = Date.now();
        let startupTime;

        if (!rows) {
            /** @type {Array} */
            let results;

            results = await getPrimaryResults(context, table);
            startupTime = Date.now() - start;

            if (!results) {
                throw Error("Couldn't get Primary Results");
            }

            if (!Array.isArray(results)) {
                results = [ results ];
            }

            // console.log(`Initial data set: ${results.length} items`);

            // Poulate inital rows
            rows = results.map((r,i) => {
                /** @type {ResultRow} */
                const row = [];

                // Set inital data object
                row.data = {};
                setRowData(row, table, r);

                // Define a ROWID
                Object.defineProperty(row, 'ROWID', { value: String(i), writable: true });

                return row;
            });
        }
        else {
            if (callbacks.beforeJoin) {
                await callbacks.beforeJoin.call(context, table, rows);
            }

            startupTime = Date.now() - start;

            if (table.name in TABLE_VALUED_FUNCTIONS) {
                const fn = TABLE_VALUED_FUNCTIONS[table.name];
                const isConstant = table.params.every(p => isConstantExpression(p));

                // If the function call is purely constant, just evaluate it once
                const constantResults = isConstant && await fn(...table.params.map(p => evaluateConstantExpression(p)));

                await Promise.all(rows.map(async row => {
                    const results = constantResults || await fn(...table.params.map(p => context.evaluate(row, p, rows)));

                    setRowData(row, table, results);
                }));
            }
            else {
                const findResult = findJoin(tables, table, rows);

                if (!findResult) {
                    // All attempts at joining failed, intead we're going to do a
                    // CROSS JOIN!
                    const results = await getPrimaryResults(context, table);

                    table.explain += " cross-join";

                    for (const row of rows) {
                        setRowData(row, table, results);
                    }
                }
            }

            rows = applyJoin(context, table, rows);
        }

        const initialCount = rows.length;

        // Filter out any rows we can early to avoid extra processing
        rows = filterRows(context, rows, where, false);

        table.rowCount = rows.length;

        if (callbacks.afterJoin) {
            await callbacks.afterJoin.call(context, table, rows);
        }

        const totalTime = Date.now() - start;
        setAnalysis(table, startupTime, totalTime, initialCount, rows.length);
    }

    return rows;
}

/**
 * @param {QueryContext} context
 * @param {ResultRow[]} rows
 */
function processColumns (context, rawCols, rows) {
    const { tables, cols, colHeaders, colAlias } = context;

    const tableAlias = getTableAliasMap(tables);

    for (const node of rawCols) {

        const nodeId = String(node.id);

        // Special Treatment for *
        if (node.type === NODE_TYPES.SYMBOL && nodeId.endsWith("*")) {
            if (rows.length === 0) {
                // We don't have any results so we can't determine the cols
                cols.push(node);
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
                        cols.push(null);
                        colHeaders.push(`${table.alias || table.name}.*`);
                    }

                    continue;
                }

                // only add "primitive" columns
                let newCols = Object.keys(tableObj).filter(k => typeof scalar(tableObj[k]) !== "undefined");

                cols.push(...newCols.map(c => ({ type: NODE_TYPES.SYMBOL, id: `${table.alias}.${c}` })));

                if (tables.length > 1) {
                    newCols = newCols.map(c => `${table.alias || table.name}.${c}`);
                }
                colHeaders.push(...newCols);
            }
        } else {
            cols.push(node);
            colHeaders.push(node.alias || node.source || `Col ${cols.length}`);

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
}

/**
 * @param {QueryContext} context
 * @param {ParsedTable} table
 * @returns {Promise<any[]>}
 */
async function getPrimaryResults(context, table) {
    const { views, subqueries, CTEs } = context;

    let schemaName;
    let tableName = table.name;

    if (table.name.includes(".")) {
        [schemaName, tableName] = table.name.split(".", 2);
    }

    if (table.name in subqueries) {
        return subqueries[table.name];
    }

    if (table.name in CTEs) {
        return CTEs[table.name];
    }

    if (table.name in views) {
        return queryResultToObjectArray(await context.query.run(views[table.name]), table.headers);
    }

    if (schemaName === "information_schema") {
        return informationSchema(context, tableName);
    }

    if (table.name in TABLE_VALUED_FUNCTIONS) {
        return TABLE_VALUED_FUNCTIONS[table.name](...table.params.map(c => evaluateConstantExpression(c)));
    }

    const { callbacks } = context.providers[schemaName] || context.schema;

    if (typeof callbacks.primaryTable === "undefined") {
        throw new Error("PrimaryTable callback not defined");
    }

    // Just in case we've stripped off a schema name
    table.name = tableName;

    return callbacks.primaryTable.call(context, table) || [];
}

/**
 * @param {QueryContext} context
 * @param {Node[]} cols
 * @param {ResultRow[]} rows
 */
async function populateValues (context, cols, rows) {
    for(const row of rows) {
        // @ts-ignore
        for(const [i, node] of cols.entries()) {
            await populateValue(context, row, i, node, rows);
        }
    }
}

/**
 * @param {QueryContext} context
 * @param {ResultRow} row
 * @param {number} colNum
 * @param {Node} node
 * @param {ResultRow[]} rows
 */
async function populateValue (context, row, colNum, node, rows) {
    // Check to see if column's already been filled in
    if (typeof row[colNum] !== "undefined" && row[colNum] !== PendingValue) {
        return;
    }

    if (node === null) {
        // This occurs when there were no rows to extract poperties from as columns
        //  e.g. Tutor.*
        row[colNum] = null;
        return;
    }

    if (node.id === "ROWID") {
        row[colNum] = row['ROWID'];
        return;
    }

    if (node.type === NODE_TYPES.STATEMENT) {
        // We need to pass in the outer query context so that any symbols
        // the inner query doesn't understand can be handled by our resolver
        const results = await evaluateStatement(context.query, node, { context, row, rows });

        if (results && results.length >= 2) {
            row[colNum] = results[1][0];
        } else {
            row[colNum] = null;
        }

        return;
    }

    try {
        // Use PendingValue flag to avoid infinite recursion
        row[colNum] = PendingValue;
        row[colNum] = context.evaluate(row, node, rows);
    } catch (e) {
        if (e instanceof SymbolError) {
            row[colNum] = null;
        } else {
            throw e;
        }
    }
}