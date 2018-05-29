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
    let unparsed = query;
    const parsed = {};
    while (unparsed.length > 0) {
        
        // Go through each possible type of clause to see if our unparsed 
        // string starts with one of them.
        // Using `Array.prototype.find` so that we can short circuit it.
        clauses.find(clause => {
            const clauseLower = clause.toLowerCase();
            if (unparsed.startsWith(clause) || unparsed.startsWith(clauseLower)) {
                
                unparsed = unparsed.substr(clause.length + 1);

                // We've found which clause we're dealing with.
                // In order to find the end we look for the beginning of the next.
                let minStart = unparsed.length;
                clauses.forEach(cl2 => {
                    const cl2Lower = cl2.toLowerCase();
                    const index = unparsed.indexOf(cl2);
                    if (index != -1) minStart = Math.min(minStart, index);
                    const indexLower = unparsed.indexOf(cl2Lower);
                    if (indexLower != -1) minStart = Math.min(minStart, indexLower);
                });
                
                parsed[clauseLower] = unparsed.substring(0, minStart).trim();
                unparsed = unparsed.substr(minStart);

                return true;
            }
            return false;
        });
    }
    return parsed;
}

async function runQuery (query) {
    await iL.init({ API_ROOT: process.env.API_ROOT });

    const parsedQuery = parseQuery(query);

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

            if (whereMatch && whereMatch[1] === "centre") {
                results = results.filter(r => r.centre == whereMatch[3]);
            }
        } else if (table === "Term") {
            results = await iL.Term.all();
        }

        if (results) {
            if (orderby) {
                results = results.sort((a,b) => a[orderby] < b[orderby] ? -1 : a[orderby] > b[orderby] ? 1 : 0);
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