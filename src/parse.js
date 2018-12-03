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
  parseGroupBy,
  parseArgumentList,
  parseOrderBy,
};

/**
 * @typedef {import('./parser').Node} Node
 */

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
        .filter(o => o.start !== -1)
        .sort((a,b) => a.start - b.start);

  /** @type {{ [clause: string]: string }} */
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
* @prop {Node} [node]
*/

/**
 * @param {string} select
 * @returns {ParsedColumn[]}
 */
function parseSelect (select) {
    const source = "SELECT " + select;
    const tokens = tokenizer.tonkenize(source);
    const ast = parser.parse(tokens, source);
    // console.log({ tokens, ast });

    if (!ast || !ast.children) {
        throw new Error("Empty SELECT statement");
    }

    return ast.children.map(child => {
        return { value: String(child.id), alias: child.alias, node: child };
    });
}

/**
* Parse a where clause into a tree
* @param {string} where
* @return {Node}
*/
function parseWhere (where) {
  if (!where) {
      return;
  }

  const tokens = tokenizer.tonkenize(where);
  const ast = parser.parse(tokens, where);

  return ast;
}

/**
 * @typedef ParsedTable
 * @prop {string} name
 * @prop {string} [join]
 * @prop {Node} [predicate]
 * @prop {string} [alias]
 * @prop {Node[]} [params]
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
  if (!from) {
    return [];
  }

  const tokens = tokenizer.tonkenize("FROM " + from);
  const ast = parser.parse(tokens, "FROM " + from);
  // console.log(tokens);
  // console.log(require('util').inspect(ast, {depth:null}));

  return ast.children.map(node => {
      // const aliasRegex = / AS "?([a-z0-9_]+)"?/i;
      // const aliasMatch = aliasRegex.exec(table);
      // const alias = aliasMatch && aliasMatch[1];
      // table = table.replace(aliasRegex, "");

      // const inner = table.includes("INNER");
      // table = table.replace("INNER", "");

      // const usingIdx = table.indexOf("USING");
      // const onIdx = table.indexOf("ON");

      // let using;
      // let on;

      // if (usingIdx >= 0 && onIdx >= 0) {
      //   if (onIdx > usingIdx) {
      //     using = table.substring(usingIdx + 5, onIdx);
      //     on = table.substring(onIdx + 2);
      //     table = table.substring(0, usingIdx);
      //   } else {
      //     using = table.substring(onIdx + 2, usingIdx);
      //     on = table.substring(usingIdx + 5);
      //     table = table.substring(0, onIdx);
      //   }
      // } else if (usingIdx >= 0) {
      //   using = table.substring(usingIdx + 5);
      //   table = table.substring(0, usingIdx);
      // } else if (onIdx >= 0) {
      //   on = table.substring(onIdx + 2);
      //   table = table.substring(0, onIdx);
      // }

      // const tokens = on && tokenizer.tonkenize("ON " + on);
      // const predicate = on && parser.parse(tokens, on);

      // const name = table.trim();

      if (node.type !== parser.NODE_TYPES.SYMBOL &&
          node.type !== parser.NODE_TYPES.FUNCTION_CALL)
      {
        throw new Error(`Node type ${node.type} cannot be a table`);
      }

      const name = String(node.id);
      const using = void 0; // other parts of code expect this to be undefined before joining

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
 * @param {string} list
 * @return {string[]}
 */
function parseArgumentList (list) {
    return matchAll(list, /([^,']+|'[^']*'),?/g).map(s => s[1].trim());
}

/**
 *
 * @param {string} groupBy
 * @returns {Node[]}
 */
function parseGroupBy (groupBy) {
  return groupBy.split(",").map(s => {
    const tokens = tokenizer.tonkenize(s);
    const ast = parser.parse(tokens, s);
    return ast;
  });
}

/**
 *
 * @param {string} orderBy
 * @returns {Node[]}
 */
function parseOrderBy (orderBy) {
    const re = /ASC|DESC/g;
    return orderBy.split(",").map(s => {
        const ascDesc = re.exec(s);
        s = s.replace(re, "");

        const tokens = tokenizer.tonkenize(s);
        const ast = parser.parse(tokens, s);

        ast.desc = Boolean(ascDesc && ascDesc[0] === "DESC");

        return ast;
    });
}