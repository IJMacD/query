require('fetch-everywhere');
require('dotenv').config();
const query = require('../query');

test("FROM/SELECT required", () => {
    expect.assertions(1);
    return query("").catch(e => {
        expect(e).toBeDefined();
    });
});

test("Column Alias", () => {
    return query("SELECT 'hello' AS greeting").then(r => {
        expect(r[0][0]).toBe("greeting");
    });
});

test("Simple WHERE", () => {
    return query("SELECT 1 AS num WHERE num > 2").then(r => {
        expect(r.length).toBe(1);
    });
});

test("Simple LIMIT", () => {
    return query("SELECT 'boo' LIMIT 0").then(r => {
        expect(r.length).toBe(1);
    });
});