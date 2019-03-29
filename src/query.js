const Parser = require('./parser');
const persist = require('./persist');
const evaluateQuery = require('./evaluate-query');
const evaluateCompoundQuery = require('./evaluate-compound');
const { NODE_TYPES, DEBUG_NODE_TYPES } = require('./parser');
const { queryResultToObjectArray } = require('./util');

const VIEW_KEY = "views";

/**
 * @typedef {import('..').Schema} Schema
 */

class Query {
    constructor () {
        /** @type {{ [name: string]: Schema }} */
        this.providers = {};

        /** @type {Schema} */
        this.schema = null;

        /** @type {{ [name: string]: string }} */
        this.views = persist.getItem(VIEW_KEY) || {};
    }

    /**
     * @param {Schema} schema
     * @param {string} [name]
     */
    addProvider (schema, name=undefined) {
        const providerCount = Object.keys(this.providers).length;
        name = name || schema.name || `SCHEMA_${providerCount + 1}`;

        this.providers[name] = schema;

        if (!this.schema) {
            this.schema = schema;
        }
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

            this.views[name] = view;

            persist.setItem(VIEW_KEY, this.views);

            return [];
        }

        const tableMatch = /^CREATE TABLE ([a-zA-Z0-9_]+)/.exec(query);
        if (tableMatch)
        {
            const name = tableMatch[1];

            if (this.schema.callbacks.createTable) {
                await this.schema.callbacks.createTable(name);
                return [];
            }

            return [];
        }

        const insertMatch = /^INSERT INTO ([a-zA-Z0-9_]+)(?: \(([a-zA-Z0-9_, ]+)\))?/.exec(query);
        if (insertMatch)
        {
            const name = insertMatch[1];
            const cols = insertMatch[2] ? insertMatch[2].split(",").map(c => c.trim()) : null;

            const insertQuery = query.substring(insertMatch[0].length);

            let results = await this.runSelect(insertQuery);

            const objArray = queryResultToObjectArray(results, cols);

            if (this.schema.callbacks.insertIntoTable) {
                await Promise.all(objArray.map(r => this.schema.callbacks.insertIntoTable(name, r)));
                return [];
            }

            return [];
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

        // If we got to this point we're executing a "SELECT"
        return this.runSelect(query);
    }

    runSelect (query) {
        const parsedQuery = Parser.parse(query);

        if (parsedQuery.type === NODE_TYPES.COMPOUND_QUERY) {
            return evaluateCompoundQuery(this, parsedQuery);
        }

        if (parsedQuery.type === NODE_TYPES.STATEMENT) {
            return evaluateQuery(this, parsedQuery);
        }

        throw new Error(`Cannot evaluate node type ${DEBUG_NODE_TYPES[parsedQuery.type]} as Query`);
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
