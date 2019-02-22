module.exports = {
  getRows,
  getPrimaryResults,
  processColumns,
  populateValues,
};

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').ParsedTable} ParsedTable
 */

const { NODE_TYPES } = require('./parser');
const { informationSchema } = require('./information');
const { TABLE_VALUED_FUNCTIONS } = require('./const');
const { findJoin, applyJoin, setRowData, getRowData,  } = require('./joins');
const { filterRows } = require('./filter');
const { setAnalysis } = require('./explain');
const { getTableAliasMap, PendingValue } = require('./resolve');
const { scalar, queryResultToObjectArray } = require('./util');
const { evaluateConstantExpression, SymbolError } = require('./evaluate');

async function getRows(ctx) {
    const { parsedTables, callbacks, evaluate, resolveValue, parsedWhere } = ctx;
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
                await callbacks.beforeJoin.call(ctx, table, rows);
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
            await callbacks.afterJoin.call(ctx, table, rows);
        }

        const totalTime = Date.now() - start;
        setAnalysis(table, startupTime, totalTime, initialCount, rows.length);
    }

    return rows;
}

function processColumns ({ tables, colVars: { colNodes, colHeaders, colAlias } }, cols, rows) {
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
    const { CTEs, views, callbacks, findWhere, options, Query } = context;
    if (table.name in CTEs) {
        return CTEs[table.name];
    }

    if (table.name in views) {
        return queryResultToObjectArray(await Query(views[table.name], options));
    }

    const infoMatch = /^information_schema\.([a-z_]+)/.exec(table.name);
    if (infoMatch) {
        return await informationSchema({ callbacks, findWhere, options, views, Query }, infoMatch[1]);
    }

    if (table.name in TABLE_VALUED_FUNCTIONS) {
        return TABLE_VALUED_FUNCTIONS[table.name](...table.params.map(c => evaluateConstantExpression(c)));
    }

    if (typeof callbacks.primaryTable === "undefined") {
        throw new Error("PrimaryTable callback not defined");
    }

    return await callbacks.primaryTable.call(context, table) || [];
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