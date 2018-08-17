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

test("CROSS JOIN", () => {
    return demoQuery("FROM Test, Test_2").then(r => {
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
    return demoQuery("FROM Test, Test_2 SELECT c,n").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
        expect(r[1].length).toBe(2);
        expect(r[1][0]).toBe('a');
        expect(r[1][1]).toBe(0);
    });
});

test("CROSS JOIN Resolved Columns", () => {
    return demoQuery("FROM Test, Test_2 SELECT Test_2.c,Test.n").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
        expect(r[1].length).toBe(2);
        expect(r[1][0]).toBe('a');
        expect(r[1][1]).toBe(0);
    });
});

test("CROSS JOIN Aliased Columns", () => {
    return demoQuery("FROM Test AS t1, Test_2 AS t2 SELECT t2.c,t1.n").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
        expect(r[1].length).toBe(2);
        expect(r[1][0]).toBe('a');
        expect(r[1][1]).toBe(0);
    });
});

test("Self CROSS JOIN", () => {
    return demoQuery("FROM Test, Test").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(100);
    });
});

test("Filtered Self CROSS JOIN", () => {
    return demoQuery("FROM Test AS a, Test AS b WHERE a.n != b.n").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(90);
    });
});

test("Invariant Filtered Self CROSS JOIN", () => {
    return demoQuery("FROM Test AS a, Test AS b WHERE a.n < b.n").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(45);
    });
});

test("Expression Filtered Self CROSS JOIN", () => {
    return demoQuery("FROM Test AS a, Test AS b WHERE a.n + b.n = 3").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(4);
    });
});

test("Expression Predicate Self CROSS JOIN", () => {
    return demoQuery("FROM Test AS a, Test AS b ON a.n + 1 = b.n").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(9);
    });
});

test("Expression Access Predicate Self CROSS JOIN", () => {
    return demoQuery("FROM Test AS a, Test AS b ON a.n + b.n = 3").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(4);
    });
});