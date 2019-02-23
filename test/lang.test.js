const demoQuery = require('../src/providers/demo');

test("FROM/SELECT required", () => {
    expect.assertions(1);
    return demoQuery("").catch(e => {
        expect(e).toBeDefined();
    });
});

describe("FROM", () => {
    test("FROM returns data", () => {
        return demoQuery("FROM Test").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(10);
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
});

describe("SELECT", () => {
    test("SELECT selects columns", () => {
        return demoQuery("FROM Test SELECT n").then(r => {
            expect(r[1][0]).toBe(0);
        });
    });

    describe("Column Alias", () => {
        test("Simple Alias", () => {
            return demoQuery("SELECT 'hello' AS greeting").then(r => {
                expect(r[0][0]).toBe("greeting");
                expect(r[1][0]).toBe("hello");
            });
        });

        test("Alias Reference", () => {
            return demoQuery("SELECT 9 AS num, num + num AS num2").then(r => {
                expect(r[0][0]).toBe("num");
                expect(r[1][0]).toBe(9);
                expect(r[0][1]).toBe("num2");
                expect(r[1][1]).toBe(18);
            });
        });
    });

    test("SELECT Table.*", () => {
        return demoQuery("FROM Test SELECT Test.*").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(10);
            expect(r[0][0]).toBe("n");
            expect(r[0][1]).toBe("n2");
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe(0);
        });
    });
});

test("Simple WHERE", () => {
    return demoQuery("FROM Test WHERE n > 2").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(7);
    });
});

describe("LIMIT", () => {
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

    // test("Expression LIMIT", () => {
    //     return demoQuery("FROM Test LIMIT 3 + 3").then(r => {
    //         // Remember header row
    //         expect(r.length - 1).toBe(6);
    //     });
    // });
});

describe("ORDER BY", () => {
    test("Ascending name", () => {
        return demoQuery("FROM Test_2 ORDER BY c ASC").then(r => {
            expect(r[1][1]).toBe('a');
            expect(r[10][1]).toBe('j');
        });
    });

    test("Ascending name implicit", () => {
        return demoQuery("FROM Test_2 ORDER BY c").then(r => {
            expect(r[1][1]).toBe('a');
            expect(r[10][1]).toBe('j');
        });
    });

    test("Descending name", () => {
        return demoQuery("FROM Test_2 ORDER BY c DESC").then(r => {
            expect(r[1][1]).toBe('j');
            expect(r[10][1]).toBe('a');
        });
    });

    test("Ascending number", () => {
        return demoQuery("FROM Test_2 ORDER BY 2 ASC").then(r => {
            expect(r[1][1]).toBe('a');
            expect(r[10][1]).toBe('j');
        });
    });

    test("Descending number", () => {
        return demoQuery("FROM Test_2 ORDER BY 2 DESC").then(r => {
            expect(r[1][1]).toBe('j');
            expect(r[10][1]).toBe('a');
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
    test("COUNT(*) no GROUP BY", () => {
        return demoQuery("FROM Test SELECT COUNT(*)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe(10);
        });
    });

    test("COUNT(*) GROUP BY n", () => {
        return demoQuery("FROM Test GROUP BY n SELECT COUNT(*)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(10);
            const col = r.slice(1).map(row => row[0]);
            expect(col).toEqual([1,1,1,1,1,1,1,1,1,1]);
        });
    });

    test("COUNT(*) GROUP BY n2", () => {
        return demoQuery("FROM Test GROUP BY n2 SELECT n2, COUNT(*)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(5);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(2);

            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe(2);

            expect(r[3][1]).toBe(2);
            expect(r[4][1]).toBe(2);
            expect(r[5][1]).toBe(2);
        });
    });

    test("COUNT(*) GROUP BY n3", () => {
        return demoQuery("FROM Test GROUP BY n3 SELECT n3, COUNT(*)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(4);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(3);

            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe(3);

            expect(r[3][0]).toBe(2);
            expect(r[3][1]).toBe(3);

            expect(r[4][0]).toBe(3);
            expect(r[4][1]).toBe(1);
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

    test("FILTER", () => {
        return demoQuery("FROM Test SELECT SUM(n) FILTER(WHERE n % 2 = 0), SUM(n) FILTER(WHERE n % 2 = 1)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe(20);
            expect(r[1][1]).toBe(25);
        });
    });

    test("Mixed Aggregate and Non-aggregate functions", () => {
        return demoQuery("FROM Test GROUP BY n2 SELECT SUM(n), CHAR(66 + n2)").then(r => {
            // Remember header row
            expect(r.length - 1).toBe(5);

            expect(r[1][0]).toBe(1);
            expect(r[1][1]).toBe('B');

            expect(r[2][0]).toBe(5);
            expect(r[2][1]).toBe('C');

            expect(r[3][0]).toBe(9);
            expect(r[3][1]).toBe('D');

            expect(r[4][0]).toBe(13);
            expect(r[4][1]).toBe('E');

            expect(r[5][0]).toBe(17);
            expect(r[5][1]).toBe('F');
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
});

describe("TRANSPOSE", () => {
    test("Simple Transpose", () => {
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
});

describe("Subqueries", () => {
    test("Simple", () => {
        return demoQuery("FROM (FROM Test WHERE n > 4)").then (r => {
            expect(r.length - 1).toBe(5);
            expect(r[0]).toHaveLength(3);
            expect(r[1][0]).toBe(5);
            expect(r[2][0]).toBe(6);
            expect(r[3][0]).toBe(7);
            expect(r[4][0]).toBe(8);
            expect(r[5][0]).toBe(9);
        });
    });

    test("With Alias", () => {
        return demoQuery("FROM (FROM Test WHERE n > 6) AS alias SELECT alias.n2").then (r => {
            expect(r.length - 1).toBe(3);
            expect(r[0]).toHaveLength(1);
            expect(r[1][0]).toBe(3);
            expect(r[2][0]).toBe(4);
            expect(r[3][0]).toBe(4);
        });
    });

    test("Joined to normal table", () => {
        return demoQuery("FROM Test_2, (FROM Test WHERE n2 = 2)").then (r => {
            expect(r.length - 1).toBe(20);
            expect(r[0]).toHaveLength(6);

            expect(r[1][0]).toBe(true);
            expect(r[1][1]).toBe('f');
            expect(r[1][2]).toBeInstanceOf(Date);
            expect(r[1][3]).toBe(4);
            expect(r[1][4]).toBe(2);
            expect(r[1][5]).toBe(1);

            expect(r[2][0]).toBe(true);
            expect(r[2][1]).toBe('f');
            expect(r[2][2]).toBeInstanceOf(Date);
            expect(r[2][3]).toBe(5);
            expect(r[2][4]).toBe(2);
            expect(r[2][5]).toBe(1);
        });
    });
});

describe("Common Table Expression", () => {
    test("Single", () => {
        return demoQuery("WITH foo AS (FROM Test WHERE n > 4) FROM foo ORDER BY n DESC").then (r => {
            expect(r.length - 1).toBe(5);
            expect(r[0]).toHaveLength(3);
            expect(r[1][0]).toBe(9);
            expect(r[1][1]).toBe(4);
            expect(r[1][2]).toBe(3);
        });
    });

    test("Column Rename", () => {
        return demoQuery("WITH foo (p, q, r) AS (FROM Test WHERE n > 4) FROM foo").then (r => {
            expect(r.length - 1).toBe(5);
            expect(r[0][0]).toBe('p');
            expect(r[0][1]).toBe('q');
            expect(r[0][2]).toBe('r');
            expect(r[1][0]).toBe(5);
            expect(r[1][1]).toBe(2);
            expect(r[1][2]).toBe(1);
        });
    });

    test("Multiple", () => {
        return demoQuery("WITH foo AS (FROM Test WHERE n > 4), bar AS (FROM Test WHERE n < 6) FROM foo, bar ORDER BY n DESC").then (r => {
            expect(r.length - 1).toBe(30);
            expect(r[1][0]).toBe(9);
            expect(r[1][1]).toBe(4);
            expect(r[1][2]).toBe(3);
            expect(r[1][3]).toBe(5);
            expect(r[1][4]).toBe(2);
            expect(r[1][5]).toBe(1);
        });
    });
});

describe("Window Functions", () => {
    test("Over all rows", () => {
        return demoQuery("FROM Test SELECT *,SUM(n) OVER ()").then (r => {
            expect(r.length - 1).toBe(10);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[1][2]).toBe(0);
            expect(r[1][3]).toBe(45);

            expect(r[2][3]).toBe(45);
            expect(r[3][3]).toBe(45);
            expect(r[4][3]).toBe(45);
            expect(r[5][3]).toBe(45);
        });
    });

    test("Over partition", () => {
        return demoQuery("FROM Test SELECT *,SUM(n) OVER (PARTITION BY n2),SUM(n2) OVER (PARTITION BY n3)").then (r => {
            expect(r.length - 1).toBe(10);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[1][2]).toBe(0);
            expect(r[1][3]).toBe(1);
            expect(r[1][4]).toBe(1);

            expect(r[3][3]).toBe(5);
            expect(r[3][4]).toBe(1);

            expect(r[7][3]).toBe(13);
            expect(r[7][4]).toBe(10);

            expect(r[10][3]).toBe(17);
            expect(r[10][4]).toBe(4);
        });
    });

    test("Over partition expression", () => {
        return demoQuery("FROM Test SELECT *,SUM(n) OVER (PARTITION BY n2 - n3)").then (r => {
            expect(r.length - 1).toBe(10);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[1][2]).toBe(0);
            expect(r[1][3]).toBe(4);

            expect(r[3][3]).toBe(33);

            expect(r[7][3]).toBe(33);

            expect(r[9][3]).toBe(8);
        });
    });

    test("With Alias", () => {
        return demoQuery("FROM Test SELECT *,SUM(n) OVER () AS s").then (r => {
            expect(r.length - 1).toBe(10);
            expect(r[0][3]).toBe("s");

            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[1][2]).toBe(0);
            expect(r[1][3]).toBe(45);

            expect(r[2][3]).toBe(45);
            expect(r[3][3]).toBe(45);
            expect(r[4][3]).toBe(45);
            expect(r[5][3]).toBe(45);
        });
    });

    test("ORDER BY", () => {
        return demoQuery("FROM Test_2 SELECT c, LISTAGG(c) OVER(ORDER BY c)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe('f');
            expect(r[1][1]).toBe("a,b,c,d,e,f,g,h,i,j");
            expect(r[2][0]).toBe('g');
            expect(r[2][1]).toBe("a,b,c,d,e,f,g,h,i,j");
            expect(r[3][0]).toBe('h');
            expect(r[3][1]).toBe("a,b,c,d,e,f,g,h,i,j");
            expect(r[4][0]).toBe('i');
            expect(r[4][1]).toBe("a,b,c,d,e,f,g,h,i,j");
        });
    });

    test("ORDER BY ASC", () => {
        return demoQuery("FROM Test_2 SELECT c, LISTAGG(c) OVER(ORDER BY c ASC)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe('f');
            expect(r[1][1]).toBe("a,b,c,d,e,f,g,h,i,j");
            expect(r[2][0]).toBe('g');
            expect(r[2][1]).toBe("a,b,c,d,e,f,g,h,i,j");
            expect(r[3][0]).toBe('h');
            expect(r[3][1]).toBe("a,b,c,d,e,f,g,h,i,j");
            expect(r[4][0]).toBe('i');
            expect(r[4][1]).toBe("a,b,c,d,e,f,g,h,i,j");
        });
    });

    test("ORDER BY DESC", () => {
        return demoQuery("FROM Test_2 SELECT c, LISTAGG(c) OVER(ORDER BY c DESC)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe('f');
            expect(r[1][1]).toBe("j,i,h,g,f,e,d,c,b,a");
            expect(r[2][0]).toBe('g');
            expect(r[2][1]).toBe("j,i,h,g,f,e,d,c,b,a");
            expect(r[3][0]).toBe('h');
            expect(r[3][1]).toBe("j,i,h,g,f,e,d,c,b,a");
            expect(r[4][0]).toBe('i');
            expect(r[4][1]).toBe("j,i,h,g,f,e,d,c,b,a");
        });
    });

    test("Ordering Using Alias", () => {
        return demoQuery("FROM Test SELECT n AS m, n2 AS m2, n3 AS m3, LAST_VALUE(m2) OVER (PARTITION BY m3 ORDER BY m)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][3]).toBe(1);
            expect(r[2][3]).toBe(1);
            expect(r[3][3]).toBe(1);
            expect(r[4][3]).toBe(2);
            expect(r[5][3]).toBe(2);
            expect(r[6][3]).toBe(2);
        });
    });

    test("Using row position", () => {
        return demoQuery("FROM Test_2 SELECT c, RANK() OVER(ORDER BY c)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r.slice(1)).toEqual([
                ['f',6],
                ['g',7],
                ['h',8],
                ['i',9],
                ['j',10],
                ['a',1],
                ['b',2],
                ['c',3],
                ['d',4],
                ['e',5],
            ]);
        });
    });

    test("PARTITION BY and ORDER BY", () => {
        return demoQuery("FROM Test_2 SELECT b, c, LISTAGG(c) OVER(PARTITION BY b ORDER BY c)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe(true);
            expect(r[1][1]).toBe('f');
            expect(r[1][2]).toBe("c,d,f,g,i,j");

            expect(r[2][0]).toBe(true);
            expect(r[2][1]).toBe('g');
            expect(r[2][2]).toBe("c,d,f,g,i,j");

            expect(r[3][0]).toBe(false);
            expect(r[3][1]).toBe('h');
            expect(r[3][2]).toBe("a,b,e,h");
        });
    });

    test("ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW", () => {
        return demoQuery("FROM Test SELECT n, LISTAGG(n) OVER(ORDER BY n ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe("0");
            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe("0,1");
            expect(r[3][0]).toBe(2);
            expect(r[3][1]).toBe("0,1,2");
            expect(r[4][0]).toBe(3);
            expect(r[4][1]).toBe("0,1,2,3");
        });
    });

    test("ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING", () => {
        return demoQuery("FROM Test SELECT n, LISTAGG(n) OVER(ORDER BY n ASC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe("0,1,2,3,4,5,6,7,8,9");
            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe("1,2,3,4,5,6,7,8,9");
            expect(r[3][0]).toBe(2);
            expect(r[3][1]).toBe("2,3,4,5,6,7,8,9");
            expect(r[4][0]).toBe(3);
            expect(r[4][1]).toBe("3,4,5,6,7,8,9");
        });
    });

    test("ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING", () => {
        return demoQuery("FROM Test SELECT n, LISTAGG(n) OVER(ORDER BY n ASC ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe("0,1,2");
            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe("0,1,2,3");
            expect(r[3][0]).toBe(2);
            expect(r[3][1]).toBe("0,1,2,3,4");
            expect(r[4][0]).toBe(3);
            expect(r[4][1]).toBe("1,2,3,4,5");
        });
    });

    test("RANGE BETWEEN 1 PRECEDING AND 2 FOLLOWING", () => {
        return demoQuery("FROM Test SELECT n2, COUNT(*) OVER(ORDER BY n2 ASC RANGE BETWEEN 1 PRECEDING AND 2 FOLLOWING)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(6);
            expect(r[2][0]).toBe(0);
            expect(r[2][1]).toBe(6);

            expect(r[3][0]).toBe(1);
            expect(r[3][1]).toBe(8);
            expect(r[4][0]).toBe(1);
            expect(r[4][1]).toBe(8);

            expect(r[5][0]).toBe(2);
            expect(r[5][1]).toBe(8);
            expect(r[6][0]).toBe(2);
            expect(r[6][1]).toBe(8);

            expect(r[7][0]).toBe(3);
            expect(r[7][1]).toBe(6);
            expect(r[8][0]).toBe(3);
            expect(r[8][1]).toBe(6);

            expect(r[9][0]).toBe(4);
            expect(r[9][1]).toBe(4);
            expect(r[10][0]).toBe(4);
            expect(r[10][1]).toBe(4);
        });
    });

    test("RANGE BETWEEN UNBOUNDED PRECEDING AND 2 FOLLOWING", () => {
        return demoQuery("FROM Test SELECT n, SUM(n) OVER(ORDER BY n ASC RANGE BETWEEN UNBOUNDED PRECEDING AND 2 FOLLOWING)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(3);
            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe(6);
            expect(r[3][0]).toBe(2);
            expect(r[3][1]).toBe(10);
            expect(r[4][0]).toBe(3);
            expect(r[4][1]).toBe(15);
        });
    });

    test("RANGE BETWEEN 1 PRECEDING AND UNBOUNDED FOLLOWING", () => {
        return demoQuery("FROM Test SELECT n, SUM(n) OVER(ORDER BY n ASC RANGE BETWEEN 1 PRECEDING AND UNBOUNDED FOLLOWING)").then (r => {
            expect(r.length - 1).toBe(10);

            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(45);
            expect(r[2][0]).toBe(1);
            expect(r[2][1]).toBe(45);
            expect(r[3][0]).toBe(2);
            expect(r[3][1]).toBe(45);
            expect(r[4][0]).toBe(3);
            expect(r[4][1]).toBe(44);
            expect(r[5][0]).toBe(4);
            expect(r[5][1]).toBe(42);
            expect(r[6][0]).toBe(5);
            expect(r[6][1]).toBe(39);
        });
    });

    test("in expressions (operator)", () => {
        return demoQuery("FROM Test SELECT n / SUM(n) OVER()").then(data => {
            expect(data.length - 1).toBe(10);

            expect(data[1][0]).toBe(0);
            expect(data[2][0]).toBeCloseTo(1/45);
            expect(data[3][0]).toBeCloseTo(2/45);
            expect(data[4][0]).toBeCloseTo(3/45);
            expect(data[5][0]).toBeCloseTo(4/45);
        });
    });

    test("in expressions (function call and operator)", () => {
        return demoQuery("FROM Test SELECT CHAR(n + SUM(n) OVER())").then(data => {
            expect(data.length - 1).toBe(10);

            expect(data[1][0]).toBe("-");
            expect(data[2][0]).toBe(".");
            expect(data[3][0]).toBe("/");
            expect(data[4][0]).toBe("0");
            expect(data[5][0]).toBe("1");
            expect(data[6][0]).toBe("2");
        })
    });
});

describe("WINDOW clause", () => {
    test("Simple named window", () => {
        return demoQuery("FROM Test SELECT n, CUME_DIST() OVER win WINDOW win AS (ORDER BY n)").then(data => {
            expect(data.length - 1).toBe(10);

            expect(data[1][0]).toBe(0);
            expect(data[1][1]).toBe(0.1);

            expect(data[2][0]).toBe(1);
            expect(data[2][1]).toBe(0.2);

            expect(data[3][0]).toBe(2);
            expect(data[3][1]).toBe(0.3);

            expect(data[4][0]).toBe(3);
            expect(data[4][1]).toBe(0.4);
        });
    });
    test("Named window with brackets", () => {
        return demoQuery("FROM Test SELECT n, CUME_DIST() OVER (win) WINDOW win AS (ORDER BY n)").then(data => {
            expect(data.length - 1).toBe(10);

            expect(data[1][0]).toBe(0);
            expect(data[1][1]).toBe(0.1);

            expect(data[2][0]).toBe(1);
            expect(data[2][1]).toBe(0.2);

            expect(data[3][0]).toBe(2);
            expect(data[3][1]).toBe(0.3);

            expect(data[4][0]).toBe(3);
            expect(data[4][1]).toBe(0.4);
        });
    });

    test("Named window multiple references", () => {
        return demoQuery("FROM Test SELECT n, CUME_DIST() OVER win, CUME_SUM() OVER win WINDOW win AS (ORDER BY n)").then(data => {
            expect(data.length - 1).toBe(10);

            expect(data[1][0]).toBe(0);
            expect(data[1][1]).toBe(0.1);
            expect(data[1][2]).toBe(0);

            expect(data[2][0]).toBe(1);
            expect(data[2][1]).toBe(0.2);
            expect(data[2][2]).toBe(1);

            expect(data[3][0]).toBe(2);
            expect(data[3][1]).toBe(0.3);
            expect(data[3][2]).toBe(3);

            expect(data[4][0]).toBe(3);
            expect(data[4][1]).toBe(0.4);
            expect(data[4][2]).toBe(6);
        });
    });

    test("Multiple named windows", () => {
        return demoQuery("FROM Test SELECT n, CUME_DIST() OVER win, RANK() OVER win2 WINDOW win AS (ORDER BY n), win2 AS (PARTITION BY n3 ORDER BY n2)").then(data => {
            expect(data.length - 1).toBe(10);

            expect(data[1][0]).toBe(0);
            expect(data[1][1]).toBe(0.1);
            expect(data[1][2]).toBe(1);

            expect(data[2][0]).toBe(1);
            expect(data[2][1]).toBe(0.2);
            expect(data[2][2]).toBe(1);

            expect(data[3][0]).toBe(2);
            expect(data[3][1]).toBe(0.3);
            expect(data[3][2]).toBe(3);

            expect(data[4][0]).toBe(3);
            expect(data[4][1]).toBe(0.4);
            expect(data[4][2]).toBe(1);

            expect(data[5][0]).toBe(4);
            expect(data[5][1]).toBe(0.5);
            expect(data[5][2]).toBe(2);
        });
    });
});

test("VALUES", () => {
    return demoQuery("VALUES (1,'a'),(2,'b'),(3,'c')").then(r => {
        expect(r.length - 1).toBe(3);

        expect(r[1][0]).toBe(1);
        expect(r[1][1]).toBe('a');

        expect(r[2][0]).toBe(2);
        expect(r[2][1]).toBe('b');

        expect(r[3][0]).toBe(3);
        expect(r[3][1]).toBe('c');
    })
})