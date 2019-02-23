module.exports = {
  nodeToQueryObject,
  nodesToTables,
  getWindowsMap
};

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ParsedTable} ParsedTable
 * @typedef {import('../types').WindowSpec} WindowSpec
 */

const { NODE_TYPES } = require('./parser');

function nodeToQueryObject (node) {
  if (node.type !== NODE_TYPES.STATEMENT) {
      throw TypeError("Not a statement node")
  }

  const out = {};

  for (const clause of node.children) {
      const name = clause.id.toString().toLowerCase();

      if (/FROM|SELECT|ORDER BY|GROUP BY|WINDOW|WITH|VALUES/.test(clause.id)) {
          out[name] = clause.children;
      } else {
          out[name] = clause.children[0];
      }
  }

  if (!out.from && !out.select && !out.values) {
      throw new Error("You must specify FROM or SELECT or VALUES");
  }

  if (!out.from) {
      out.from = [];
  }

  if (!out.select) {
      out.select = [];
  }

  if (out.select.length === 0) {
      out.select.push({ type: NODE_TYPES.SYMBOL, id: "*" });
  }

  return out;
}

/**
*
* @param {Node[]} nodes
* @returns {ParsedTable[]}
*/
function nodesToTables (nodes) {
    return nodes.map(node => {

        if (node.type !== NODE_TYPES.SYMBOL &&
            node.type !== NODE_TYPES.FUNCTION_CALL)
        {
            throw new Error(`Node type ${node.type} cannot be a table`);
        }

        const name = String(node.id);
        const using = name; // ast.using

        return {
            name,
            alias: node.alias,
            join: using,
            predicate: node.predicate,
            inner: node.inner,
            params: node.children,
            explain: "",
            rowCount: 0
        };
    });
}

/**
*
* @param {Node[]} nodes
*/
function getWindowsMap (nodes) {
  /** @type {{ [name: string]: WindowSpec }} */
  const out = {};

  for (const node of nodes) {
      if (node.type !== NODE_TYPES.SYMBOL) {
          throw TypeError(`getWindowsMap: node isn't a symbol`);
      }

      if (!node.window || typeof node.window === "string") {
          throw TypeError(`Window '${node.id}' doesn't have a definition`)
      }

      out[node.id] = node.window;
  }

  return out;
}
