const demoQuery = require('../src/providers/demo');

describe("Aggregate Functions", () => {
  test("COUNT", () => {
    return demoQuery("FROM Test SELECT COUNT(*)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(10);
    });
  });

  test("COUNT DISTINCT", () => {
    return demoQuery("FROM Test SELECT COUNT(DISTINCT n2)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(5);
    });
  });

  test("COUNT expression", () => {
    return demoQuery("FROM Test SELECT COUNT(n > 4)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(5);
    });
  });

  test("COUNT empty", () => {
    return demoQuery("FROM Test WHERE n > 10 SELECT COUNT(*)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(0);
    });
  });

  test("SUM", () => {
    return demoQuery("FROM Test SELECT SUM(n)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(45);
    });
  });

  test("SUM DISTINCT", () => {
    return demoQuery("FROM Test SELECT SUM(DISTINCT n2)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(10);
    });
  });

  test("AVG", () => {
    return demoQuery("FROM Test SELECT AVG(n)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(4.5);
    });
  });

  test("MIN", () => {
    return demoQuery("FROM Test SELECT MIN(n)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(0);
    });
  });

  test("MAX", () => {
    return demoQuery("FROM Test SELECT MAX(n)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(9);
    });
  });

  test("LISTAGG", () => {
    return demoQuery("FROM Test SELECT LISTAGG(n)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe('0,1,2,3,4,5,6,7,8,9');
    });
  });

  test("LISTAGG DISTINCT", () => {
    return demoQuery("FROM Test SELECT LISTAGG(DISTINCT n2)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe('0,1,2,3,4');
    });
  });
});

describe("Value Functions", () => {
  test("WEEKDAY()", () => {
    return demoQuery("SELECT WEEKDAY(2)").then(r => {
      expect(r[1][0]).toBe("Tuesday");
    });
  });

  test("RAND()", () => {
    return demoQuery("SELECT RAND()").then(r => {
      expect(typeof r[1][0]).toBe("number");
    });
  });

  test("CONCAT()", () => {
    return demoQuery("SELECT CONCAT('fat', 'her')").then(r => {
      expect(r[1][0]).toBe("father");
    });
  });

  describe("CHAR()", () => {
    test("65", () => {
      return demoQuery("SELECT CHAR(65)").then(r => {
        expect(r[1][0]).toBe("A");
      });
    });
    test("128515", () => {
      return demoQuery("SELECT CHAR(128515)").then(r => {
        expect(r[1][0]).toBe("😃");
      });
    });
  });

  describe("UNICODE()", () => {
    test("a", () => {
      return demoQuery("SELECT UNICODE('a')").then(r => {
        expect(r[1][0]).toBe(97);
      });
    });
    test("你好", () => {
      return demoQuery("SELECT UNICODE('你好')").then(r => {
        expect(r[1][0]).toBe(20320);
      });
    });
    test("😃", () => {
      return demoQuery("SELECT UNICODE('😃')").then(r => {
        expect(r[1][0]).toBe(128515);
      });
    });
  });

  test("DATE()", () => {
    return demoQuery("SELECT DATE('2018-07-18T14:27:29')").then(r => {
      expect(r[1][0]).toBe("2018-07-18");
    });
  });

  test("TIME()", () => {
    return demoQuery("SELECT TIME('2018-07-18T14:27:29')").then(r => {
      expect(r[1][0]).toBe("14:27:29");
    });
  });

  test("DATETIME()", () => {
    return demoQuery("SELECT DATETIME('2018-07-18T14:27:29')").then(r => {
      expect(r[1][0]).toBe('2018-07-18 14:27:29');
    });
  });

  describe("DURATION", () => {
    test("1s", () => {
      return demoQuery("SELECT DURATION(1000)").then(r => {
        expect(r[1][0]).toBe("0:01");
      });
    });

    test("12h 34m 56s", () => {
      return demoQuery("SELECT DURATION(45296000)").then(r => {
        expect(r[1][0]).toBe("12:34:56");
      });
    });

    test("2d 16h 10m 0s", () => {
      return demoQuery("SELECT DURATION(231000000)").then(r => {
        expect(r[1][0]).toBe("2 days, 16 hours");
      });
    });
  });

  describe("EXTRACT()", () => {
    test("MILLENNIUM", () => {
      return demoQuery("SELECT EXTRACT(MILLENNIUM FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(3);
      });
    });

    test("HOUR", () => {
      return demoQuery("SELECT EXTRACT(HOUR FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(14);
      });
    });

    test("DOW", () => {
      return demoQuery("SELECT EXTRACT(DOW FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(3);
      });
    });

    test("DOY", () => {
      return demoQuery("SELECT EXTRACT(DOY FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(199);
      });
    });

    test("WEEK", () => {
      return demoQuery("SELECT EXTRACT(WEEK FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(29);
      });
    });
  });

  describe("CAST()", () => {
    test("INT", () => {
      return demoQuery("SELECT CAST('42.547' AS INT)").then(r => {
        expect(r[1][0]).toBe(42);
      });
    });

    test("FLOAT", () => {
      return demoQuery("SELECT CAST('42.547' AS FLOAT)").then(r => {
        expect(r[1][0]).toBe(42.547);
      });
    });

    test("STRING", () => {
      return demoQuery("SELECT CAST(42.547 AS STRING)").then(r => {
        expect(r[1][0]).toBe("42.547");
      });
    });
  });
});

describe("Table Valued Functions", function() {
  describe("RANGE", () => {
    test("10", () => {
      return demoQuery("FROM RANGE(10)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(10);
        expect(r[1][0]).toBe(0);
        expect(r[2][0]).toBe(1);
        expect(r[10][0]).toBe(9);
      });
    });

    test("-10", () => {
      return demoQuery("FROM RANGE(-10)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(10);
        expect(r[1][0]).toBe(0);
        expect(r[2][0]).toBe(-1);
        expect(r[10][0]).toBe(-9);
      });
    });

    test("5,25", () => {
      return demoQuery("FROM RANGE(5,25)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(20);
        expect(r[1][0]).toBe(5);
        expect(r[2][0]).toBe(6);
        expect(r[20][0]).toBe(24);
      });
    });

    test("15,8", () => {
      return demoQuery("FROM RANGE(15,8)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(7);
        expect(r[1][0]).toBe(15);
        expect(r[2][0]).toBe(14);
        expect(r[7][0]).toBe(9);
      });
    });

    test("2,9,3", () => {
      return demoQuery("FROM RANGE(2,9,3)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(3);
        expect(r[1][0]).toBe(2);
        expect(r[2][0]).toBe(5);
        expect(r[3][0]).toBe(8);
      });
    });

    test("2,9,-3", () => {
      return demoQuery("FROM RANGE(2,9,-3)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(3);
        expect(r[1][0]).toBe(2);
        expect(r[2][0]).toBe(5);
        expect(r[3][0]).toBe(8);
      });
    });

    test("9,2,3", () => {
      return demoQuery("FROM RANGE(9,2,3)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(3);
        expect(r[1][0]).toBe(9);
        expect(r[2][0]).toBe(6);
        expect(r[3][0]).toBe(3);
      });
    });

    test("9,2,-3", () => {
      return demoQuery("FROM RANGE(9,2,-3)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(3);
        expect(r[1][0]).toBe(9);
        expect(r[2][0]).toBe(6);
        expect(r[3][0]).toBe(3);
      });
    });

    test("9,3,-3", () => {
      return demoQuery("FROM RANGE(9,3,-3)").then(r => {
        // remember header row
        expect(r.length - 1).toBe(2);
        expect(r[1][0]).toBe(9);
        expect(r[2][0]).toBe(6);
      });
    });
  });
});

describe("Window Functions", () => {
  test("ROW_NUMBER", () => {
    return demoQuery("FROM Test SELECT *,ROW_NUMBER() OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(1);
      expect(r[2][3]).toBe(2);
      expect(r[3][3]).toBe(3);
      expect(r[4][3]).toBe(1);
      expect(r[5][3]).toBe(2);
      expect(r[6][3]).toBe(3);
    });
  });

  test("RANK", () => {
    return demoQuery("FROM Test SELECT *,RANK() OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(1);
      expect(r[2][3]).toBe(1);
      expect(r[3][3]).toBe(3);
      expect(r[4][3]).toBe(1);
      expect(r[5][3]).toBe(2);
      expect(r[6][3]).toBe(2);
    });
  });

  test("DENSE_RANK", () => {
    return demoQuery("FROM Test SELECT *,DENSE_RANK() OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(1);
      expect(r[2][3]).toBe(1);
      expect(r[3][3]).toBe(2);
      expect(r[4][3]).toBe(1);
      expect(r[5][3]).toBe(2);
      expect(r[6][3]).toBe(2);
    });
  });

  test("PERCENT_RANK", () => {
    return demoQuery("FROM Test SELECT *,PERCENT_RANK() OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(0);
      expect(r[2][3]).toBe(0);
      expect(r[3][3]).toBe(1);
      expect(r[4][3]).toBe(0);
      expect(r[5][3]).toBe(0.5);
      expect(r[6][3]).toBe(0.5);
    });
  });

  test("CUME_DIST", () => {
    return demoQuery("FROM Test SELECT *,CUME_DIST() OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBeCloseTo(0.666666);
      expect(r[2][3]).toBeCloseTo(0.666666);
      expect(r[3][3]).toBeCloseTo(1);
      expect(r[4][3]).toBeCloseTo(0.333333);
      expect(r[5][3]).toBeCloseTo(1);
      expect(r[6][3]).toBeCloseTo(1);
    });
  });

  test("NTILE(2)", () => {
    return demoQuery("FROM Test SELECT *,NTILE(2) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(1);
      expect(r[2][3]).toBe(1);
      expect(r[3][3]).toBe(2);
      expect(r[4][3]).toBe(1);
      expect(r[5][3]).toBe(1);
      expect(r[6][3]).toBe(2);
    });
  });

  test("NTILE(3)", () => {
    return demoQuery("FROM Test SELECT *,NTILE(3) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(1);
      expect(r[2][3]).toBe(2);
      expect(r[3][3]).toBe(3);
      expect(r[4][3]).toBe(1);
      expect(r[5][3]).toBe(2);
      expect(r[6][3]).toBe(3);
    });
  });

  test("LAG", () => {
    return demoQuery("FROM Test SELECT *,LAG(n) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBeNull()
      expect(r[2][3]).toBe(0);
      expect(r[3][3]).toBe(1);
      expect(r[4][3]).toBeNull()
      expect(r[5][3]).toBe(3);
      expect(r[6][3]).toBe(4);
    });
  });

  test("LAG(2)", () => {
    return demoQuery("FROM Test SELECT *,LAG(n, 2) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBeNull();
      expect(r[2][3]).toBeNull();
      expect(r[3][3]).toBe(0);
      expect(r[4][3]).toBeNull();
      expect(r[5][3]).toBeNull();
      expect(r[6][3]).toBe(3);
    });
  });

  test("LEAD", () => {
    return demoQuery("FROM Test SELECT *,LEAD(n) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(1)
      expect(r[2][3]).toBe(2);
      expect(r[3][3]).toBeNull()
      expect(r[4][3]).toBe(4)
      expect(r[5][3]).toBe(5);
      expect(r[6][3]).toBeNull();
    });
  });

  test("LEAD(2)", () => {
    return demoQuery("FROM Test SELECT *,LEAD(n, 2) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(2);
      expect(r[2][3]).toBeNull()
      expect(r[3][3]).toBeNull();
      expect(r[4][3]).toBe(5);
      expect(r[5][3]).toBeNull();
      expect(r[6][3]).toBeNull();
    });
  });

  test("FIRST_VALUE", () => {
    return demoQuery("FROM Test SELECT *,FIRST_VALUE(n) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(0);
      expect(r[2][3]).toBe(0)
      expect(r[3][3]).toBe(0);
      expect(r[4][3]).toBe(3);
      expect(r[5][3]).toBe(3);
      expect(r[6][3]).toBe(3);
    });
  });

  test("LAST_VALUE", () => {
    return demoQuery("FROM Test SELECT *,LAST_VALUE(n) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(2);
      expect(r[2][3]).toBe(2)
      expect(r[3][3]).toBe(2);
      expect(r[4][3]).toBe(5);
      expect(r[5][3]).toBe(5);
      expect(r[6][3]).toBe(5);
    });
  });

  test("NTH_VALUE", () => {
    return demoQuery("FROM Test SELECT *,NTH_VALUE(n, 2) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][3]).toBe(1);
      expect(r[2][3]).toBe(1)
      expect(r[3][3]).toBe(1);
      expect(r[4][3]).toBe(4);
      expect(r[5][3]).toBe(4);
      expect(r[6][3]).toBe(4);
    });
  });

  test("MAP", () => {
    return demoQuery("FROM Test SELECT JSON_STRINGIFY(MAP(n) OVER (PARTITION BY n3 ORDER BY n2))").then(r => {
      expect(r.length - 1).toBe(10);
      expect(r[1][0]).toBe('[0,1,2]');
      expect(r[2][0]).toBe('[0,1,2]')
      expect(r[3][0]).toBe('[0,1,2]');
      expect(r[4][0]).toBe('[3,4,5]');
      expect(r[5][0]).toBe('[3,4,5]');
      expect(r[6][0]).toBe('[3,4,5]');
      expect(r[7][0]).toBe('[6,7,8]');
      expect(r[8][0]).toBe('[6,7,8]');
      expect(r[9][0]).toBe('[6,7,8]');
      expect(r[10][0]).toBe('[9]');
    });
  });

  test("IN MAP", () => {
    return demoQuery("FROM Test WHERE n2 IN MAP(n3) OVER (PARTITION BY n3 ORDER BY n2)").then(r => {
      expect(r.length - 1).toBe(3);
      expect(r.slice(1)).toEqual([
        [0,0,0],
        [1,0,0],
        [3,1,1],
      ]);
    });
  });
})