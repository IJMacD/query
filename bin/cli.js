#!/usr/bin/env node
const path = require('path');
require('fetch-everywhere');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ilQuery = require('../src/providers/query');
const demoQuery = require('../src/providers/demo');
const Formatter = require('../src/formatter');

const [ node, script, ...rest ] = process.argv;

const opts = rest.filter(a => a[0] === "-");
const query = rest.filter(a => a[0] !== "-").join(" ");

/**
 * @type {(query: string, options) => Promise<any[][]>}
 */
const QueryExecutor = opts.includes("--demo") ? demoQuery : ilQuery;

const debug = opts.includes("--debug");

let mime = "text/plain";
let name;

for (let opt of opts) {
    switch (opt[1]) {
        case "f":
            if (opt.startsWith("-f=plain")) mime = "text/plain";
            else if (opt.startsWith("-f=csv")) mime = "text/csv";
            else if (opt.startsWith("-f=json")) mime = "application/json";
            else if (opt.startsWith("-f=html")) mime = "text/html";
            else if (opt.startsWith("-f=sql")) {
                mime = "application/sql";
                name = opt.split(":")[1];
            }
            break;
    }
}

QueryExecutor(query, { debug }).then(result => {
    console.log(Formatter.format(result, { mime, name }));
}).catch(e => console.error(e));
