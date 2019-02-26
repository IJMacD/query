const Parser = require('./parser');
const persist = require('./persist');
const { intersectResults, exceptResults, unionResults, unionAllResults } = require('./compound');
const evaluateQuery = require('./evaluate-query');

const VIEW_KEY = "views";

class Query {
    constructor () {
        /** @type {{ [name: string]: import('../types').Schema }} */
        this.providers = {};

        /** @type {import('../types').Schema} */
        this.schema = null;

        /** @type {{ [name: string]: string }} */
        this.views = persist.getItem(VIEW_KEY) || {};
    }

    /**
     * @param {import('../types').Schema} schema
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

        const parsedQuery = Parser.parse(query);

        return await evaluateQuery(parsedQuery, this.providers, this.views);
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
