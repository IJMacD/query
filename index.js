require('fetch-everywhere');
require('dotenv').config();

const Query = require('./query');

const [ node, script, ...rest ] = process.argv;

const query = rest.join(" ");

Query(query).then(result => {
    console.log(result.map(row => row.join("\t")).join("\n"));
}).catch(e => console.error(e.message));
