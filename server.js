require('fetch-everywhere');
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

const port = 3000;

const Query = require('./query');

app.use(express.urlencoded({ extended: false }));

app.use(express.static("static"));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.post('/query', (req, res) => {
    if (req.header("origin")) {
        res.setHeader("Access-Control-Allow-Origin", req.header("origin"));
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    const query = req.body['query'];
    console.log(`${new Date().toString().substr(16, 8)} ${query}`);

    Query(query).then(result => {
        if (req.header("accept") === "application/json") {
            res.header("Content-Type", "application/json");
            res.send(JSON.stringify(result));
        } else {
            res.header("Content-Type", "text/plain");
            res.send(result.map(row => row.join("\t")).join("\n"));
        }
    }).catch(e => {
        res.status(400);
        res.header("Content-Type", "text/plain");
        res.send(e.message || e);
        console.error(e);
    });
});

app.listen(port, () => console.log(`Query server listening on port ${port}!`));
