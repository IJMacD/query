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

describe("ORDER BY", () => {
    test("Ascending name", () => {
        return demoQuery("FROM Test ORDER BY n ASC").then(r => {
            expect(r[1][0]).toBe(0);
            expect(r[10][0]).toBe(9);
        });
    });

    test("Ascending name implicit", () => {
        return demoQuery("FROM Test ORDER BY n").then(r => {
            expect(r[1][0]).toBe(0);
            expect(r[10][0]).toBe(9);
        });
    });

    test("Descending name", () => {
        return demoQuery("FROM Test ORDER BY n DESC").then(r => {
            expect(r[1][0]).toBe(9);
            expect(r[10][0]).toBe(0);
        });
    });

    test("Ascending number", () => {
        return demoQuery("FROM Test ORDER BY 1 ASC").then(r => {
            expect(r[1][0]).toBe(0);
            expect(r[10][0]).toBe(9);
        });
    });

    test("Descending number", () => {
        return demoQuery("FROM Test ORDER BY 1 DESC").then(r => {
            expect(r[1][0]).toBe(9);
            expect(r[10][0]).toBe(0);
        });
    });

    test("Multiple Column", () => {
        return demoQuery("FROM Test ORDER BY n2 DESC, n").then(r => {
            expect(r[1][0]).toBe(8);
            expect(r[1][1]).toBe(4);
            expect(r[2][0]).toBe(9);
            expect(r[2][1]).toBe(4);
            expect(r[10][0]).toBe(1);
            expect(r[10][1]).toBe(0);
        });
    });

    test("Alias", () => {
        return demoQuery("FROM Test SELECT n AS foo ORDER BY foo DESC").then(r => {
            expect(r[1][0]).toBe(9);
            expect(r[10][0]).toBe(0);
        });
    });

    test("Expression", () => {
        return demoQuery("FROM Test SELECT n ORDER BY n2 - n").then(r => {
            expect(r[1][0]).toBe(9);
            expect(r[2][0]).toBe(7);
            expect(r[3][0]).toBe(8);
            expect(r[4][0]).toBe(5);
            expect(r[9][0]).toBe(2);
            expect(r[10][0]).toBe(0);
        });
    });
});

describe("GROUP BY", () => {
    test("n", () => {
        return demoQuery("FROM Test GROUP BY n").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(10);
        });
    });

    test("n2", () => {
        return demoQuery("FROM Test GROUP BY n2").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(5);
        });
    });

    test("n3", () => {
        return demoQuery("FROM Test GROUP BY n3").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(4);
        });
    });

    test("n, n2", () => {
        return demoQuery("FROM Test GROUP BY n, n2").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(10);
        });
    });

    test("n2, n3", () => {
        return demoQuery("FROM Test GROUP BY n2, n3").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(7);
        });
    });

    test("dates by value", () => {
        return demoQuery("FROM Test_2 GROUP BY d").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(6);
        });
    });

    test("Expressions", () => {
        return demoQuery("FROM Test GROUP BY n - n2").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(6);
        });
    });
});

describe("Aggregate Queries", () => {
    test("COUNT(*) GROUP BY n", () => {
        return demoQuery("FROM Test GROUP BY n SELECT COUNT(*)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(10);
            expect(r[1][0]).toBe(1);
            expect(r[2][0]).toBe(1);
            expect(r[3][0]).toBe(1);
        });
    });

    test("COUNT(*) GROUP BY n2", () => {
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

    test("COUNT(*) GROUP BY n3", () => {
        return demoQuery("FROM Test GROUP BY n3 SELECT COUNT(*)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(4);
            expect(r[1][0]).toBe(3);
            expect(r[2][0]).toBe(3);
            expect(r[3][0]).toBe(3);
            expect(r[4][0]).toBe(1);
        });
    });

    test("SUM(n2) GROUP BY n", () => {
        return demoQuery("FROM Test GROUP BY n SELECT SUM(n2)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(10);
            expect(r[1][0]).toBe(0);
            expect(r[2][0]).toBe(0);
            expect(r[3][0]).toBe(1);
            expect(r[4][0]).toBe(1);
        });
    });

    test("SUM(n) GROUP BY n2", () => {
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

    test("AVG(n) GROUP BY n2", () => {
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

    test("Expressions", () => {
        return demoQuery("FROM Test SELECT SUM(n + n)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe(90);
        });
    });
});

describe("HAVING", () => {
    test("Non-aggregate", () => {
        return demoQuery("FROM Test HAVING n > 4").then (r => {
            expect(r.length - 1).toBe(5);
        });
    });

    test("Aggregate", () => {
        return demoQuery("FROM Test GROUP BY n2 HAVING COUNT(*) > 1").then (r => {
            expect(r.length - 1).toBe(5);
        });
    });
})

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

describe("Table Valued Functions", () => {
    test("in FROM", () => {
        return demoQuery("FROM RANGE(1)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).not.toBeNull();
        });
    });

    test("with multiple paramaters in FROM", () => {
        return demoQuery("FROM RANGE(1,2)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).not.toBeNull();
        });
    });

    test("with expressions in FROM", () => {
        return demoQuery("FROM RANGE(1,3*2)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(5);
            expect(r[1][0]).not.toBeNull();
        });
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
    });
});

test("Common Table Expression", () => {
    return demoQuery("WITH foo AS (FROM Test AS a, Test AS b ON a.n3 = b.n3) FROM foo ORDER BY b.n2").then (r => {
        expect(r.length - 1).toBe(28);
        expect(r[0]).toHaveLength(6);
        expect(r[1][0]).not.toBeNull();
        expect(r[1][4]).toBe(0);
    });
});