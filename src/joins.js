const { parseExpression } = require('./parser');

const { filterRows } = require('./filter');

module.exports = {
  findJoin,
  applyJoin,
  setJoin,
  setJoinPredicate,
  getRowData,
  setRowData,
};

const { resolvePath } = require('./resolve');

/**
 * @typedef {import('../types')} Query
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').ParsedTable} ParsedTable
 */

/**
 * Given a set of rows, try to identify where a table can be joined.
 *
 * It will look at data on the table object and search the rows to try
 * and auto join if possible. Once it has found the join location it
 * will set the join path on the table object.
 *
 * It will return a boolean indicating its success.
 * @param {ParsedTable[]} tables
 * @param {ParsedTable} table
 * @param {ResultRow[]} rows
 * @returns {boolean}
 */
function findJoin (tables, table, rows) {
    if (table.join) {
        // If we have an explicit join, check it first.

        // First check of explicit join check is in data object.
        // This may already have been set for us by a beforeJoin callback.
        for (const row of rows) {
            const data = getRowData(row, table);

            if (typeof data !== "undefined" && data !== null) {
                return true;
            }
        }

        // If we get to this point no data has been set for us on the rows
        // But if we have a predicate which was set in beforeJoin()
        // we will do a primary table join.
        // For that we need to unset `table.join` so that the higher up
        // functions know the data doesn't exist on the rows yet
        if (table.predicate) {
            return false;
        }
    }

    // AUTO JOIN! (natural join, comma join, implicit join?)
    // We will find the path automatically
    const t = table.name.toLowerCase();

    for (const r of rows) {
        const path = findPath(tables, r, t);

        if (typeof path !== "undefined"){
            table.join = path.length === 0 ? t : `${path}.${t}`;
            return true;
        }
    }

    /*
    * This will search for the plural of the table name and
    * if that is an array we can do a multi-way join.
    */
    const ts = `${t}s`;

    for (const r of rows) {
        const join = findPath(tables, r, ts);

        if (typeof join !== "undefined") {
            const data = r['data'][join];

            const array = resolvePath(data, ts);

            if (Array.isArray(array)) {
                table.join = join.length === 0 ? ts : `${join}.${ts}`;
                return true;
            }

            throw new Error("Unable to join, found a plural but not an array: " + ts);
        }
    }

    return false;
}


/**
 * This function first makes sure every row has a data object
 * for this table.
 *
 * Then if the data object is an array, it will split the row as necessary.
 *
 * Finally this function will update ROWIDs
 * @param {Query} query
 * @param {ParsedTable} table
 * @param {ResultRow[]} rows
 * @returns {ResultRow[]}
 */
function applyJoin (query, table, rows) {
    const newRows = [];
    let one2many = false;

    for (let row of rows) {
        // Check to make sure we have data object saved,
        // if not fill in the data object of each row now
        if (typeof getRowData(row, table) === "undefined") {
            setRowData(row, table, query.resolveValue(row, table.join));
        }

        const data = getRowData(row, table);

        if (Array.isArray(data)) {
            // We've been joined on an array! Wahooo!!
            // The number of results has just been multiplied!

            // For EXPLAIN
            one2many = true;

            if (!data || data.length === 0) {

                /*
                * If this is an inner join, we do nothing.
                * In the case it is not an INNER JOIN (i.e it is a LEFT JOIN),
                * we need to add a null row.
                */
                if (!table.inner) {
                    // Update the ROWID to indicate there was no row in this particular table
                    row['ROWID'] += ".-1";
                    row['data'] = { ...row['data'], [table.join]: undefined }

                    newRows.push(row);
                }

                continue;
            }

            data.forEach((sr, si) => {
                // Clone the row
                const newRow = [ ...row ];
                newRow['data'] = { ...row['data'], [table.join]: sr };

                // Set the ROWID again, this time including the subquery id too
                Object.defineProperty(newRow, 'ROWID', { value: `${row['ROWID']}.${si}`, writable: true });

                newRows.push(newRow);
            });
        } else {
            // Update all the row IDs for one-to-one JOIN
            row['ROWID'] += ".0";

            newRows.push(row);
        }
    }

    if (one2many) {
        table.explain += ` one-to-many`;
    }

    if (table.predicate) {
        return filterRows(query, newRows, table.predicate);
    }

    return newRows;
}

function setJoin (table, targetTable) {
    table.join = `${targetTable.join}.${table.name}`;
}

/**
 * @param {ParsedTable} table
 * @param {string} predicate
 */
function setJoinPredicate (table, predicate) {
    table.predicate = parseExpression(predicate);
}

function getRowData (row, table) {
  return row['data'][table.join];
}

function setRowData (row, table, data) {
  row['data'][table.join] = data;
}

/**
 * Traverse a sample object to determine absolute path
 * up to, but not including, given name.
 * Uses explicit join list.
 * @param {ParsedTable[]} tables
 * @param {ResultRow} row
 * @param {string} name
 * @returns {string}
 */
function findPath (tables, row, name) {
  for (const { join } of tables) {
      if (typeof join === "undefined") {
          continue;
      }

      const data = row.data[join];

      if (typeof data === "undefined" || data === null) {
          // Could be missing data because of a LEFT JOIN on null row
          continue;
      }

      // Check if the parent object has a property matching
      // the secondary table i.e. Tutor => result.tutor
      if (typeof resolvePath(data, name) !== "undefined") {
          return join;
      }
  }
}
