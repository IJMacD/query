#!/usr/bin/env node
require('fetch-everywhere');
require('dotenv').config();

const Query = require('../query');
const Formatter = require('../formatter');

const [ node, script, ...rest ] = process.argv;

const query = rest.join(" ");

Query(query).then(result => {
    console.log(Formatter.format(result));
}).catch(e => console.error(e));
