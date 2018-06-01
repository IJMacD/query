const moment = require('moment');

module.exports = runQuery;

const CLAUSES = ["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT", "GROUP BY", "OFFSET" ];
const CONDITION_REGEX = /^([^\s]*)\s*([=><]+|IS(?: NOT)? NULL|(?:NOT )?LIKE|(?:NOT )?REGEXP)\s*(.*)$/i;
const FUNCTION_REGEX = /^([a-z_]+)\(([^)]+)\)$/i;

const FUNCTIONS = {
    'COUNT': a => a.length,
    'SUM': v => v.reduce((total,val) => total + parseFloat(val), 0),
    'AVG': v => FUNCTIONS.SUM(v) / v.length,
    'MIN': v => Math.min(...v),
    'MAX': v => Math.max(...v),
    'STRING_AGG': v => v.join(' '),
};

const OPERATORS = {
    '=': (a,b) => a == b,
    '<': (a,b) => a < b,
    '>': (a,b) => a > b,
    '<=': (a,b) => a <= b,
    '>=': (a,b) => a >= b,
    'IS NULL': a => a === null || a === "",
    'IS NOT NULL': a => a !== null && a !== "",
    'LIKE': (a,b) => new RegExp("^" + b.replace(/\?/g, ".").replace(/%/g, ".*") + "$").test(a),
    'NOT LIKE': (a,b) => !(new RegExp("^" + b.replace(/\?/g, ".").replace(/%/g, ".*") + "$").test(a)),
    'REGEXP': (a,b) => new RegExp(b, "i").test(a),
    'NOT REGEXP': (a,b) => !(new RegExp(b, "i").test(a)),
};

let loggedIn = false;

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
 * Parse a where clause into a tree
 * @param {string} where
 */
function parseWhere (where) {
    if (!where) {
        return;
    }

    const whereParts = where.split("AND");

    const out = {
        type: "AND",
        children: [],
    };

    whereParts.forEach(part => {
        const match = part.match(CONDITION_REGEX);
        if (!match) {
            throw new Error(`Unrecognised WHERE clause: \`${part}\``);
        }

        out.children.push({
            type: "OPERATOR",
            operator: match[2],
            operand1: match[1],
            operand2: match[3].trim(),
        });
    });

    return out;
}

async function runQuery (query) {
    await iL.init({ API_ROOT: process.env.API_ROOT });

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    const parsedQuery = parseQuery(query);

    // console.log(parsedQuery);

    if (!parsedQuery.from && !parsedQuery.select) {
        throw new Error("You must specify FROM or SELECT");
    }

    if (!parsedQuery.select) {
        // Default to selecting all scalar values
        parsedQuery.select = "*";
    }

    const cols = parsedQuery.select.split(",").map(s => s.trim());
    const parsedTables = parsedQuery.from && parsedQuery.from.split(",").map(s => s.trim());
    const table = parsedTables && parsedTables[0];
    const where = parsedQuery.where;
    const parsedWhere = parseWhere(where);
    // console.log(parsedWhere);
    const orderBy = parsedQuery['order by'];
    const groupBy = parsedQuery['group by'];

    /** @type {Array} */
    let results;

    if (table === "Tutor") {
        if (parsedWhere) {
            for (let child of parsedWhere.children){
                const resolved2 = resolveConstant(child.operand2);
                if (child.operand1 === "name" && child.operator === "=") {
                    results = [await iL.Tutor.find(resolved2)];
                    break;
                }
                if (child.operand1 === "id" && child.operator === "=") {
                    results = [iL.Tutor.get(resolved2)];
                    break;
                }
            }
        }
        if (!results) {
            results = await iL.Tutor.all();
        }
    } else if (table === "Lesson" || table === "Attendance") {
        let start;
        let end;
        let needsLogin = false;
        let tutor;

        if (parsedWhere) {
            for (const child of parsedWhere.children) {
                const resolved2 = resolveConstant(child.operand2);
                if (child.operand1 === "start" || child.operand1 == "end")  {
                    if (child.operator === ">" || child.operator === ">=" || child.operator === "=") {
                        start = moment(new Date(resolved2)).startOf("day").toDate();
                        child.operand2 = start;
                    } else if (child.operator === "<" || child.operator === "<=" || child.operator === "=") {
                        end = moment(new Date(resolved2)).endOf("day").toDate();
                        child.operand2 = end;
                    }
                }
                else if (child.operand1.startsWith("attendees")) {
                    needsLogin = true;
                }
                else if (child.operand1 === "tutor.id" && child.operator === "=") {
                    tutor = iL.Tutor.get(resolved2);
                }
                else if (child.operand1 === "tutor.name" && child.operator === "=") {
                    tutor = await iL.Tutor.find(resolved2);
                }
            }
        }

        if (!start) { start = new Date(); }
        if (!end) { end = start; }

        if (!loggedIn && (
                needsLogin ||
                cols.some(c => c.includes("attendees")) ||
                groupBy && groupBy.includes("attendees") ||
                orderBy && orderBy.includes("attendees") ||
                table === "Attendance"
            )
        ) {
            // If we are going to do anything with attendees, we need to be logged in
            await iL.login(process.env.IL_USER, process.env.IL_PASS);
            loggedIn = true;
        }

        results = await iL.Lesson.find({ start, end, tutor });

        if (table === "Attendance") {
            // Convert Lessons into Attendances
            // (Re-use all of Lesson searching logic)
            const newResults = [];
            for (const lesson of results) {
                newResults.push(...lesson.attendees);
            }
            results = newResults;
        }
    } else if (table === "Course") {
        let title;
        let tutor;
        if (parsedWhere) {
            for (let child of parsedWhere.children){
                const resolved2 = resolveConstant(child.operand2);
                if (child.operand1 === "title" && child.operator === "=") {
                    title = resolved2;
                    break;
                }
                if (child.operand1 === "tutor.id" && child.operator === "=") {
                    tutor = iL.Tutor.get(resolved2);
                    break;
                }
                if (child.operand1 === "tutor.name" && child.operator === "=") {
                    tutor = await iL.Tutor.find(resolved2);
                    break;
                }
            }
        }
        results = await iL.Course.find({ title, tutor });
    } else if (table === "Room") {
        results = await iL.Room.all();
    } else if (table === "Term") {
        results = await iL.Term.all();
    } else if (table === "User") {
        results = await iL.User.all();
    } else if (typeof table === "undefined") {
        // If there is no table specified create one token row
        // so that we can return constants etc.
        results = [[]];
    } else {
        throw new Error("Table not recognised: `" + table + "`");
    }

    const colNames = [];
    const colHeaders = [];
    const colAlias = {};

    if (results) {

        /******************
         * Columns
         ******************/

        for (const c of cols) {
            // Special Treatment for *
            if (c === "*") {
                if (results.length === 0) {
                    // We don't have any results so we can't determine the cols
                    colNames.push(c);
                    colHeaders.push(c);
                    continue;
                }

                const r = results[0];

                // only add "primitive" columns
                let newCols = Object.keys(r).filter(k => formatCol(r[k]));

                colNames.push(...newCols);
                colHeaders.push(...newCols);

                // Add all the scalar columns for secondary tables
                for (let i = 1; i < parsedTables.length; i++) {
                    const t = parsedTables[i].toLowerCase();

                    // Check if the parent object has a property matching
                    // the secondary table i.e. Tutor => result.tutor
                    if (!r[t]) {
                        // If not just skip
                        continue;
                    }

                    // only add "primitive" columns
                    let newCols = Object.keys(r[t]).filter(k => formatCol(r[t][k]));

                    colNames.push(...newCols.map(c => `${t}.${c}`));
                    colHeaders.push(...newCols);
                }
            } else {
                const [ c1, alias ] = c.split(" AS ");
                colNames.push(c1);
                colHeaders.push(alias || c1);

                if (alias && typeof colAlias[alias] !== "undefined") {
                    throw new Error("Alias already in use: " + alias);
                }

                colAlias[alias || c1] = colNames.length - 1;
            }

            colHeaders.forEach((col, i) => {
                if (typeof colAlias[col] === "undefined") {
                    colAlias[col] = i;
                }
            });
        }

        output(colHeaders);
        output(colHeaders.map(c => repeat("-", c.length)));

        /***************
         * Filtering
         ***************/
        if (parsedWhere) {
            for (const child of parsedWhere.children) {
                const compare = OPERATORS[child.operator];
                if (!compare) {
                    throw new Error("Unrecognised operator: " + child.operator);
                }

                results = results.filter(r => {
                    const a = resolveValue(r, child.operand1);
                    const b = resolveValue(r, child.operand2);
                    const na = parseFloat(a);
                    const nb = parseFloat(b);
                    return (!isNaN(na) && !isNaN(b)) ? compare(na, nb) : compare(a, b);
                });
            }
        }

        /*****************
         * Column Values
         *****************/
        let rows = results.map(r => {
            const values = colNames.map(col => {
                if (FUNCTION_REGEX.test(col)) {
                    // Don't compute aggregate functions until after grouping
                    return null;
                }
                return resolveValue(r, col);
            });

            // Save reference to original object for sorting
            values['result'] = r;

            return values;
        });

        /*************
         * Grouping
         *************/
        if (groupBy) {
            let groupByMap;
            groupByMap = new Map();
            for(const row of rows) {
                const key = resolveValue(row['result'], groupBy);
                row['groupBy'] = key;
                if (!groupByMap.has(key)) {
                    groupByMap.set(key, []);
                }
                groupByMap.get(key).push(row);
            }

            rows = Array.from(groupByMap.values()).map(rows => computeAggregates(rows, colNames));

        } else if (colNames.some(c => FUNCTION_REGEX.test(c))) {
            // If we have any aggregate functions but we're not grouping,
            // then apply aggregate functions to whole set
            rows = [
                computeAggregates(rows, colNames), // Single row result set
            ];
        }

        /****************
         * Sorting
         ***************/
        if (orderBy) {
            // Parse the orderBy clause into an array of objects
            const parsedOrders = orderBy.split(",").map(order => {
                const [ col, asc_desc ] = order.split(" ");
                const desc = asc_desc === "DESC" ? -1 : 1;

                // Simplest case: col is actually a column index
                let colNum = parseInt(col);

                // If it's not a column index, check if its a named column in selection
                if (isNaN(colNum) && typeof colAlias[col] !== "undefined") {
                    colNum = colAlias[col]
                }

                return { colNum, col, desc };
            });

            // Pre-create ordering value array for each row
            rows.forEach(row => {
                row['orderBy'] = [];
            });

            rows = rows.sort((a,b) => {
                for (let i = 0; i < parsedOrders.length; i++) {
                    const o = parsedOrders[i];

                    const va = getOrderingValue(a, o, i);
                    const vb = getOrderingValue(b, o, i);

                    let sort = (Number.isFinite(va) && Number.isFinite(vb)) ?
                        (va - vb) :
                        (va < vb ? -1 : va > vb ? 1 : 0);

                    if (sort !== 0) {
                        sort *= o.desc;

                        return sort;
                    }

                }

                return 0;
            });
        }

        /******************
         * Limit and Offset
         ******************/
        if (parsedQuery.limit || parsedQuery.offset) {
            const start = parseInt(parsedQuery.offset) || 0;
            const end = start + parseInt(parsedQuery.limit) || rows.length;
            rows = rows.slice(start, end);
        }

        /*****************
         * Output
         ****************/
        rows.forEach(r => output(r.map(formatCol)));

        return output_buffer;
    }

    function resolveConstant (str) {
        // Check for quoted string
        if ((str.startsWith("'") && str.endsWith("'")) ||
        (str.startsWith('"') && str.endsWith('"'))) {
            return str.substring(1, str.length-1);
        }

        // Check for numbers
        const n = parseFloat(str);
        if (!isNaN(n)) {
            return n;
        }

        return null;
    }

    /**
     *
     * @param {any} row
     * @param {string} col
     */
    function resolveValue (row, col) {
        // Check for constant values first
        const constant = resolveConstant(col);

        if (constant !== null) {
            return constant;
        }

        // If row is null, there's nothing left we can do
        if (row === null) {
            return;
        }

        // Now for the real column resolution
        // We will try each of the tables in turn
        for (let i = 0; i < parsedTables.length; i++) {
            const prefix = i === 0 ? "" : parsedTables[i].toLowerCase() + ".";

            // Resolve a possible alias
            const colName = prefix + (colNames[colAlias[col]] || col);

            if (i === 0 && typeof row[colName] !== "undefined") {
                return row[colName];
            }

            // If column is a path, then iteratively resolve
            if (colName.includes(".")) {
                // resolve path
                let val = row;
                for (const name of colName.split(".")) {
                    val = val[name];
                    if (typeof val === "undefined") {
                        val = null;
                        break;
                    }
                }
                if (val !== null && typeof val !== "undefined") {
                    return val;
                }
            }
        }

        return null;
    }

    /**
     * Turns a group of rows into one aggregate row
     * @param {any[][]} rows
     * @param {string[]} colNames
     * @return {any[]}
     */
    function computeAggregates (rows, colNames) {
        // If there are no rows (i.e. due to filtering) then
        // just return an empty row.
        if (rows.length === 0) {
            return [];
        }

        // Pick the first row from each group
        const row = rows[0];

        // Fill in aggregate values
        colNames.forEach((col, i) => {
            const match = FUNCTION_REGEX.exec(col);
            if (match) {
                const fn = FUNCTIONS[match[1]];
                const values = rows.map(row => resolveValue(row['result'], match[2]))
                row[i] = fn && fn(values);
                return;
            }
        });

        return row;
    }

    /**
     * @param {any[]} row
     * @param {{ col: string, colNum: number, desc: number }} parsedOrder
     * @param {number} depth
     */
    function getOrderingValue (row, parsedOrder, depth) {
        let va = row['orderBy'][depth];

        // The first time this row is visited (at this depth) we'll
        // calculate its ordering value.
        if (typeof va === "undefined") {
            let v = isNaN(parsedOrder.colNum) ?
                resolveValue(row['result'], parsedOrder.col) :
                row[parsedOrder.colNum];

            // Try to coerce into number if possible
            const vn = parseFloat(v);
            if (Number.isFinite(vn)) {
                v = vn;
            }

            // Set value to save resolution next time
            row['orderBy'][depth] = v;
            va = v;
        }

        return va;
    }
}

/**
 *
 * @param {any} data
 * @return {string}
 */
function formatCol (data) {
    if (data === null || typeof data === "undefined") {
        return null;
    }
    if (data.toString() === "[object Object]") {
        return "";
    }
    if (Array.isArray(data)) {
        return "";
    }
    return data;
}

/**
 *
 * @param {string} char
 * @param {number} n
 */
function repeat (char, n) {
    return Array(n + 1).join(char);
}
