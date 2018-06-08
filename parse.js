const {
  CLAUSES,
  CONDITION_REGEX,
} = require('./const');

module.exports = {
  parseQuery,
  parseWhere,
  parseFrom,
};

/**
 * Break a flat text SQL query into its clauses
 * @param {string} query
 * @return {{ from?: string, select?: string, where?: string, ["order by"]?: string, limit?: string, ["group by"]?: string, [clause: string]: string }}
 */
function parseQuery (query) {

  const parts = CLAUSES
      .map(clause => ({ clause, start: query.indexOf(clause) }))
      .filter(o => o.start != -1)
      .sort((a,b) => a.start - b.start);

  const parsed = {};

  for(let i = 0; i < parts.length; i++) {
      const { clause, start } = parts[i];
      const end = i < parts.length - 1 ? parts[i+1].start : query.length;
      parsed[clause.toLowerCase()] = query.substring(start + clause.length, end).trim();
  }

  return parsed;
}

/**
* @typedef WhereNode
* @prop {string} type
* @prop {WhereNode[]} [children]
* @prop {string} [operator]
* @prop {string} [operand1]
* @prop {string} [operand2]
*/

/**
* Parse a where clause into a tree
* @param {string} where
* @return {WhereNode}
*/
function parseWhere (where) {
  if (!where) {
      return;
  }

  const whereParts = where.split("AND");

  /** @type {WhereNode} */
  const out = {
      type: "AND",
      children: [],
  };

  whereParts.forEach(part => {
      const match = part.match(CONDITION_REGEX);
      if (!match) {
          throw new Error(`Unrecognised WHERE/HAVING clause: \`${part}\``);
      }

      out.children.push({
          type: "OPERATOR",
          operator: match[2].trim(),
          operand1: match[1].trim(),
          operand2: match[3].trim(),
      });
  });

  return out;
}

/**
* @typedef ParsedTable
* @prop {string} name
* @prop {string} [join]
* @prop {string} [alias]
*/

/**
* @param {string} from
* @return {ParsedTable[]}
*/
function parseFrom (from) {
  const tables = from ? from.split(",").map(s => s.trim()) : [];
  const parsedTables = tables.map(table => {
      const [ name, join ] = table.split("ON").map(s => s.trim());
      return { name, join };
  });
  return parsedTables;
}