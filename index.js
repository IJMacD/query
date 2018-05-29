require('fetch-everywhere');
require('dotenv').config();
const moment = require('moment');

const queryRegex = /SELECT ([^\s]*) FROM ([^\s]*)(?: WHERE ([^\s]*))?(?: ORDER BY ([^\s]*))?/i;

const [ node, script, ...rest ] = process.argv;

const query = rest.join(" ");

runQuery(query);

async function runQuery (query) {
    await iL.init({ API_ROOT: process.env.API_ROOT });

    const match = queryRegex.exec(query);

    if (match) {
        const cols = match[1].split(",");
        const table = match[2];
        const where = match[3];
        const whereMatch = where && where.match(/([^\s]*)\s*([=><])\s*'?([^']*)'?/);
        const orderby = match[4];
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