const demoQuery = require('../demo-query');

test("FROM/SELECT required", () => {
    expect.assertions(1);
    return demoQuery("").catch(e => {
        expect(e).toBeDefined();
    });
});

test("FROM returns data", () => {
    return demoQuery("FROM Test").then(r => {
        expect(r.length).toBe(11);
    });
});

test("SELECT selects columns", () => {
    return demoQuery("FROM Test SELECT n").then(r => {
        expect(r[1][0]).toBe(0);
    });
});

test("Column Alias", () => {
    return demoQuery("SELECT 'hello' AS greeting").then(r => {
        expect(r[0][0]).toBe("greeting");
    });
});

test("Simple WHERE", () => {
    return demoQuery("FROM Test WHERE n > 2").then(r => {
        expect(r.length).toBe(8);
    });
});

test("Zero LIMIT", () => {
    return demoQuery("SELECT 'boo' LIMIT 0").then(r => {
        expect(r.length).toBe(1);
    });
});

test("Simple LIMIT", () => {
    return demoQuery("FROM Test LIMIT 5").then(r => {
        expect(r.length).toBe(6);
    });
});

test("Descending ORDER", () => {
    return demoQuery("FROM Test ORDER BY 0 DESC").then(r => {
        expect(r[1][0]).toBe(9);
        expect(r[10][0]).toBe(0);
    });
});
