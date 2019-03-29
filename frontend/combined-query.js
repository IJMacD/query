const Query = require('../src/query');
const demoProvider = require('../src/providers/demo');
const idbProvider = require('../src/providers/indexeddb');

const q = new Query;
q.addProvider(demoProvider);
q.addProvider(idbProvider, "IDB");

module.exports = sql => q.run(sql);