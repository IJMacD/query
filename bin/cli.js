#!/usr/bin/env node
const path = require('path');
const getStdin = require('get-stdin');
require('fetch-everywhere');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const demoQuery = require('../src/providers/demo');
const placeholderQuery = require('../src/providers/placeholder');
const Formatter = require('../src/formatter');

run();

async function run () {
    const [ node, script, ...rest ] = process.argv;

    const opts = rest.filter(a => a[0] === "-");
    let query = rest.filter(a => a[0] !== "-").join(" ").trim();

    if (query.length === 0) {
        query = await getStdin();
    }

    /**
     * @type {(query: string) => Promise<any[][]>}
     */
    let QueryExecutor = global['QueryExecutor'] || (opts.includes("--placeholder") ? placeholderQuery : demoQuery);

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

    QueryExecutor(query).then(result => {
        console.log(Formatter.format(result, { mime, name }));
    }).catch(e => console.error(e));
}