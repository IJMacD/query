const Query = require('../src/query');
const demoQuery = require('../src/demo-query');

describe("Constants", () => {
    test("String", () => {
        return Query("SELECT 'hello'").then(r => {
            expect(r[1][0]).toBe("hello");
        });
    });

    test("Number", () => {
        return Query("SELECT 42").then(r => {
            expect(r[1][0]).toBe(42);
        });
    });

    test("Negative Number", () => {
        return Query("SELECT -42").then(r => {
            expect(r[1][0]).toBe(-42);
        });
    });

    test("Float Number", () => {
        return Query("SELECT 42.042042").then(r => {
            expect(r[1][0]).toBe(42.042042);
        });
    });

    test("Negative Float Number", () => {
        return Query("SELECT -42.042042").then(r => {
            expect(r[1][0]).toBe(-42.042042);
        });
    });

    test("Exp Float Number", () => {
        return Query("SELECT 42.042042e+8").then(r => {
            expect(r[1][0]).toBe(4204204200);
        });
    });

    test("Negative Exp Float Number", () => {
        return Query("SELECT -42.042042e+8").then(r => {
            expect(r[1][0]).toBe(-4204204200);
        });
    });

    test("Exp Negative Float Number", () => {
        return Query("SELECT 42.042042e-3").then(r => {
            expect(r[1][0]).toBe(0.042042042);
        });
    });

    test("True", () => {
        return Query("SELECT true").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("False", () => {
        return Query("SELECT false").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });
});

describe("Maths", () => {
    test("Addition", () => {
        return Query("SELECT 14 + 28").then(r => {
            expect(r[1][0]).toBe(42);
        });
    });

    test("Subtraction", () => {
        return Query("SELECT 14 - 28").then(r => {
            expect(r[1][0]).toBe(-14);
        });
    });

    test("Multiplication", () => {
        return Query("SELECT 14 * 28").then(r => {
            expect(r[1][0]).toBe(14 * 28);
        });
    });

    test("Division", () => {
        return Query("SELECT 14 / 28").then(r => {
            expect(r[1][0]).toBe(14 / 28);
        });
    });

    test("Order of Operations: +-", () => {
        return Query("SELECT 14 + 28 - 18").then(r => {
            expect(r[1][0]).toBe(24);
        });
    });

    test("Order of Operations: -+", () => {
        return Query("SELECT 14 - 8 + 26").then(r => {
            expect(r[1][0]).toBe(32);
        });
    });

    test("Order of Operations: *+", () => {
        return Query("SELECT 14 * 2 + 7").then(r => {
            expect(r[1][0]).toBe(35);
        });
    });

    test("Order of Operations: *-", () => {
        return Query("SELECT 14 * 2 - 7").then(r => {
            expect(r[1][0]).toBe(21);
        });
    });

    test("Order of Operations: +*", () => {
        return Query("SELECT 14 + 7 * 2").then(r => {
            expect(r[1][0]).toBe(28);
        });
    });

    test("Order of Operations: -*", () => {
        return Query("SELECT 42 - 7 * 3").then(r => {
            expect(r[1][0]).toBe(21);
        });
    });

    test("Order of Operations: +*+", () => {
        return Query("SELECT 14 + 7 * 2 + 1").then(r => {
            expect(r[1][0]).toBe(29);
        });
    });

    test("Order of Operations: +*-", () => {
        return Query("SELECT 14 + 7 * 5 - 1").then(r => {
            expect(r[1][0]).toBe(48);
        });
    });

    test("Order of Operations: *+*", () => {
        return Query("SELECT 14 * 2 + 7 * 2").then(r => {
            expect(r[1][0]).toBe(42);
        });
    });

    test("Order of Operations: *-*", () => {
        return Query("SELECT 14 * 3 - 7 * 5").then(r => {
            expect(r[1][0]).toBe(7);
        });
    });
});

describe("Strings", () => {
    test("Concat operator", () => {
        return Query("SELECT 'Hello, ' || 'world!'").then(r => {
            expect(r[1][0]).toBe("Hello, world!");
        });
    });
});

describe("Nested Functions", () => {
    test("Function -> Expression", () => {
        return Query("SELECT WEEKDAY(5 - 1)").then(r => {
            expect(r[1][0]).toBe("Thursday");
        });
    });

    test("Function x2", () => {
        return Query("SELECT CONCAT(WEEKDAY(3), ' ', CHAR(66), ' ', UNICODE('d'))").then(r => {
            expect(r[1][0]).toBe("Wednesday B 100");
        });
    });

    test("Function x4", () => {
        return Query("SELECT CHAR(UNICODE(CHAR(UNICODE('i'))))").then(r => {
            expect(r[1][0]).toBe("i");
        });
    });

    test("(Function -> Expression) x2", () => {
        return Query("SELECT CHAR(UNICODE(CHAR(UNICODE('2') * 2)) + 3)").then(r => {
            expect(r[1][0]).toBe("g");
        });
    });
});

describe("Logic Operators", () => {
    test("=", () => {
        return Query("SELECT 4 = 4").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("!=", () => {
        return Query("SELECT 4 != 4").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });

    test("<", () => {
        return Query("SELECT 4 < 4").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });

    test(">", () => {
        return Query("SELECT 4 > 4").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });

    test("<=", () => {
        return Query("SELECT 4 <= 4").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test(">", () => {
        return Query("SELECT 4 >= 4").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("IS NULL", () => {
        return Query("SELECT null IS NULL").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("IS NOT NULL", () => {
        return Query("SELECT 42 IS NOT NULL").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("LIKE", () => {
        return Query("SELECT 'hello' LIKE 'h?l%'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("NOT LIKE", () => {
        return Query("SELECT 'goodbye' NOT LIKE 'h?l%'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("REGEXP", () => {
        return Query("SELECT 'abcdef' REGEXP '[a-z]{6}'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("NOT REGEXP", () => {
        return Query("SELECT 'abcdef' NOT REGEXP '^[0-9]+'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });
});

describe("Operator Precedence", () => {
    test("* =", () => {
        return demoQuery("FROM Test WHERE n * 2 = 4").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe(2);
            expect(r[1][1]).toBe(1);
        });
    });

    test("* = *", () => {
        return demoQuery("FROM Test WHERE n * 2 = 3 * 2").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe(3);
            expect(r[1][1]).toBe(1);
        });
    });

    test("* <", () => {
        return demoQuery("FROM Test WHERE n * 2 < 6").then(r => {
            expect(r.length - 1).toBe(3);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
        });
    });

    test("< *", () => {
        return demoQuery("FROM Test WHERE 15 < 3 * n").then(r => {
            expect(r.length - 1).toBe(4);
            expect(r[1][0]).toBe(6);
            expect(r[1][1]).toBe(3);
        });
    });

    test("- < *", () => {
        return demoQuery("FROM Test WHERE 20 - 5 < 3 * n").then(r => {
            expect(r.length - 1).toBe(4);
            expect(r[1][0]).toBe(6);
            expect(r[1][1]).toBe(3);
        });
    });

    test("= AND =", () => {
        return demoQuery("FROM Test WHERE n = 2 AND n2 = 1").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe(2);
            expect(r[1][1]).toBe(1);
        });
    });

    test("> AND =", () => {
        return demoQuery("FROM Test WHERE n > 4 AND n2 = 2").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe(5);
            expect(r[1][1]).toBe(2);
        });
    });

    test("> AND <", () => {
        return demoQuery("FROM Test WHERE n > 4 AND n2 < 4").then(r => {
            expect(r.length - 1).toBe(3);
            expect(r[1][0]).toBe(5);
            expect(r[1][1]).toBe(2);
        });
    });

    test("* > AND < -", () => {
        return demoQuery("FROM Test WHERE n * 2 > 4 AND n2 < 10 - 6").then(r => {
            expect(r.length - 1).toBe(5);
            expect(r[1][0]).toBe(3);
            expect(r[1][1]).toBe(1);
        });
    });

    test("> AND LIKE", () => {
        return demoQuery("FROM Test, Test_2 WHERE n > 4 AND c LIKE 'b'").then(r => {
            expect(r.length - 1).toBe(5);
            expect(r[1][0]).toBe(5);
            expect(r[1][1]).toBe(2);
            expect(r[1][3]).toBe('b');
        });
    });

    test("> AND NOT LIKE", () => {
        return demoQuery("FROM Test, Test_2 WHERE n > 4 AND c NOT LIKE 'b'").then(r => {
            expect(r.length - 1).toBe(45);
            expect(r[1][0]).toBe(5);
            expect(r[1][1]).toBe(2);
            expect(r[1][3]).toBe('a');
        });
    });

    test("= AND NOT LIKE", () => {
        return demoQuery("FROM Test, Test_2 WHERE n = 6 AND c NOT LIKE 'b'").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][0]).toBe(6);
            expect(r[1][1]).toBe(3);
            expect(r[1][3]).toBe('a');
        });
    });

    test("NOT LIKE AND =", () => {
        return demoQuery("FROM Test, Test_2 WHERE c NOT LIKE 'b' AND n = 5").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][0]).toBe(5);
            expect(r[1][1]).toBe(2);
            expect(r[1][3]).toBe('a');
        });
    });

    test("NOT LIKE AND <", () => {
        return demoQuery("FROM Test, Test_2 WHERE c NOT LIKE 'b' AND n < 5").then(r => {
            expect(r.length - 1).toBe(45);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[1][3]).toBe('a');
        });
    });

    test("> AND NOT LIKE", () => {
        return demoQuery("FROM Test, Test_2 WHERE 4 > n2 AND c NOT LIKE 'b'").then(r => {
            expect(r.length - 1).toBe(72);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[1][3]).toBe('a');
        });
    });

    test(" * > - AND NOT LIKE", () => {
        return demoQuery("FROM Test, Test_2 WHERE 3 * 2 > n - 1 AND c NOT LIKE 'a'").then(r => {
            expect(r.length - 1).toBe(63);
            expect(r[1][0]).toBe(0);
            expect(r[1][1]).toBe(0);
            expect(r[1][3]).toBe('b');
        });
    });

    test("|| LIKE", () => {
        return demoQuery("FROM Test_2 WHERE c || 'z' LIKE 'az'").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe('a');
        });
    });

    test("|| NOT LIKE", () => {
        return demoQuery("FROM Test_2 WHERE c || 'z' NOT LIKE 'az'").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][0]).toBe('b');
        });
    });

    test("|| NOT LIKE ||", () => {
        return demoQuery("FROM Test_2 WHERE c || 'z' NOT LIKE 'a' || '%'").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][0]).toBe('b');
        });
    });
})