
module.exports = {
  runQueries,
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