const VIEW_KEY = "views";
const persist = require('./persist');
const { queryResultToObjectArray, split } = require('./util');

module.exports = { performDDL, VIEW_KEY };

/**
 * Check if query is actually a Database Management query e.g. CREATE, INSERT, DELETE, DROP etc.
 * @param {string} query 
 * @this {import('..')}
 */
async function performDDL (query) {

    const viewMatch = /^CREATE VIEW ([a-zA-Z0-9_]+) AS\s+/.exec(query);
    if (viewMatch)
    {
        const name = viewMatch[1];
        const view = query.substring(viewMatch[0].length);

        this.views[name] = view;

        persist.setItem(VIEW_KEY, this.views);

        return true;
    }

    const dropViewMatch = /^DROP VIEW ([a-zA-Z0-9_]+)/.exec(query);
    if (dropViewMatch)
    {
        const name = dropViewMatch[1];

        delete this.views[name]

        persist.setItem(VIEW_KEY, this.views);

        return true;
    }

    const tableMatch = /^CREATE TABLE ([a-zA-Z0-9_\.]+)(?: PRIMARY KEY ([a-zA-Z0-9_]+))?/.exec(query);
    if (tableMatch)
    {
        const name = tableMatch[1];
        const key = tableMatch[2];

        let tableName = name;
        let schemaName;

        if (name.includes(".")) {
            [ schemaName, tableName ] = split(name, ".", 2);
        }

        const { callbacks } = this.providers[schemaName] || this.schema;

        if (callbacks.createTable) {
            await callbacks.createTable(tableName, key);
            return true;
        } else {
            throw Error("Schema does not support creating tables");
        }
    }

    const insertMatch = /^INSERT INTO ([a-zA-Z0-9_\.]+)(?: \(([a-zA-Z0-9_, ]+)\))?/.exec(query);
    if (insertMatch)
    {
        const name = insertMatch[1];
        const cols = insertMatch[2] ? insertMatch[2].split(",").map(c => c.trim()) : null;

        let tableName = name;
        let schemaName;

        if (name.includes(".")) {
            [ schemaName, tableName ] = split(name, ".", 2);
        }

        let insertQuery = query.substring(insertMatch[0].length);
        /** @type {"error"|"ignore"|"update"} */
        let duplicate = "error";

        if (query.endsWith("ON DUPLICATE KEY IGNORE")) {
            insertQuery = insertQuery.substr(0, insertQuery.length - "ON DUPLICATE KEY IGNORE".length);
            duplicate = "ignore";
        } else if (query.endsWith("ON DUPLICATE KEY UPDATE")) {
            insertQuery = insertQuery.substr(0, insertQuery.length - "ON DUPLICATE KEY UPDATE".length);
            duplicate = "update";
        }

        let results = await this.runSelect(insertQuery);

        const objArray = queryResultToObjectArray(results, cols);

        const { callbacks } = this.providers[schemaName] || this.schema;

        if (callbacks.insertIntoTable) {
            await Promise.all(objArray.map(r => callbacks.insertIntoTable(tableName, r, duplicate)));
            return true;
        } else {
            throw Error("Schema does not support insertion");
        }
    }

    const updateMatch = /^UPDATE ([a-zA-Z0-9_\.]+)\s+SET ([a-zA-Z0-9_]+)\s*=\s*(.*)\s+WHERE ([a-zA-Z0-9_]+)\s*=\s*(.*)/.exec(query);
    if (updateMatch)
    {
        const name = updateMatch[1];
        const col = updateMatch[2];
        const expr = updateMatch[3];
        const whereCol = updateMatch[4];
        const whereExpr = updateMatch[5];

        let tableName = name;
        let schemaName;

        if (name.includes(".")) {
            [ schemaName, tableName ] = split(name, ".", 2);
        }

        // Simple constant expressions
        let results = await this.runSelect("SELECT " + expr);
        const updateVal = results[1][0];

        // Simple constant expressions
        let whereResults = await this.runSelect("SELECT " + whereExpr);
        const whereVal = whereResults[1][0];

        const { callbacks } = this.providers[schemaName] || this.schema;

        if (callbacks.updateTable) {
            await callbacks.updateTable(tableName, o => ({ ...o, [col]: updateVal }), o => o[whereCol] == whereVal);
            return true;
        } else {
            throw Error("Schema does not support update");
        }
    }

    const deleteMatch = /^DELETE FROM ([a-zA-Z0-9_\.]+)\s+WHERE ([a-zA-Z0-9_]+)\s*=\s*(.*)/.exec(query);
    if (deleteMatch)
    {
        const name = deleteMatch[1];
        const whereCol = deleteMatch[2];
        const whereExpr = deleteMatch[3];

        let tableName = name;
        let schemaName;

        if (name.includes(".")) {
            [ schemaName, tableName ] = split(name, ".", 2);
        }

        // Simple constant expressions
        let whereResults = await this.runSelect("SELECT " + whereExpr);
        const whereVal = whereResults[1][0];

        const { callbacks } = this.providers[schemaName] || this.schema;

        if (callbacks.deleteFromTable) {
            await callbacks.deleteFromTable(tableName, o => o[whereCol] == whereVal);
            return true;
        } else {
            throw Error("Schema does not support update");
        }
    }

    const dropMatch = /^DROP TABLE ([a-zA-Z0-9_\.]+)/.exec(query);
    if (dropMatch)
    {
        const name = dropMatch[1];

        let tableName = name;
        let schemaName;

        if (name.includes(".")) {
            [ schemaName, tableName ] = split(name, ".", 2);
        }

        const { callbacks } = this.providers[schemaName] || this.schema;

        if (callbacks.dropTable) {
            await callbacks.dropTable(tableName);
            return true;
        } else {
            throw Error("Schema does not support creating tables");
        }
    }

    return false;
}