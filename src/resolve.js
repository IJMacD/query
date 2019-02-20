const { isValidDate } = require('./util');

const PendingValue = Symbol("Pending Value");

module.exports = {
  PendingValue,
  resolveConstant,
  resolvePath,
  valueResolver,
  setTableAliases,
  getTableAliasMap,
};

const { getRowData } = require('./joins');

/**
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
 * @param {any} context
 * @param {ResultRow} row
 * @param {string} col
 * @param {ResultRow[]} [rows]
 */
function valueResolver ({ evaluate, tables, colAlias, cols }, row, col, rows=null) {
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

        // We've struck upon an alias but the value hasn't been
        // evaluated yet.
        // Let's see if we can be helpful and fill it in now.
        if (typeof row[i] === "undefined") {
            row[i] = PendingValue;
            row[i] = evaluate(row, cols[i], rows);
        }

        if (typeof row[i] !== "undefined" && row[i] !== PendingValue) {
            return row[i];
        }
    }

    // All methods after this require row data
    if (!row['data']) {
        throw Error("Resolve Value Error: No row data");
    }

    const tableAlias = getTableAliasMap(tables);

    let head = col;
    let tail;
    while(head.length > 0) {

        // FROM Table AS t SELECT t.value
        if (head in tableAlias) {
            const t = tableAlias[head];

            // resolveValue() is called when searching for a join
            // if we're at that stage getRowData(row, t) will be
            // empty so we need to return undefined.
            const data = getRowData(row, t);

            if (typeof data === "undefined") {
                return void 0;
            }

            return resolvePath(data, tail);
        }

        // FROM Table SELECT Table.value
        const matching = tables.filter(t => t.name === head);
        if (matching.length > 0) {
            const t = matching[0];
            return resolvePath(getRowData(row, t), tail);
        }

        if (head in row['data']) {
            return resolvePath(row['data'][head], tail);
        }

        for (let join in row['data']) {
            const joinedName = `${join}.${head}`;
            if (joinedName in row['data']) {
                return resolvePath(row['data'][joinedName], tail);
            }
        }

        head = head.substr(0, head.lastIndexOf("."));
        tail = col.substr(head.length + 1);
    }

    // We will try each of the tables in turn
    for (const { join } of tables) {
        if (typeof join === "undefined") {
            continue;
        }

        const data = row.data[join];

        if (typeof data === "undefined" || data === null) {
            continue;
        }

        const val = resolvePath(data, col);

        if (typeof val !== "undefined") {
            return val;
        }
    }

    return; // undefined
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
  if (process.env.NODE_ENV !== "production" && typeof data['ROWID'] !== "undefined") {
      console.error("It looks like you passed a row to resolvePath");
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
      t.join = n;
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