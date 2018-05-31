const moment = require('moment');

module.exports = runQuery;

const CLAUSES = ["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT", "GROUP BY" ];
const CONDITION_REGEX = /([^\s]*)\s*([=><]+|IS(?: NOT)? NULL)\s*'?([^']*)'?/i;
const FUNCTION_REGEX = /([a-z]+)\(([^)]+)\)/i;

const FUNCTIONS = {
    'COUNT': a => a.length,
    'SUM': sumResults,
    'AVG': avgResults,
    'MIN': minResults,
    'MAX': maxResults,
};

const COMPARATORS = {
    '=': (a,b) => a == b,
    '<': (a,b) => a < b,
    '>': (a,b) => a > b,
    '<=': (a,b) => a <= b,
    '>=': (a,b) => a >= b,
    'IS NULL': a => a === null || a === "",
    'IS NOT NULL': a => a !== null && a !== "",
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

    if (where.includes("(")) {
        throw new Error("Can't parse complicated where clauses.\n\t" + where + "\n\t" + repeat(" ", where.indexOf("(")) + "^");
    }

    const whereParts = where.split("AND");

    const out = {
        type: "AND",
        children: [],
    };

    whereParts.forEach(part => {
        const match = part.match(CONDITION_REGEX);
        if (match) {
            out.children.push({
                type: "OPERATOR",
                operator: match[2],
                operand1: match[1],
                operand2: match[3],
            });
        }
    });

    return out;
}

async function runQuery (query) {
    await iL.init({ API_ROOT: process.env.API_ROOT });

    const output_buffer = [];
    const output = row => output_buffer.push(row);

    const parsedQuery = parseQuery(query);

    // console.log(parsedQuery);

    if (parsedQuery.select && parsedQuery.from) {
        const cols = parsedQuery.select.split(",").map(s => s.trim());
        const table = parsedQuery.from;
        // const parsedTables = table.split(",").map(s => s.trim());
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
                    if (child.operand1 === "name" && child.operator === "=") {
                        results = [await iL.Tutor.find(child.operand2)];
                        break;
                    }
                    if (child.operand1 === "id" && child.operator === "=") {
                        results = [iL.Tutor.get(child.operand2)];
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
                    if (child.operand1 === "start" || child.operand1 == "end")  {
                        if (child.operator === ">" || child.operator === ">=" || child.operator === "=") {
                            start = moment(new Date(child.operand2)).startOf("day").toDate();
                            child.operand2 = start;
                        } else if (child.operator === "<" || child.operator === "<=" || child.operator === "=") {
                            end = moment(new Date(child.operand2)).endOf("day").toDate();
                            child.operand2 = end;
                        }
                    }
                    else if (child.operand1.startsWith("attendees")) {
                        needsLogin = true;
                    }
                    else if (child.operand1 === "tutor.id" && child.operator === "=") {
                        tutor = iL.Tutor.get(child.operand2);
                    }
                    else if (child.operand1 === "tutor.name" && child.operator === "=") {
                        tutor = await iL.Tutor.find(child.operand2);
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
        } else if (table === "Room") {
            results = await iL.Room.all();
        } else if (table === "Term") {
            results = await iL.Term.all();
        } else if (table === "User") {
            results = await iL.User.all();
        } else {
            throw new Error("Table not recognised: `" + table + "`");
        }

        if (results) {

            /***************
             * Filtering
             ***************/
            if (parsedWhere) {
                for (const child of parsedWhere.children) {
                    const compare = COMPARATORS[child.operator];
                    if (compare) {
                        results = results.filter(r => {
                            const a = resolveValue(r, child.operand1);
                            const b = child.operand2; // Always constant
                            const na = parseFloat(a);
                            const nb = parseFloat(b);
                            return (!isNaN(na) && !isNaN(b)) ? compare(na, nb) : compare(a, b);
                        });
                    }
                }
            }

            /******************
             * Columns
             ******************/
            const colNames = [];
            const colHeaders = [];
            for (const c of cols) {
                if (results.length > 0) {
                    const r = results[0];
                    if (c === "*") {
                        // only add "primitive" columns
                        let newCols = Object.keys(r).filter(k => formatCol(r[k]));
                        colNames.push(...newCols);
                        newCols.forEach(c => {
                            const valLength = formatCol(r[c]).length;
                            if (valLength > c.length) {
                                colHeaders.push(c + repeat(" ", valLength - c.length));
                            } else {
                                colHeaders.push(c);
                            }
                        });
                    }
                    else {
                        const valLength = formatCol(resolveValue(r, c)).length;
                        if (valLength > c.length) {
                            colHeaders.push(c + repeat(" ", valLength - c.length));
                        } else {
                            colHeaders.push(c);
                        }
                        colNames.push(c);
                    }
                } else {
                    colNames.push(c);
                    colHeaders.push(c);
                }
            }

            output(colHeaders);
            output(colHeaders.map(c => repeat("-", c.length)));

            /*****************
             * Column Values
             *****************/
            let rows = results.map(r => {
                const values = colNames.map(col => {
                    if (col.includes("(")) {
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
                const [ col, asc_desc ] = orderBy.split(" ");
                const desc = asc_desc === "DESC" ? -1 : 1;

                let colNum = parseInt(col);
                if (isNaN(colNum)) {
                    colNum = colNames.indexOf(col);
                }

                // Pre-compute ordering value once per row
                rows.forEach(row => {
                    let v = colNum === -1 ? resolveValue(row['result'], col) : row[colNum];
                    // Try to coerce into number if possible
                    if (Number.isFinite(parseFloat(v))) {
                        v = parseFloat(v);
                    }
                    row['orderBy'] = v;
                });

                rows = rows.sort((a,b) => {
                    const va = a['orderBy'];
                    const vb = b['orderBy'];
                    if (Number.isFinite(va) && Number.isFinite(vb)) return (va - vb) * desc;
                    return (va < vb ? -1 : va > vb ? 1 : 0) * desc;
                });
            }

            /*****************
             * Limit
             ****************/
            if (parsedQuery.limit) {
                rows = rows.slice(0, parseInt(parsedQuery.limit));
            }

            /*****************
             * Output
             ****************/
            rows.forEach(r => output(r.map(formatCol)));

            return output_buffer;
        }
    }
}

function resolveValue (row, col) {
    if (col.includes(".")) {
        // resolve path
        let val = row;
        for (const name of col.split(".")) {
            val = val[name];
            if (typeof val === "undefined") {
                val = null;
                break;
            }
        }
        return val;
    }
    return row[col];
}

/**
 * 
 * @param {any} data 
 * @return {string}
 */
function formatCol (data) {
    if (data === null || typeof data === "undefined") {
        return "NULL";
    }
    if (data instanceof Date) {
        return moment(data).format("ddd DD/MM HH:mm");
    }
    if (data.toString() === "[object Object]") {
        return "";
    }
    if (Array.isArray(data)) {
        return "";
    }
    return data.toString();
}

/**
 * 
 * @param {string} char 
 * @param {number} n 
 */
function repeat (char, n) {
    return Array(n + 1).join(char);
}

/**
 *  
 * @param {Array} results 
 * @param {string} col 
 * @return {number}
 */
function sumResults (results, col) {
    return results.reduce((total,row) => total + parseFloat(resolveValue(row['result'], col)), 0)
}

/**
 *  
 * @param {Array} results 
 * @param {string} col 
 * @return {number}
 */
function avgResults (results, col) {
    return sumResults(results, col) / results.length;
}

/**
 *  
 * @param {Array} results 
 * @param {string} col 
 * @return {number}
 */
function minResults (results, col) {
    return Math.min(...results.map(row => resolveValue(row['result'], col)));
}

/**
 *  
 * @param {Array} results 
 * @param {string} col 
 * @return {number}
 */
function maxResults (results, col) {
    return Math.max(...results.map(row => resolveValue(row['result'], col)));
}

/**
 * Turns a group of rows into one aggregate row
 * @param {any[][]} rows 
 * @param {string[]} colNames 
 * @return {any[]}
 */
function computeAggregates (rows, colNames) {
    // Pick the first row from each group
    const row = rows[0];

    // Fill in aggregate values
    colNames.forEach((col, i) => {
        const match = FUNCTION_REGEX.exec(col);
        if (match) {
            const fn = FUNCTIONS[match[1]];
            row[i] = fn && fn(rows, match[2]);
            return;
        }
    });

    return row;
}