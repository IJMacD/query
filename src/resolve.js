const PendingValue = Symbol("Pending Value");

module.exports = {
    PendingValue,
    resolveConstant,
    resolvePath,
    resolveValue,
    setTableAliases,
    getTableAliasMap,
};
const { isValidDate } = require('./util');
const { SymbolError } = require('./evaluate');
const { getRowData } = require('./joins');
const { populateValue } = require('./process');

/**
 * @typedef {import('../types')} Query
 * @typedef {import('../types').QueryContext} QueryContext
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').ParsedTable} ParsedTable
 */


/**
 * Returns a string or a number if the value is a constant.
 * Returns undefined otherwise.
 * @param {string} str
 * @returns {string|number|boolean|Date}
 */
function resolveConstant (str) {
    if (!str) { // null, undefined, ""
        return; // undefined
    }

    if (str === "true") return true;
    if (str === "false") return false;
    if (str === "TRUE") return true;
    if (str === "FALSE") return false;

    if (str === "null") return null;

    // Check for quoted string
    if ((str.startsWith("'") && str.endsWith("'")) ||
            (str.startsWith('"') && str.endsWith('"'))) {


        const stripped = str.substring(1, str.length-1);

        // Check for date
        if (/^\d/.test(stripped)) {
            // Must start with a number - for some reason
            // 'Room 2' parses as a valid date
            const d = new Date(stripped);
            if (isValidDate(d)) {
                return d;
            }
        }

        return stripped;
    }

    // Check for numbers
    if (!isNaN(+str)) {
        return +str;
    }

    return; // undefined
}


/**
 * Resolve a col into a concrete value (constant or from object)
 * @this {QueryContext}
 * @param {ResultRow} row
 * @param {string} col
 * @param {ResultRow[]} [rows]
 */
function resolveValue (row, col, rows=null) {
    const { tables, colAlias, cols } = this;

    // Check for constant values first
    const constant = resolveConstant(col);

    if (typeof constant !== "undefined") {
        return constant;
    }

    // If row is null, there's nothing we can do
    if (row === null) {
        throw Error("Resolve Value Error: NULL Row");
    }

    // First check if we have an exact alias match,
    // this trumps other methods in name collisions
    if (typeof colAlias[col] !== "undefined") {
        const i = colAlias[col];

        // We've struck upon an alias but perhaps the value hasn't been
        // evaluated yet.
        // Let's see if we can be helpful and fill it in now if needed.
        //
        // Note: the row value must be exactly undefined, PendingValue is not good enough
        if (typeof row[i] === "undefined") {
            // await populateValue.call(this, row, i, cols[i], rows);

            /*
                Without await we have to evaluate the columns in the natural
                order they depend on each other.
                i.e. they have to be specified in the right order for us in the
                original query
            */
            populateValue(this, row, i, cols[i], rows);
        }

        if (typeof row[i] !== "undefined" && row[i] !== PendingValue) {
            return row[i];
        }
    }

    const tableAlias = getTableAliasMap(tables);

    let head = col;
    let tail;
    while(head.length > 0) {

        // FROM Table AS t SELECT t.value
        if (head in tableAlias) {
            const t = tableAlias[head];

            const data = getRowData(row, t);

            // resolveValue() is called when searching for a join
            // if we're at that stage getRowData(row, t) will be
            // empty so we need to throw a SymbolError.
            if (typeof data === "undefined") {
                throw new SymbolError("[Pre-Join] Unable to resolve symbol: " + col);
            }

            return resolvePath(data, tail);
        }

        // FROM Table SELECT Table.value
        const matching = tables.filter(t => t.name === head);
        if (matching.length > 0) {
            const t = matching[0];
            return resolvePath(getRowData(row, t), tail);
        }

        head = head.substr(0, head.lastIndexOf("."));
        tail = col.substr(head.length + 1);
    }

    // We will try each of the tables in turn
    for (const table of tables) {
        const data = getRowData(row, table);

        if (typeof data === "undefined" || data === null) {
            continue;
        }

        const val = resolvePath(data, col);

        if (typeof val !== "undefined") {
            return val;
        }
    }

    /*
     * If we've got this far we've exhausted our own context but maybe
     * we're actually being evaluated inside an outer context?
     * This is our last shot.
     */
    if (this.outer) {
        const val = this.outer.context.resolveValue(this.outer.row, col, this.outer.rows);

        if (typeof val !== "undefined") {
            return val;
        }
    }

    throw new SymbolError("Unable to resolve symbol: " + col);
}

/**
 * Traverse a dotted path to resolve a deep value
 * @param {any} data
 * @param {string} path
 * @returns {any}
 */
function resolvePath(data, path) {
  if (typeof data === "undefined" || data === null) {
      return null;
      // throw new Error("Trying to resolve a path on a null object: " + path)
  }

  if (typeof path === "undefined") {
      return data;
      // throw new Error("No path provided");
  }

  // Check if the object key name exists with literal dots
  // nb. this can only search one level deep
  if (path in data) {
      return data[path];
  }

  // resolve dotted path
  let val = data;
  for (const name of path.split(".")) {
      val = val[name];
      if (typeof val === "undefined") {
          val = null;
          break;
      }
  }

  if (val !== null && typeof val !== "undefined") {
      return val;
  }

  return; // undefined
}

/**
 * Make sure each table has a unique alias
 * @param {ParsedTable[]} tables
 */
function setTableAliases (tables) {
  /** @type {{ [alias: string]: ParsedTable }} */
  const tableAlias = {};

  for (const t of tables) {
      let n = t.alias || t.name;
      let i = 1;
      while (n in tableAlias) {
          n = `${t.alias || t.name}_${i++}`;
      }
      t.alias = n;
      tableAlias[n] = t;
  }
}

/**
* Creates a map from alias to table
* @param {ParsedTable[]} tables
* @returns {{ [alias: string]: ParsedTable }}
*/
function getTableAliasMap (tables) {
  /** @type {{ [alias: string]: ParsedTable }} */
  const tableAlias = {};

  for (const t of tables) {
      let n = t.alias;
      tableAlias[n] = t;
  }

  return tableAlias;
}