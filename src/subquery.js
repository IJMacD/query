module.exports = {
    getCTEsMap,
}

const { NODE_TYPES } = require('./parser');
const evaluateCompound = require('./evaluate-compound');
const { queryResultToObjectArray } = require('./util');

/**
 * @typedef {import('..')} Query
 * @typedef {import('..').Node} Node
 */

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

        out[node.id] = queryResultToObjectArray(await evaluateCompound(query, node.children[0]), node.headers);
    }

    return out;
}