const demoQuery = require('../demo-query');

test("FROM/SELECT required", () => {
    expect.assertions(1);
    return demoQuery("").catch(e => {
        expect(e).toBeDefined();
    });
});

test("FROM returns data", () => {
    return demoQuery("FROM Test").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(10);
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
        // Remember header row
        expect(r.length - 1).toBe(7);
    });
});

test("Zero LIMIT", () => {
    return demoQuery("SELECT 'boo' LIMIT 0").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(0);
    });
});

test("Simple LIMIT", () => {
    return demoQuery("FROM Test LIMIT 5").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(5);
    });
});

test("Descending ORDER", () => {
    return demoQuery("FROM Test ORDER BY 0 DESC").then(r => {
        expect(r[1][0]).toBe(9);
        expect(r[10][0]).toBe(0);
    });
});

test("GROUP BY n", () => {
    return demoQuery("FROM Test GROUP BY n").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(10);
    });
});

test("GROUP BY n2", () => {
    return demoQuery("FROM Test GROUP BY n2").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(5);
    });
});

test("GROUP BY n3", () => {
    return demoQuery("FROM Test GROUP BY n3").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(4);
    });
});

test("GROUP BY n, n2", () => {
    return demoQuery("FROM Test GROUP BY n, n2").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(10);
    });
});

test("GROUP BY n2, n3", () => {
    return demoQuery("FROM Test GROUP BY n2, n3").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(7);
    });
});

test("Aggregate COUNT(*) GROUP BY n", () => {
    return demoQuery("FROM Test GROUP BY n SELECT COUNT(*)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(10);
        expect(r[1][0]).toBe(1);
        expect(r[2][0]).toBe(1);
        expect(r[3][0]).toBe(1);
    });
});

test("Aggregate COUNT(*) GROUP BY n2", () => {
    return demoQuery("FROM Test GROUP BY n2 SELECT COUNT(*)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(5);
        expect(r[1][0]).toBe(2);
        expect(r[2][0]).toBe(2);
        expect(r[3][0]).toBe(2);
        expect(r[4][0]).toBe(2);
        expect(r[5][0]).toBe(2);
    });
});

test("Aggregate COUNT(*) GROUP BY n3", () => {
    return demoQuery("FROM Test GROUP BY n3 SELECT COUNT(*)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(4);
        expect(r[1][0]).toBe(3);
        expect(r[2][0]).toBe(3);
        expect(r[3][0]).toBe(3);
        expect(r[4][0]).toBe(1);
    });
});

test("Aggregate SUM(n2) GROUP BY n", () => {
    return demoQuery("FROM Test GROUP BY n SELECT SUM(n2)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(10);
        expect(r[1][0]).toBe(0);
        expect(r[2][0]).toBe(0);
        expect(r[3][0]).toBe(1);
        expect(r[4][0]).toBe(1);
    });
});

test("Aggregate SUM(n) GROUP BY n2", () => {
    return demoQuery("FROM Test GROUP BY n2 SELECT SUM(n)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(5);
        expect(r[1][0]).toBe(1);
        expect(r[2][0]).toBe(5);
        expect(r[3][0]).toBe(9);
        expect(r[4][0]).toBe(13);
        expect(r[5][0]).toBe(17);
    });
});

test("Aggregate AVG(n) GROUP BY n2", () => {
    return demoQuery("FROM Test GROUP BY n2 SELECT AVG(n)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(5);
        expect(r[1][0]).toBe(0.5);
        expect(r[2][0]).toBe(2.5);
        expect(r[3][0]).toBe(4.5);
        expect(r[4][0]).toBe(6.5);
        expect(r[5][0]).toBe(8.5);
    });
});

test("GROUP BY dates by value", () => {
    return demoQuery("FROM Test_2 GROUP BY d").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(6);
    });
});