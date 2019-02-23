const Query = require('../src/query');
const demoProvider = require('../src/providers/demo');

const demoQuery = new Query;
demoQuery.addProvider(demoProvider, "Demo");

module.exports = q => demoQuery.run(q);