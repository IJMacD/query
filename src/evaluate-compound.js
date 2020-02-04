module.exports = evaluateCompound;

const evaluateQuery = require('./evaluate-query');
const { NODE_TYPES, DEBUG_NODE_TYPES } = require('./parser');
const { COMPOUND_OPERATORS } = require('./compound');

/**
 * @typedef {import('..')} Query
 * @typedef {import('..').Node} Node
 * @typedef {import('..').NodeTypes} NodeTypes
 * @typedef {import('..').ResultRow} ResultRow
 */

/**
 *
 * @param {Query} query
 * @param {Node} node
 * @param {object} [params]
 * @returns {Promise<ResultRow[]>}
 */
async function evaluateCompound (query, node, params=null) {
  if (node.type === NODE_TYPES.STATEMENT) {
    return evaluateQuery(query, node, null, params);
  }

  if (node.type !== NODE_TYPES.COMPOUND_QUERY) {
    throw new Error(`Cannot evaluate node type ${DEBUG_NODE_TYPES[node.type]} as COMPOUND_QUERY`);
  }

  const [ resultsL, resultsR ] = await Promise.all(node.children.map(c => evaluateCompound(query, c, params)));

  return COMPOUND_OPERATORS[node.id](resultsL, resultsR);
}