require('fetch-everywhere');
require('dotenv').config();
const moment = require('moment');

const Query = require('./query');

const [ node, script, ...rest ] = process.argv;

const query = rest.join(" ");

Query(query).then(result => {
    console.log(result.map(row => row.map(formatVal).join("\t")).join("\n"));
}).catch(e => console.error(e.message));

function formatVal (data) {
    if (data === null || typeof data === "undefined") {
        return "NULL";
    }
    if (data instanceof Date) {
        return moment(data).format("ddd DD/MM HH:mm");
    }
    return data.toString();
}