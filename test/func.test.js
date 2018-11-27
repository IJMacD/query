const demoQuery = require('../src/demo-query');

describe("Aggregate Functions", () => {
  test("COUNT", () => {
    return demoQuery("FROM Test SELECT COUNT(*)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(10);
    });
  });

  // test("COUNT DISTINCT", () => {
  //   return demoQuery("FROM Test, Test_2 SELECT COUNT(DISTINCT n)").then(r => {
  //     // Don't forget header row
  //     expect(r.length - 1).toBe(1);
  //     expect(r[1][0]).toBe(10);
  //   });
  // });

  test("SUM", () => {
    return demoQuery("FROM Test SELECT SUM(n)").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(1);
      expect(r[1][0]).toBe(45);
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

  test("CHAR()", () => {
    return demoQuery("SELECT CHAR(65)").then(r => {
      expect(r[1][0]).toBe("A");
    });
  });

  test("UNICODE()", () => {
    return demoQuery("SELECT UNICODE('a')").then(r => {
      expect(r[1][0]).toBe(97);
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

  describe("EXTRACT()", () => {
    test("EXTRACT(MILLENNIUM)", () => {
      return demoQuery("SELECT EXTRACT(MILLENNIUM FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(3);
      });
    });

    test("EXTRACT(HOUR)", () => {
      return demoQuery("SELECT EXTRACT(HOUR FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(14);
      });
    });

    test("EXTRACT(DOW)", () => {
      return demoQuery("SELECT EXTRACT(DOW FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(3);
      });
    });

    test("EXTRACT(DOY)", () => {
      return demoQuery("SELECT EXTRACT(DOY FROM '2018-07-18T14:27:29')").then(r=> {
        expect(r[1][0]).toBe(199);
      });
    });

    test("EXTRACT(WEEK)", () => {
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
});

describe("Table Valued Functions", function() {
  test("RANGE(10)", () => {
    return demoQuery("FROM RANGE(10)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(10);
      expect(r[1][0]).toBe(0);
      expect(r[2][0]).toBe(1);
      expect(r[10][0]).toBe(9);
    });
  });

  test("RANGE(-10)", () => {
    return demoQuery("FROM RANGE(-10)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(10);
      expect(r[1][0]).toBe(0);
      expect(r[2][0]).toBe(-1);
      expect(r[10][0]).toBe(-9);
    });
  });

  test("RANGE(5,25)", () => {
    return demoQuery("FROM RANGE(5,25)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(20);
      expect(r[1][0]).toBe(5);
      expect(r[2][0]).toBe(6);
      expect(r[20][0]).toBe(24);
    });
  });

  test("RANGE(15,8)", () => {
    return demoQuery("FROM RANGE(15,8)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(7);
      expect(r[1][0]).toBe(15);
      expect(r[2][0]).toBe(14);
      expect(r[7][0]).toBe(9);
    });
  });

  test("RANGE(2,9,3)", () => {
    return demoQuery("FROM RANGE(2,9,3)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(3);
      expect(r[1][0]).toBe(2);
      expect(r[2][0]).toBe(5);
      expect(r[3][0]).toBe(8);
    });
  });

  test("RANGE(2,9,-3)", () => {
    return demoQuery("FROM RANGE(2,9,-3)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(3);
      expect(r[1][0]).toBe(2);
      expect(r[2][0]).toBe(5);
      expect(r[3][0]).toBe(8);
    });
  });

  test("RANGE(9,2,3)", () => {
    return demoQuery("FROM RANGE(9,2,3)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(3);
      expect(r[1][0]).toBe(9);
      expect(r[2][0]).toBe(6);
      expect(r[3][0]).toBe(3);
    });
  });

  test("RANGE(9,2,-3)", () => {
    return demoQuery("FROM RANGE(9,2,-3)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(3);
      expect(r[1][0]).toBe(9);
      expect(r[2][0]).toBe(6);
      expect(r[3][0]).toBe(3);
    });
  });

  test("RANGE(9,3,-3)", () => {
    return demoQuery("FROM RANGE(9,3,-3)").then(r => {
      // remember header row
      expect(r.length - 1).toBe(2);
      expect(r[1][0]).toBe(9);
      expect(r[2][0]).toBe(6);
    });
  });
})