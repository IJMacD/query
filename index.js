require('fetch-everywhere');
require('dotenv').config();
const moment = require('moment');

const IL_USER = "iain";
const IL_PASS = "1234";

const clauses = ["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT" ];

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
 *
 * @param {string} query
 * @return {{ [clause: string]: string }}
 */
function parseQuery (query) {

    const parts = clauses
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
 * 
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
        const orderby = parsedQuery['order by'];
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
            
            if (parsedWhere) {
                parsedWhere.children = parsedWhere.children.filter(child => {
                    if (child.operand1 === "start" || child.operand1 == "end")  {
                        if (child.operator === ">") {
                            start = new Date(child.operand2);
                        } else if (child.operator === "<") {
                            end = new Date(child.operand2);
                        }
                        return false;
                    }
                    return true;
                });
            }

            if (!start) { start = new Date(); }
            if (!end) { end = start; }

            results = await iL.Lesson.find({ start, end });
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
            const colNames = [];
            for (const c of cols) {
                if (c === "*" && results.length > 0) {
                    const r = results[0];
                    // only add "primitive" columns
                    colNames.push(...Object.keys(r).filter(k => formatCol(r[k])));
                }
                else colNames.push(c);
            }

            output(colNames.join("\t"));
            output(colNames.map(c => repeat("-", c.length)).join("\t"));

            if (parsedWhere) {
                for (const child of parsedWhere.children) {
                    const compare = comparators[child.operator];
                    if (compare) {
                        results = results.filter(r => {
                            const a = r[child.operand1];
                            const b = child.operand2;
                            const na = parseFloat(a);
                            const nb = parseFloat(b);
                            return (!isNaN(na) && !isNaN(b)) ? compare(na, nb) : compare(a, b);
                        });
                    }
                }
            }

            if (orderby) {
                const [ col, asc_desc ] = orderby.split(" ");
                const desc = asc_desc === "DESC" ? -1 : 1;
                results = results.sort((a,b) => {
                    const va = a[col];
                    const vb = b[col];
                    if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(va))) return (va - vb) * desc;
                    return (va < vb ? -1 : va > vb ? 1 : 0) * desc;
                });
            }

            if (parsedQuery.limit) {
                results = results.slice(0, parseInt(parsedQuery.limit));
            }

            results.forEach(r => output(colNames.map(col => {
                let val;

                if (col.includes(".")) {
                    // resolve path
                    val = r;
                    for (const name of col.split(".")) {
                        val = val[name] || null;
                        if (val === null) break;
                    }
                }
                else val = r[col];

                return formatCol(val);
            }).join("\t")));
        }
    }
}

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