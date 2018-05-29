require('fetch-everywhere');
require('dotenv').config();
const moment = require('moment');

const clauses = ["SELECT", "FROM", "WHERE", "ORDER BY", ];

const [ node, script, ...rest ] = process.argv;

const query = rest.join(" ");

runQuery(query);

/**
 * 
 * @param {string} query 
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

async function runQuery (query) {
    await iL.init({ API_ROOT: process.env.API_ROOT });

    const parsedQuery = parseQuery(query);

    // console.log(parsedQuery);

    if (parsedQuery.select && parsedQuery.from) {
        const cols = parsedQuery.select.split(",").map(s => s.trim());
        const table = parsedQuery.from;
        const where = parsedQuery.where;
        const whereMatch = where && where.match(/([^\s]*)\s*([=><])\s*'?([^']*)'?/);
        const orderby = parsedQuery['order by'];
        /** @type {Array} */
        let results;

        // console.log(match);
        // console.log(whereMatch);
        if (table === "Tutor") {
            if (whereMatch) {
                if (whereMatch[1] === "name") {
                    results = [await iL.Tutor.find(whereMatch[3])]; 
                } else if (whereMatch[1] === "id") {
                    results = [iL.Tutor.get(whereMatch[3])];
                }
            }
            else {
                results = await iL.Tutor.all();
            }
        } else if (table === "Lesson") {
            results = await iL.Lesson.find({});
        } else if (table === "Room") {
            results = await iL.Room.all();
        } else if (table === "Term") {
            results = await iL.Term.all();
        } else if (table === "User") {
            results = await iL.User.all();
        }

        if (whereMatch) {
            let filterFn;
            switch (whereMatch[2]) {
                case '=':
                    filterFn = r => r[whereMatch[1]] == whereMatch[3];
                    break;
                case '<':
                    filterFn = r => r[whereMatch[1]] < whereMatch[3];
                    break;
                case '>':
                    filterFn = r => r[whereMatch[1]] > whereMatch[3];
                    break;
            }
            if (filterFn) {
                results = results.filter(filterFn);
            }
        }

        if (results) {
            if (orderby) {
                results = results.sort((a,b) => {
                    const va = a[orderby];
                    const vb = b[orderby];
                    if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(va))) return va - vb;
                    return va < vb ? -1 : va > vb ? 1 : 0;
                });
            }

            const colNames = [];
            cols.forEach(c => {
                if (c === "*" && results.length > 0) {
                    colNames.push(...Object.keys(results[0]));
                }
                else colNames.push(c);
            });

            console.log(colNames.join("\t"));
            console.log(colNames.map(c => "------------".substr(0,c.length)).join("\t"));

            results.forEach(r => console.log(cols.map(col => {
                if (col === "*") {
                    return Object.values(r).map(formatCol).join("\t");
                }
                return formatCol(r[col])
            }).join("\t")));
        }
    }
}

function formatCol (data) {
    if (data instanceof Date) {
        return moment(data).format("ddd DD/MM HH:mm");
    }
    return data;
}