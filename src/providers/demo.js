const { getColumnTypes } = require('../util');

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
            { b: true,  c: 'f', d: new Date("2018-08-28") },
            { b: true,  c: 'g', d: new Date("2018-09-21") },
            { b: false, c: 'h', d: new Date("2018-09-28") },
            { b: true,  c: 'i', d: new Date("2018-09-29") },
            { b: true,  c: 'j', d: new Date("2018-09-29") },
            { b: false, c: 'a', d: new Date("2018-08-21") },
            { b: false, c: 'b', d: new Date("2018-08-21") },
            { b: true,  c: 'c', d: new Date("2018-08-22") },
            { b: true,  c: 'd', d: new Date("2018-08-22") },
            { b: false, c: 'e', d: new Date("2018-08-28") },
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
            { c: 'I', o: null },
            { c: 'J' },
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

module.exports = {
    name: "Demo",
    callbacks: {
        primaryTable,
        getTables: () => [ "Test", "Test_2", "Test_3", "Test_4" ],
        getColumns: (name) => {
            const results = primaryTable({ name });

            if (!results) return [];

            return getColumnTypes(results[0]);
        }
    },
    userFunctions: {
        RAND_CHAR: () => String.fromCharCode(32 + Math.floor(Math.random() * 96))
    }
};