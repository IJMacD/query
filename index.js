require('fetch-everywhere');
require('dotenv').config();


const queryRegex = /SELECT (.*) FROM ([^\s]*)(?: WHERE (.*))?/i;

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
        const whereMatch = where && where.match(/([^\s]*)\s*=\s*'?([^']*)'?/);
        let results;

        // console.log(match);
        // console.log(whereMatch);
        if (table === "Tutor") {
            if (whereMatch) {
                if (whereMatch[1] === "name") {
                    results = [await iL.Tutor.find(whereMatch[2])]; 
                } else if (whereMatch[1] === "id") {
                    results = [iL.Tutor.get(whereMatch[2])];
                }
            }
            else {
                results = await iL.Tutor.all();
            }
        }

        if (results) {
            results.forEach(r => console.log(cols.map(col => r[col]).join("\t")));
        }
    }
}