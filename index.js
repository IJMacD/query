require('fetch-everywhere');
require('dotenv').config();
const moment = require('moment');

const IL_USER = "iain";
const IL_PASS = "1234";

const CLAUSES = ["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT", "GROUP BY" ];
const COUNT_REGEX = /COUNT\([^)]+\)/i;
const SUM_REGEX = /SUM\(([^)]+)\)/i;
const AVG_REGEX = /AVG\(([^)]+)\)/i;

const comparators = {
    '=': (a,b) => a == b,
    '<': (a,b) => a < b,
    '>': (a,b) => a > b,
    '<=': (a,b) => a <= b,
    '>=': (a,b) => a >= b,
};

const [ node, script, ...rest ] = process.argv;

const query = rest.join(" ");

const output = console.log.bind(console);

runQuery(query).catch(e => console.error(e.message));

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
        const match = part.match(/([^\s]*)\s*([=><]+)\s*'?([^']*)'?/);
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

    const parsedQuery = parseQuery(query);

    // console.log(parsedQuery);

    if (parsedQuery.select && parsedQuery.from) {
        const cols = parsedQuery.select.split(",").map(s => s.trim());
        const table = parsedQuery.from;
        // const parsedTables = table.split(",").map(s => s.trim());
        const where = parsedQuery.where;
        const parsedWhere = parseWhere(where);
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
        } else if (table === "Lesson") {
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

            if (needsLogin ||
                cols.some(c => c.includes("attendees")) ||
                groupBy && groupBy.includes("attendees") ||
                orderBy && orderBy.includes("attendees")
            ) {
                // If we are going to do anything with attendees, we need to be logged in
                await iL.login(IL_USER, IL_PASS);
            }

            results = await iL.Lesson.find({ start, end, tutor });

        } else if (table === "Attendance") {
            await iL.login(IL_USER, IL_PASS);

            results = [];
            const lessons = await iL.Lesson.find({});
            for (const lesson of lessons) {
                results.push(...lesson.attendees);
            }
        } else if (table === "Room") {
            results = await iL.Room.all();
        } else if (table === "Term") {
            results = await iL.Term.all();
        } else if (table === "User") {
            results = await iL.User.all();
        }

        if (results) {
            if (parsedWhere) {
                for (const child of parsedWhere.children) {
                    const compare = comparators[child.operator];
                    if (compare) {
                        results = results.filter(r => {
                            const a = resolveValue(r, child.operand1);
                            const b = child.operand2;
                            const na = parseFloat(a);
                            const nb = parseFloat(b);
                            return (!isNaN(na) && !isNaN(b)) ? compare(na, nb) : compare(a, b);
                        });
                    }
                }
            }

            const colNames = [];
            const colHeaders = [];
            for (const c of cols) {
                // If we're not grouping we can just short-circuit here
                if (!groupBy){
                    if(COUNT_REGEX.test(c)) {
                        output(c);
                        output(repeat("-", c.length));
                        output(results.length);
                        return;
                    }
                    if(SUM_REGEX.test(c)) {
                        const match = SUM_REGEX.exec(c);
                        output(c);
                        output(repeat("-", c.length));
                        output(sumResults(results, match[1]));
                        return;
                    }
                    if(AVG_REGEX.test(c)) {
                        const match = AVG_REGEX.exec(c);
                        output(c);
                        output(repeat("-", c.length));
                        output(avgResults(results, match[1]));
                        return;
                    }
                }
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

            output(colHeaders.join("\t"));
            output(colHeaders.map(c => repeat("-", c.length)).join("\t"));

            let groupByMap;
            if (groupBy) {
                groupByMap = new Map();
                for(const row of results) {
                    const key = resolveValue(row, groupBy);
                    if (!groupByMap.has(key)) {
                        groupByMap.set(key, []);
                    }
                    groupByMap.get(key).push(row);
                }

                // Just pick the first row from each group
                results = Array.from(groupByMap.values()).map(a => a[0]);
            }

            if (orderBy) {
                const [ col, asc_desc ] = orderBy.split(" ");
                const desc = asc_desc === "DESC" ? -1 : 1;
                results = results.sort((a,b) => {
                    const va = resolveValue(a, col);
                    const vb = resolveValue(b, col);
                    if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(va))) return (va - vb) * desc;
                    return (va < vb ? -1 : va > vb ? 1 : 0) * desc;
                });
            }

            if (parsedQuery.limit) {
                results = results.slice(0, parseInt(parsedQuery.limit));
            }

            results.forEach(r => output(colNames.map(col => {
                if (groupBy) {
                    if (COUNT_REGEX.test(col)) {
                        return groupByMap.get(resolveValue(r, groupBy)).length;
                    } 
                    if (SUM_REGEX.test(col)) {
                        const match = SUM_REGEX.exec(col);
                        return sumResults(groupByMap.get(resolveValue(r, groupBy)), match[1]);
                    } 
                    if (AVG_REGEX.test(col)) {
                        const match = AVG_REGEX.exec(col);
                        return avgResults(groupByMap.get(resolveValue(r, groupBy)), match[1]);
                    } 
                }
                return formatCol(resolveValue(r, col));
            }).join("\t")));
        }
    }
}

function resolveValue (row, col) {
    if (col.includes(".")) {
        // resolve path
        let val = row;
        for (const name of col.split(".")) {
            val = val[name];
            if (typeof val === "undefined") break;
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
    return results.reduce((t,v) => t + parseFloat(resolveValue(v, col)), 0)
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