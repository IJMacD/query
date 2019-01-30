#!/usr/bin/env node
const path = require('path');
require('fetch-everywhere');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ilQuery = require('../src/query');
const demoQuery = require('../src/demo-query');
const Formatter = require('../src/formatter');

const [ node, script, ...rest ] = process.argv;

const args = rest.filter(a => a[0] === "-");
const query = rest.filter(a => a[0] !== "-").join(" ");

/**
 * @type {(query: string, options) => Promise<any[][]>}
 */
const QueryExecutor = args.includes("--demo") ? demoQuery : ilQuery;

const debug = args.includes("--debug");

let mime = "text/plain";
let name;

for (let arg of args) {
    switch (arg[1]) {
        case "f":
            if (arg.startsWith("-f=plain")) mime = "text/plain";
            else if (arg.startsWith("-f=csv")) mime = "text/csv";
            else if (arg.startsWith("-f=json")) mime = "application/json";
            else if (arg.startsWith("-f=html")) mime = "text/html";
            else if (arg.startsWith("-f=sql")) {
                mime = "application/sql";
                name = arg.split(":")[1];
            }
            break;
    }
}

QueryExecutor(query, { debug }).then(result => {
    console.log(Formatter.format(result, { mime, name }));
}).catch(e => console.error(e));
