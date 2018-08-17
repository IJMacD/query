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
    } else if (table.name === "Test_3") {
        return [
            { c: 'A', o: { n: -1 } },
            { c: 'B', o: { n: -2 } },
            { c: 'C', o: { n: -3 } },
            { c: 'D', o: { n: -4 } },
            { c: 'E', o: { n: -5 } },
            { c: 'F', o: { n: -6 } },
            { c: 'G', o: { n: -7 } },
            { c: 'H', o: { n: -8 } },
            { c: 'I', o: { n: -9 } },
            { c: 'J', o: { n: -10 } },
        ];
    } else if (table.name === "Test_4") {
        return [
            { c: 'K', a: [ { n: -1 }, { n: -11 } ] },
            { c: 'L', a: [ { n: -2 }, { n: -12 } ] },
            { c: 'M', a: [ { n: -3 }, { n: -13 } ] },
            { c: 'N', a: [ { n: -4 }, { n: -14 } ] },
            { c: 'O', a: [ { n: -5 }, { n: -15 } ] },
            { c: 'P', a: [ { n: -6 }, { n: -16 } ] },
            { c: 'Q', a: [ { n: -7 }, { n: -17 } ] },
            { c: 'R', a: [ { n: -8 }, { n: -18 } ] },
            { c: 'S', a: [ { n: -9 }, { n: -19 } ] },
            { c: 'T', a: [ { n: -10 }, { n: -20 } ] },
        ];
    }

    throw new Error(`Table not recognised: ${table.name}`);
}

module.exports = function (query) {
  return Query(query, { callbacks: { primaryTable }});
}