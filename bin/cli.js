#!/usr/bin/env node

const path = require('path');
const getStdin = require('get-stdin');
require('fetch-everywhere');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { MIME_TYPES } = require('../src/mime');

const Query = require('../src/query')
const demoProvider = require('../src/providers/demo');
const placeholderProvider = require('../src/providers/placeholder');
const Formatter = require('../src/formatter');

const helpText = `IJMacD Query
Usage: ${process.argv[1]} [OPTIONS] QUERY

QUERY can also be provided on stdin

Options:

-h,--help                   Show this help text

-fFORMAT[:OPTION],
--format=FORMAT[:OPTION]    Set output to specific format. Currently supported formats:
                                plain, csv, sql, html, json
                            Supported format options:
                                sql:NAME        set name for table in INSERT clause
                                json:array      json output as array of arrays (default)
                                json:object     json output as array of objects

--no-headers                Don't show headers for plain, csv, or json:array output formats

--demo                      Use Demo provider (default)
--placeholder               Use Placeholder provider
`;

run();

async function run () {
    const [ node, script, ...rest ] = process.argv;

    const opts = rest.filter(a => a[0] === "-");
    let query = rest.filter(a => a[0] !== "-").join(" ").trim();

    if (opts.includes("-h") || opts.includes("--help")) {
        console.log(helpText);
        return;
    }

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

    const headers = !opts.includes("--no-headers");

    for (let opt of opts) {
        if (opt.startsWith('-f') || opt.startsWith("--format=")) {
            const tail = opt.startsWith('-f=') ? opt.substr(3) : (opt.startsWith('-f') ? opt.substr(2) : opt.substr(9));
            const parts = tail.split(":");
            const fmt = parts[0];
            if (parts.length > 1) {
                option = parts[1];
            }
            mime = MIME_TYPES[fmt];
        }
    }

    QueryExecutor.run(query).then(result => {
        console.log(Formatter.format(result, { mime, option, headers }));
    }).catch(e => console.error(e));
}