#!/usr/bin/env node
const path = require('path');
const getStdin = require('get-stdin');
require('fetch-everywhere');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MIME_TYPES = {
    plain: "text/plain",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
    sql: "application/sql",
};

const Query = require('../src/query')
const demoProvider = require('../src/providers/demo');
const placeholderProvider = require('../src/providers/placeholder');
const Formatter = require('../src/formatter');

run();

async function run () {
    const [ node, script, ...rest ] = process.argv;

    const opts = rest.filter(a => a[0] === "-");
    let query = rest.filter(a => a[0] !== "-").join(" ").trim();

    const QueryExecutor = new Query();

    let providers = 0;

    if (global['QueryProvider']) {
        QueryExecutor.addProvider(global['QueryProvider']);
        providers++;
    }

    if (opts.includes("--placeholder")) {
        QueryExecutor.addProvider(placeholderProvider, "Placeholder");
        providers++;
    }

    if (providers === 0 || opts.includes("--demo")) {
        QueryExecutor.addProvider(demoProvider, "Demo");
    }

    if (query.length === 0) {
        query = await getStdin();
    }

    let mime = "text/plain";
    let option;

    for (let opt of opts) {
        if (opt.startsWith('-f=') || opt.startsWith("--format=")) {
            const tail = opt.startsWith('-f=') ? opt.substr(3) : opt.substr(9);
            const parts = tail.split(":");
            const fmt = parts[0];
            if (parts.length > 1) {
                option = parts[1];
            }
            mime = MIME_TYPES[fmt];
        }
    }

    QueryExecutor.run(query).then(result => {
        console.log(Formatter.format(result, { mime, option }));
    }).catch(e => console.error(e));
}