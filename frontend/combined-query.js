const Query = require('../src/query');
const { parse } = require('../src/parser');
const demoProvider = require('../src/providers/demo');
const idbProvider = require('../src/providers/indexeddb');

const q = new Query;
q.addProvider(demoProvider);
q.addProvider(idbProvider, "IDB");

// either takes a string or a pre-parsed AST
const query = (sql,params=null) => typeof sql === "string" ? q.run(sql) : q.runSelect(sql,params);

query.parse = parse;

module.exports = query;