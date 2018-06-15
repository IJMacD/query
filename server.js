require('fetch-everywhere');
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

const port = 3000;

const Query = require('./query');
const Formatter = require('./formatter');

app.use(express.urlencoded({ extended: false }));

app.use(express.static("static"));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.post('/query', (req, res) => {
    const query = req.body['query'];

    handleQuery(req, res, query);
});

app.get('/query.:type', (req, res) => {
    const query = req.query['q'];
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
        case "txt":
            mime = "text/plain";
            break;
    }

    handleQuery(req, res, query, mime);
});

app.get('/query', (req, res) => {
    const query = req.query['q'];

    handleQuery(req, res, query);
});

function handleQuery (req, res, query, type) {
    console.log(`${new Date().toString().substr(16, 8)} ${query}`);

    if (req.header("origin")) {
        res.setHeader("Access-Control-Allow-Origin", req.header("origin"));
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    Query(query).then(result => {
        const mime = type || determineMimeType(req.header("accept"));
        const acceptLanguage = req.header("Accept-Language");
        const locale = acceptLanguage && acceptLanguage.split(",")[0];
        res.header("Content-Type", mime);
        res.send(Formatter.format(result, { mime, locale }));
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
    const accepted = ["application/json", "text/csv", "text/html", "text/plain"];

    for (const type of accepted) {
        if (mime.includes(type)) {
            return type;
        }
    }

    return "text/plain";
}