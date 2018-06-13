#!/usr/bin/env node
require('fetch-everywhere');
require('dotenv').config();
const moment = require('moment');
var columnify = require('columnify');

const Query = require('../query');
const { repeat } = require('../util');

const [ node, script, ...rest ] = process.argv;

const query = rest.join(" ");

Query(query).then(result => {
    const data = result.map(row => row.map(formatVal));
    const headers = data.shift();
    const lines = headers.map(c => repeat("-", c.length));

    data.unshift(lines);
    data.unshift(headers);

    const options = {
        showHeaders: false,
    };

    const columns = columnify(data, options);

    console.log(columns);
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