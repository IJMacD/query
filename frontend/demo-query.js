const Query = require('../src/query');
const demoProvider = require('../src/providers/demo');

const q = new Query;
q.addProvider(demoProvider);

module.exports = sql => q.run(sql);