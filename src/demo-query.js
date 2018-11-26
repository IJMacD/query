const Query = require('./query');

function primaryTable (table) {
    if (table.name === "Test") {
        return [
            { n: 0, n2: 0, n3: 0 },
            { n: 1, n2: 0, n3: 0 },
            { n: 2, n2: 1, n3: 0 },
            { n: 3, n2: 1, n3: 1 },
            { n: 4, n2: 2, n3: 1 },
            { n: 5, n2: 2, n3: 1 },
            { n: 6, n2: 3, n3: 2 },
            { n: 7, n2: 3, n3: 2 },
            { n: 8, n2: 4, n3: 2 },
            { n: 9, n2: 4, n3: 3 },
        ];
    } else if (table.name === "Test_2") {
        return [
            { c: 'a', d: new Date("2018-08-21") },
            { c: 'b', d: new Date("2018-08-21") },
            { c: 'c', d: new Date("2018-08-22") },
            { c: 'd', d: new Date("2018-08-22") },
            { c: 'e', d: new Date("2018-08-28") },
            { c: 'f', d: new Date("2018-08-28") },
            { c: 'g', d: new Date("2018-09-21") },
            { c: 'h', d: new Date("2018-09-28") },
            { c: 'i', d: new Date("2018-09-29") },
            { c: 'j', d: new Date("2018-09-29") },
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
            { c: 'L', a: [ { n: -2 }, { n: -12 }, { n: -13 } ] },
            { c: 'M', a: [  ] },
            { c: 'N', a: [ { n: -3 }, { n: -4 }, { n: -14 } ] },
            { c: 'O', a: [ { n: -5 }, { n: -15 } ] },
            { c: 'P', a: [ { n: -6 }, { n: -16 } ] },
            { c: 'Q', a: [  ] },
            { c: 'R', a: [ { n: -7 }, { n: -8 }, { n: -17 }, { n: -18 } ] },
            { c: 'S', a: [ { n: -9 }, { n: -19 } ] },
            { c: 'T', a: [ { n: -10 }, { n: -20 } ] },
        ];
    }

    throw new Error(`Table not recognised: ${table.name}`);
}

module.exports = function (query) {
  return Query(query, { callbacks: { primaryTable }});
}