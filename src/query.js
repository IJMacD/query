const Parser = require('./prepare/parser');
const persist = require('./persist');
const evaluateQuery = require('./evaluate/evaluate-query');
const evaluateCompoundQuery = require('./evaluate/evaluate-compound');
const { NODE_TYPES, DEBUG_NODE_TYPES } = require('./prepare/parser');
const { performDDL, VIEW_KEY } = require('./ddl');
const { queryResultToObjectArray } = require('./util');

/**
 * @typedef {import('..').Schema} Schema
 * @typedef {import('..').Node} Node
 */

class Query {
    constructor (minimalSchema = null) {
        /** @type {{ [name: string]: Schema }} */
        this.providers = {};

        /** @type {Schema} */
        this.schema = null

        if (minimalSchema) {
            const name = "SCHEMA_BASIC";
            /** @type {Schema} */
            const basicSchema = {
                name,
                callbacks: {
                    primaryTable: ({ name }) => minimalSchema[name],
                },
            };
            this.providers[name] = basicSchema;
            this.schema = basicSchema;
        }

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
        schema.name = name;

        if (!this.schema) {
            this.schema = schema;
        }
    }

    /**
     * @param {string} query
     * @returns {Promise<any[][]>}
     */
    async run (query, options={}) {
        if (await performDDL.call(this, query)) {
            // TODO: Should probably come up with a method of returning useful information
            // such as inserted row count;
            const EMPTY_RESULT = [];
            return EMPTY_RESULT;
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
        const results = await this.runSelect(query);

        if (options.output === "objects") {
            return queryResultToObjectArray(results);
        }

        return results;
    }

    /**
     * 
     * @param {string|Node} query 
     * @param {object} [params] 
     */
    runSelect (query, params) {        
        const parsedQuery = typeof query === "string" ? Parser.parse(query) : query;

        if (parsedQuery.type === NODE_TYPES.COMPOUND_QUERY) {
            return evaluateCompoundQuery(this, parsedQuery, params);
        }

        if (parsedQuery.type === NODE_TYPES.STATEMENT) {
            return evaluateQuery(this, parsedQuery, null, params);
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
