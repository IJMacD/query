const {
  CLAUSES,
  CONDITION_REGEX,
} = require('./const');

const tokenizer = require('./tokenizer');
const parser = require('./parser');

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
  const redacted = query
    .replace(/\([^()]*\)/g, s => " ".repeat(s.length))
    .replace(/\([^()]*\)/g, s => " ".repeat(s.length))
    .replace(/\([^()]*\)/g, s => " ".repeat(s.length)); // Three Levels of parentheses deep

  // TODO: Real Lexer/Parser!

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
    const source = "SELECT " + select;
    const tokens = tokenizer.tonkenize(source);
    const ast = parser.parse(tokens, source);

    if (!ast || !ast.children) {
        throw new Error("Empty SELECT statement");
    }

    return ast.children.map(child => {
        return { value: child.id, alias: child.alias, node: child };
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
  * @typedef Node
  * @prop {number} type
  * @prop {string|number} id
  * @prop {string} alias
  * @prop {Node[]} children
  */

/**
 * @typedef ParsedTable
 * @prop {string} name
 * @prop {string} [join]
 * @prop {Node} [condition]
 * @prop {string} [alias]
 * @prop {boolean} [inner]
 * @prop {string} [explain]
 * @prop {number} [rowCount]
 * @prop {any} [analyse]
 */

/**
 *
 * @param {string} from
 * @return {ParsedTable[]}
 */
function parseFrom (from) {
  const tables = from ? from.split(",").map(s => s.trim()) : [];
  return tables.map(table => {
      const aliasRegex = / AS "?([a-z0-9_]+)"?/i;
      const aliasMatch = aliasRegex.exec(table);
      const alias = aliasMatch && aliasMatch[1];
      table = table.replace(aliasRegex, "");

      const inner = table.includes("INNER");
      table = table.replace("INNER", "");

      const usingRegex = / USING ([a-z0-9_.]+)/i;
      const usingMatch = usingRegex.exec(table);
      const using = usingMatch && usingMatch[1];
      table = table.replace(usingRegex, "");

      const onRegex = / ON ([a-z0-9_ .<>!=]+)/i;
      const onMatch = onRegex.exec(table);
      const on = onMatch && onMatch[1];
      table = table.replace(onRegex, "");

      const source = onMatch && "ON " + on;
      const tokens = onMatch && tokenizer.tonkenize(source);
      const condition = onMatch && parser.parse(tokens, source);

      const name = table.trim();

      return {
        name,
        alias,
        join: using,
        condition,
        inner,
        explain: "",
        rowCount: 0
      };
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