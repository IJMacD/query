const demoQuery = require('../src/demo-query');

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

test("ORDER Ascending name", () => {
    return demoQuery("FROM Test ORDER BY n ASC").then(r => {
        expect(r[1][0]).toBe(0);
        expect(r[10][0]).toBe(9);
    });
});

test("ORDER Ascending name implicit", () => {
    return demoQuery("FROM Test ORDER BY n").then(r => {
        expect(r[1][0]).toBe(0);
        expect(r[10][0]).toBe(9);
    });
});

test("ORDER Descending name", () => {
    return demoQuery("FROM Test ORDER BY 1 DESC").then(r => {
        expect(r[1][0]).toBe(9);
        expect(r[10][0]).toBe(0);
    });
});

test("ORDER Ascending number", () => {
    return demoQuery("FROM Test ORDER BY 1 ASC").then(r => {
        expect(r[1][0]).toBe(0);
        expect(r[10][0]).toBe(9);
    });
});

test("ORDER Descending number", () => {
    return demoQuery("FROM Test ORDER BY 1 DESC").then(r => {
        expect(r[1][0]).toBe(9);
        expect(r[10][0]).toBe(0);
    });
});

test("ORDER Multiple Column", () => {
    return demoQuery("FROM Test ORDER BY n2 DESC, n").then(r => {
        expect(r[1][0]).toBe(8);
        expect(r[1][1]).toBe(4);
        expect(r[2][0]).toBe(9);
        expect(r[2][1]).toBe(4);
        expect(r[10][0]).toBe(1);
        expect(r[10][1]).toBe(0);
    });
});

test("ORDER alias", () => {
    return demoQuery("FROM Test SELECT n AS foo ORDER BY foo DESC").then(r => {
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

test("Expressions in GROUP BY", () => {
    return demoQuery("FROM Test GROUP BY n - n2").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(6);
    });
});

test("Expressions in Aggregate Functions", () => {
    return demoQuery("FROM Test SELECT SUM(n + n)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(1);
        expect(r[1][0]).toBe(90);
    });
});

test("Table Alias SELECT", () => {
    return demoQuery("FROM Test AS a SELECT a.n").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(10);
        expect(r[1][0]).toBe(0);
        expect(r[2][0]).toBe(1);
    });
});

test("Multiple Table Alias SELECT", () => {
    return demoQuery("FROM Test AS a, Test AS b SELECT a.n, b.n").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(100);
        expect(r[1][0]).toBe(0);
        expect(r[1][1]).toBe(0);
        expect(r[2][0]).toBe(0);
        expect(r[2][1]).toBe(1);
    });
});

test("Qualified Table SELECT", () => {
    return demoQuery("FROM Test AS a, Test AS b SELECT Test.n, b.n").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(100);
        expect(r[1][0]).toBe(0);
        expect(r[1][1]).toBe(0);
        expect(r[2][0]).toBe(0);
        expect(r[2][1]).toBe(1);
    });
});

test("Auto-alias Table SELECT", () => {
    return demoQuery("FROM Test, Test SELECT Test.n, Test_1.n").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(100);
        expect(r[1][0]).toBe(0);
        expect(r[1][1]).toBe(0);
        expect(r[2][0]).toBe(0);
        expect(r[2][1]).toBe(1);
    });
});

test("Table Valued Functions in FROM", () => {
    return demoQuery("FROM RANGE(1)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(1);
        expect(r[1][0]).not.toBeNull();
    });
});

test("Table Valued Functions with multiple paramaters in FROM", () => {
    return demoQuery("FROM RANGE(1,2)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(1);
        expect(r[1][0]).not.toBeNull();
    });
});

test("Table Valued Functions with expressions in FROM", () => {
    return demoQuery("FROM RANGE(1,3*2)").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(5);
        expect(r[1][0]).not.toBeNull();
    });
});

test("Transpose", () => {
    return demoQuery("TRANSPOSE FROM Test").then(r => {
        // INCLUDE header row here
        expect(r.length).toBe(3);
        expect(r[0][0]).toBe("n");
        expect(r[1][0]).toBe("n2");
        expect(r[2][0]).toBe("n3");

        expect(r[0][1]).toBe(0);
        expect(r[0][2]).toBe(1);
        expect(r[0][3]).toBe(2);

        expect(r[1][3]).toBe(1);
    })
});

test("Double Transpose", () => {
    return demoQuery("TRANSPOSE TRANSPOSE FROM Test").then(r => {
        // Now disclude header row here
        expect(r.length - 1).toBe(10);
        expect(r[0][0]).toBe("n");
        expect(r[0][1]).toBe("n2");
        expect(r[0][2]).toBe("n3");

        expect(r[1][0]).toBe(0);
        expect(r[2][0]).toBe(1);
        expect(r[3][0]).toBe(2);

        expect(r[3][1]).toBe(1);
    })
});