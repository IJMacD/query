#!/usr/bin/env node
require('fetch-everywhere');
require('dotenv').config();

const ilQuery = require('../query');
const demoQuery = require('../demo-query');
const Formatter = require('../formatter');

const [ node, script, ...rest ] = process.argv;

const args = rest.filter(a => a[0] === "-");
const query = rest.filter(a => a[0] !== "-").join(" ");

const demoMode = args.includes("--demo");

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

(demoMode ? demoQuery : ilQuery)(query).then(result => {
    console.log(Formatter.format(result, { mime, name }));
}).catch(e => console.error(e));
