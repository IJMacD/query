const Query = require('./query');

function primaryTable (table) {
    if (table.name === "Test") {
        return [
            { n: 0 },
            { n: 1 },
            { n: 2 },
            { n: 3 },
            { n: 4 },
            { n: 5 },
            { n: 6 },
            { n: 7 },
            { n: 8 },
            { n: 9 },
        ];
    } else if (table.name === "Test_2") {
        return [
            { c: 'a' },
            { c: 'b' },
            { c: 'c' },
            { c: 'd' },
            { c: 'e' },
            { c: 'f' },
            { c: 'g' },
            { c: 'h' },
            { c: 'i' },
            { c: 'j' },
        ];
    }

    throw new Error(`Table not recognised: ${table.name}`);
}

module.exports = function (query) {
  return Query(query, { primaryTable });
}