require('fetch-everywhere');
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

const port = 3000;

const Query = require('./src/query')
const demoProvider = require('./src/providers/demo');
const placeholderProvider = require('./src/providers/placeholder');
// const indexedDBProvider = require('./src/providers/indexeddb');
const Formatter = require('./src/formatter');

const [ node, script, ...rest ] = process.argv;

const args = rest.filter(a => a[0] === "-");

const QueryExecutor = new Query();

let providers = 0;

if (global['QueryProvider']) {
    QueryExecutor.addProvider(global['QueryProvider']);
    providers++;
}

if (args.includes("--placeholder")) {
    QueryExecutor.addProvider(placeholderProvider, "Placeholder");
    providers++;
}


// if (args.includes("--idb")) {
//     QueryExecutor.addProvider(indexedDBProvider, "IDB");
//     providers++;
// }

if (providers === 0 || args.includes("--demo")) {
    QueryExecutor.addProvider(demoProvider, "Demo");
}

app.use(express.urlencoded({ extended: false }));

app.use(express.static("static"));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.get('/query.js', (req, res) => res.sendFile(path.join(__dirname, "./frontend/server-query.js")));
app.get('/main.js', (req, res) => res.sendFile(path.join(__dirname, "./frontend/main.js")));

app.post('/query', (req, res) => {
    const query = req.body['query'];

    handleQuery(req, res, query);
});

app.get('/query.:type', (req, res) => {
    const query = req.query['q'];
    const insert = req.query['insert'];
    const type = req.params['type'];
    let mime;
    switch (type) {
        case "json":
            mime = "application/json";
            break;
        case "csv":
            mime = "text/csv";
            break;
        case "html":
            mime = "text/html";
            break;
        case "sql":
            mime = "application/sql";
            break;
        case "txt":
            mime = "text/plain";
            break;
    }

    handleQuery(req, res, query, mime, insert);
});

app.get('/query', (req, res) => {
    const query = req.query['q'];

    handleQuery(req, res, query);
});

function handleQuery (req, res, query, type, name) {
    console.log(`${new Date().toString().substr(16, 8)} ${query}`);

    if (req.header("origin")) {
        res.setHeader("Access-Control-Allow-Origin", req.header("origin"));
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    QueryExecutor.run(query).then(result => {
        const mime = type || determineMimeType(req.header("accept"));
        const acceptLanguage = req.header("Accept-Language");
        const locale = acceptLanguage && acceptLanguage.split(",")[0];
        res.header("Content-Type", mime);
        res.send(Formatter.format(result, { mime, locale, name }));
    }).catch(e => {
        res.status(400);
        res.header("Content-Type", "text/plain");
        res.send(e.message || e);
        console.error(e);
    });
}

app.listen(port, () => console.log(`Query server listening on port ${port}!`));

/**
 *
 * @param {string} mime
 * @returns {string}
 */
function determineMimeType (mime) {
    const accepted = ["application/json", "text/csv", "text/html", "application/sql", "text/plain"];

    for (const type of accepted) {
        if (mime.includes(type)) {
            return type;
        }
    }

    return "text/plain";
}
