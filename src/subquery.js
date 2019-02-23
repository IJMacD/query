
module.exports = {
    runQueries,
    getSubqueries,
    getCTEsMap,
}

const Query = require('./query');
const { NODE_TYPES } = require('./parser');
const { queryResultToObjectArray } = require('./util');

/**
 * @typedef {import('../types').Node} Node
 */

/**
 *
 * @param {string[]} queries
 * @param {*} options
 * @returns {Promise<any[][][]>}
 */
function runQueries (queries, options) {
    return Promise.all(queries.map(q => Query(q, options)));
}

/**
 *
 * @param {Node[]} nodes
 */
async function getSubqueries (evaluateQuery, nodes, options) {
    /** @type {{ [name: string]: any[] }} */
    const out = {};

    let i = 1;

    for (const node of nodes) {
        if (node.type === NODE_TYPES.STATEMENT) {
            const name = node.id || `SUBQUERY_${i++}`;

            out[name] = queryResultToObjectArray(await evaluateQuery(node, options));

            node.id = name;
            node.type = NODE_TYPES.SYMBOL;
            node.children.length = 0;
        }
    }

    return out;
}

/**
 *
 * @param {Node[]} nodes
 */
async function getCTEsMap (evaluateQuery, nodes, options) {
    /** @type {{ [name: string]: any[] }} */
    const out = {};

    for (const node of nodes) {
        if (node.type !== NODE_TYPES.SYMBOL) {
            throw TypeError(`getCTEsMap: node isn't a symbol`);
        }

        out[node.id] = queryResultToObjectArray(await evaluateQuery(node.children[0], options), node.headers);
    }

    return out;
}