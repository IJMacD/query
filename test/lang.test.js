const Query = require('../query');

const cb = {
    primaryTable (table) {
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

test("SELECT selects columns", () => {
    return Query("FROM Test SELECT n", cb).then(r => {
        expect(r[1][0]).toBe(0);
    });
});

test("Column Alias", () => {
    return Query("SELECT 'hello' AS greeting").then(r => {
        expect(r[0][0]).toBe("greeting");
    });
});

test("Simple WHERE", () => {
    return Query("FROM Test WHERE n > 2", cb).then(r => {
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

test("CROSS JOIN", () => {
    return Query("FROM Test, Test_2", cb).then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
        expect(r[1].length).toBe(2);
        expect(r[1][0]).toBe(0);
        expect(r[1][1]).toBe('a');
        expect(r[2][0]).toBe(0);
        expect(r[2][1]).toBe('b');
    });
});

test("CROSS JOIN Explicit Columns", () => {
    return Query("FROM Test, Test_2 SELECT c,n", cb).then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
        expect(r[1].length).toBe(2);
        expect(r[1][0]).toBe('a');
        expect(r[1][1]).toBe(0);
    });
});

test("CROSS JOIN Resolved Columns", () => {
    return Query("FROM Test, Test_2 SELECT Test_2.c,Test.n", cb).then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
        expect(r[1].length).toBe(2);
        expect(r[1][0]).toBe('a');
        expect(r[1][1]).toBe(0);
    });
});

test("CROSS JOIN Aliased Columns", () => {
    return Query("FROM Test AS t1, Test_2 AS t2 SELECT t2.c,t1.n", cb).then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
        expect(r[1].length).toBe(2);
        expect(r[1][0]).toBe('a');
        expect(r[1][1]).toBe(0);
    });
});

test("Self CROSS JOIN", () => {
    return Query("FROM Test, Test", cb).then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
    });
});

test("Filtered Self CROSS JOIN ", () => {
    return Query("FROM Test AS a, Test AS b WHERE a.n != b.n", cb).then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(90);
    });
});

test("Invariant Filtered Self CROSS JOIN ", () => {
    return Query("FROM Test AS a, Test AS b WHERE a.n < b.n", cb).then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(45);
    });
});