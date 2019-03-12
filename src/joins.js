module.exports = {
    findJoin,
    applyJoin,
    setJoin,
    setJoinPredicate,
    getRowData,
    setRowData,
};

const { parseExpression } = require('./parser');

const { filterRows } = require('./filter');

const { resolvePath } = require('./resolve');

/**
 * @typedef {import('..')} Query
 * @typedef {import('..').QueryContext} QueryContext
 * @typedef {import('..').Node} Node
 * @typedef {import('..').ResultRow} ResultRow
 * @typedef {import('..').ParsedTable} ParsedTable
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
    if (Array.isArray(table.join)) {
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
    } else if (table.join) {
        const t = table.join;

        for (const r of rows) {
            const path = findPath(tables, r, t);

            if (typeof path !== "undefined"){
                table.join = path;
                return true;
            }
        }
    }

    // AUTO JOIN! (natural join, comma join, implicit join?)
    // We will find the path automatically
    const t = table.name.toLowerCase();

    for (const r of rows) {
        const path = findPath(tables, r, t);

        if (typeof path !== "undefined"){
            table.join = path;
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
            const data = getRowData(r, table);

            const array = resolvePath(data, ts);

            if (Array.isArray(array)) {
                table.join = join;
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
 * @param {QueryContext} context
 * @param {ParsedTable} table
 * @param {ResultRow[]} rows
 * @returns {ResultRow[]}
 */
function applyJoin (context, table, rows) {
    const newRows = [];
    let one2many = false;

    for (let row of rows) {
        // Check to make sure we have data object saved,
        // if not fill in the data object of each row now
        if (typeof getRowData(row, table) === "undefined") {
            if (Array.isArray(table.join)) {
                const joinData = getRowData(row, table.join[0]);
                const data = resolvePath(joinData, table.join[1]);
                setRowData(row, table, data);
            } else {
                throw Error("Join has not been prepared");
            }
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
                    setRowData(row, table, null);

                    newRows.push(row);
                }

                continue;
            }

            data.forEach((sr, si) => {
                // Clone the row
                const newRow = cloneRow(row);
                setRowData(newRow, table, sr);

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
        return filterRows(context, newRows, table.predicate);
    }

    return newRows;
}

function setJoin (table, targetTable) {
    table.join = [targetTable, table.name];
}

/**
 * @param {ParsedTable} table
 * @param {string} predicate
 */
function setJoinPredicate (table, predicate) {
    table.predicate = parseExpression(predicate);
}

/**
 *
 * @param {ResultRow} row
 * @param {ParsedTable} table
 */
function getRowData (row, table) {
  // @ts-ignore
  return row['data'][table.symbol];
}


/**
 *
 * @param {ResultRow} row
 * @param {ParsedTable} table
 */
function setRowData (row, table, data) {
  // @ts-ignore
  row['data'][table.symbol] = data;
}

function cloneRow(row) {
    const newRow = [...row];
    newRow['data'] = { ...row['data'] };
    return newRow;
}

/**
 * Traverse a sample object to determine absolute path
 * up to, but not including, given name.
 * Uses explicit join list.
 * @param {ParsedTable[]} tables
 * @param {ResultRow} row
 * @param {string} name
 * @returns {[ParsedTable,string]}
 */
function findPath (tables, row, name) {
    for (const table of tables) {

        const data = getRowData(row, table);

        if (typeof data === "undefined" || data === null) {
            // Could be missing data because of a LEFT JOIN on null row
            continue;
        }

        // Check if the parent object has a property matching
        // the secondary table i.e. Tutor => result.tutor
        if (typeof resolvePath(data, name) !== "undefined") {
            return [table,name];
        }

        if (name.includes(".")) {
            const head = name.substr(0, name.indexOf("."));
            const tail = name.substr(name.indexOf(".") + 1);

            if (head === table.alias) {
                if (typeof resolvePath(data, tail) !== "undefined") {
                    return [table,tail];
                } else {
                    throw Error("It looks like you tried to join on a table alias but the property wasn't found");
                }
            }
        }
    }
}
