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

    handleQuery(query, req, res);
});

app.get('/query', (req, res) => {
    const query = req.query['q'];

    handleQuery(query, req, res);
});

function handleQuery (query, req, res) {
    console.log(`${new Date().toString().substr(16, 8)} ${query}`);

    if (req.header("origin")) {
        res.setHeader("Access-Control-Allow-Origin", req.header("origin"));
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    Query(query).then(result => {
        const mime = determineMimeType(req.header("accept"));
        res.header("Content-Type", mime);
        res.send(Formatter.format(result, mime));
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
    const accepted = ["application/json", "text/csv", "text/plain"];

    for (const type of accepted) {
        if (mime.includes(type)) {
            return type;
        }
    }

    return "text/plain";
}