module.exports = {
    getSubqueries,
    getCTEsMap,
}

const { NODE_TYPES } = require('./parser');
const evaluateQuery = require('./evaluate-query');
const { queryResultToObjectArray } = require('./util');

/**
 * @typedef {import('../types')} Query
 * @typedef {import('../types').Node} Node
 */

/**
 * @param {Query} query
 * @param {Node[]} nodes
 */
async function getSubqueries (query, nodes) {
    /** @type {{ [name: string]: any[] }} */
    const out = {};

    let i = 1;

    for (const node of nodes) {
        if (node.type === NODE_TYPES.STATEMENT) {
            const name = node.alias || `SUBQUERY_${i++}`;

            out[name] = queryResultToObjectArray(await evaluateQuery(query, node), node.headers);

            node.id = name;
            node.type = NODE_TYPES.SYMBOL;
            node.children.length = 0;
        }
    }

    return out;
}

/**
 * @param {Query} query
 * @param {Node[]} nodes
 */
async function getCTEsMap (query, nodes) {
    /** @type {{ [name: string]: any[] }} */
    const out = {};

    for (const node of nodes) {
        if (node.type !== NODE_TYPES.SYMBOL) {
            throw TypeError(`getCTEsMap: node isn't a symbol`);
        }

        out[node.id] = queryResultToObjectArray(await evaluateQuery(query, node.children[0]), node.headers);
    }

    return out;
}