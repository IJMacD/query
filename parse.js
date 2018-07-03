const {
  CLAUSES,
  CONDITION_REGEX,
} = require('./const');

const { matchAll } = require('./util');

module.exports = {
  parseQuery,
  parseSelect,
  parseWhere,
  parseFrom,
  parseArgumentList,
};

/**
 * Break a flat text SQL query into its clauses
 * @param {string} query
 * @return {{ from?: string, select?: string, where?: string, ["order by"]?: string, limit?: string, ["group by"]?: string, [clause: string]: string }}
 */
function parseQuery (query) {

  // There are times where clause keywords might occur in parentheses. To avoid
  // false matches we'll null out everything in parentheses when looking for clauses
  const redacted = query.replace(/\([^()]*\)/g, s => " ".repeat(s.length));

  const parts = CLAUSES
    .map(clause => ({ clause, start: redacted.indexOf(clause) }))
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
* @typedef ParsedColumn
* @prop {string} value
* @prop {string} [alias]
*/

/**
 * @param {string} select
 * @returns {ParsedColumn[]}
 */
function parseSelect (select) {
    return matchAll(select, /([^,()]+(?:\([^\)]*\))?[^,()]*),?/g).map(s => {
        const [ value, alias ] = s[1].trim().split(" AS ");
        return { value, alias };
    });
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
 * @prop {boolean} [inner]
 * @prop {string} [explain]
 * @prop {number} [rowCount]
 */

/**
 *
 * @param {string} from
 * @return {ParsedTable[]}
 */
function parseFrom (from) {
  const tables = from ? from.split(",").map(s => s.trim()) : [];
  return tables.map(table => {
      const inner = table.includes("INNER");
      const [ name, join ] = table.replace("INNER", "").split("ON").map(s => s.trim());
      return { name, join, inner, explain: "", rowCount: 0 };
  });
}

/**
 *
 * @param {string} list
 * @return {string[]}
 */
function parseArgumentList (list) {
    return matchAll(list, /([^,']+|'[^']*'),?/g).map(s => s[1].trim());
}