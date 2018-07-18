const Query = require('../query');

const cb = {
    primaryTable (table) {
        if (table.name === "Test") {
            return [
                { num: 0 },
                { num: 1 },
                { num: 2 },
                { num: 3 },
                { num: 4 },
                { num: 5 },
                { num: 6 },
                { num: 7 },
                { num: 8 },
                { num: 9 },
            ];
        }

        throw new Error(`Table not recognised: ${table.name}`);
    }
}

test("FROM/SELECT required", () => {
    expect.assertions(1);
    return Query("").catch(e => {
        expect(e).toBeDefined();
    });
});

test("FROM returns data", () => {
    return Query("FROM Test", cb).then(r => {
        expect(r.length).toBe(11);
    });
});

test("Column Alias", () => {
    return Query("SELECT 'hello' AS greeting").then(r => {
        expect(r[0][0]).toBe("greeting");
    });
});

test("Simple WHERE", () => {
    return Query("FROM Test WHERE num > 2", cb).then(r => {
        expect(r.length).toBe(8);
    });
});

test("Zero LIMIT", () => {
    return Query("SELECT 'boo' LIMIT 0").then(r => {
        expect(r.length).toBe(1);
    });
});

test("Simple LIMIT", () => {
    return Query("FROM Test LIMIT 5", cb).then(r => {
        expect(r.length).toBe(6);
    });
});

test("Descending ORDER", () => {
    return Query("FROM Test ORDER BY 0 DESC", cb).then(r => {
        expect(r[1][0]).toBe(9);
        expect(r[10][0]).toBe(0);
    });
});