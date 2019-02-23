const Query = require('../src/query');
const demoQuery = require('../src/providers/demo');

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

    test("Compact Subtraction", () => {
        return Query("SELECT 21-15").then(r => {
            expect(r[1][0]).toBe(6);
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

    test(">=", () => {
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

    test("IN", () => {
        return Promise.all([
            Query("SELECT 'b' IN ('a','b','c')").then(r => {
                expect(r[1][0]).toBe(true);
            }),
            Query("SELECT 'd' IN ('a','b','c')").then(r => {
                expect(r[1][0]).toBe(false);
            })
        ]);
    });

    test("NOT IN", () => {
        return Promise.all([
            Query("SELECT 'b' NOT IN ('a','b','c')").then(r => {
                expect(r[1][0]).toBe(false);
            }),
            Query("SELECT 'd' NOT IN ('a','b','c')").then(r => {
                expect(r[1][0]).toBe(true);
            })
        ]);
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
        return demoQuery("FROM Test_2 WHERE d > '2018-08-28' AND c LIKE 'h'").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][1]).toBe('h');
        });
    });

    test("> AND NOT LIKE", () => {
        return demoQuery("FROM Test_2 WHERE d > '2018-08-28' AND c NOT LIKE 'h'").then(r => {
            expect(r.length - 1).toBe(3);
            expect(r[1][1]).toBe('g');
            expect(r[2][1]).toBe('i');
            expect(r[3][1]).toBe('j');
        });
    });

    test("= AND NOT LIKE", () => {
        return demoQuery("FROM Test_2 WHERE c = 'f' AND c NOT LIKE 'e'").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][1]).toBe('f');
        });
    });

    test("NOT LIKE AND =", () => {
        return demoQuery("FROM Test_2 WHERE c NOT LIKE 'f' AND c = 'e'").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][1]).toBe('e');
        });
    });

    test("NOT LIKE AND <", () => {
        return demoQuery("FROM Test_2 WHERE c NOT LIKE 'b' AND d < '2018-08-28'").then(r => {
            expect(r.length - 1).toBe(3);
            expect(r[1][1]).toBe('a');
        });
    });

    test("+ > AND NOT LIKE", () => {
        return demoQuery("FROM Test_2 WHERE 3 + 3 > 5 AND c NOT LIKE 'a'").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][1]).toBe('f');
        });
    });

    test(" * > - AND NOT LIKE", () => {
        return demoQuery("FROM Test_2 WHERE 2 * 4 > 7 AND c NOT LIKE 'a'").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][1]).toBe('f');
        });
    });

    test("|| LIKE", () => {
        return demoQuery("FROM Test_2 WHERE c || 'z' LIKE 'az'").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][1]).toBe('a');
        });
    });

    test("|| NOT LIKE", () => {
        return demoQuery("FROM Test_2 WHERE c || 'z' NOT LIKE 'az'").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][1]).toBe('f');
        });
    });

    test("|| NOT LIKE ||", () => {
        return demoQuery("FROM Test_2 WHERE c || 'z' NOT LIKE 'a' || '%'").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][1]).toBe('f');
        });
    });

    test("|| NOT LIKE || AND ", () => {
        return demoQuery("FROM Test_2 WHERE c || 'z' NOT LIKE 'e' || '%' AND 1 = 1").then(r => {
            expect(r.length - 1).toBe(9);
            expect(r[1][1]).toBe('f');
        });
    });

    test("+ IN", () => {
        return Promise.all([
            demoQuery("SELECT 5 + 3 IN (8)").then(r => {
                expect(r.length - 1).toBe(1);
                expect(r[1][0]).toBe(true);
            }),
            demoQuery("SELECT 5 + 3 IN (11)").then(r => {
                expect(r.length - 1).toBe(1);
                expect(r[1][0]).toBe(false);
            })
        ]);
    });

    test("* IN", () => {
        return Promise.all([
            demoQuery("SELECT 5 * 3 IN (15)").then(r => {
                expect(r.length - 1).toBe(1);
                expect(r[1][0]).toBe(true);
            }),
            demoQuery("SELECT 5 * 3 IN (16)").then(r => {
                expect(r.length - 1).toBe(1);
                expect(r[1][0]).toBe(false);
            })
        ]);
    });

    test("+ * IN", () => {
        return Promise.all([
            demoQuery("SELECT 5 + 3 * 2 IN (11)").then(r => {
                expect(r.length - 1).toBe(1);
                expect(r[1][0]).toBe(true);
            }),
            demoQuery("SELECT 5 + 3 * 2 IN (16)").then(r => {
                expect(r.length - 1).toBe(1);
                expect(r[1][0]).toBe(false);
            })
        ]);
    });
})