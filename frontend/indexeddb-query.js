const Query = require('../src/query');
const provider = require('../src/providers/indexeddb');

const q = new Query;
q.addProvider(provider);

module.exports = sql => q.run(sql);