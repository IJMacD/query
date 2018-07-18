require('fetch-everywhere');
require('dotenv').config();
const query = require('../query');

describe("Constants", () => {
    test("String", () => {
        return query("SELECT 'hello'").then(r => {
            expect(r[1][0]).toBe("hello");
        });
    });

    test("Number", () => {
        return query("SELECT 42").then(r => {
            expect(r[1][0]).toBe(42);
        });
    });

    test("Negative Number", () => {
        return query("SELECT -42").then(r => {
            expect(r[1][0]).toBe(-42);
        });
    });

    test("Float Number", () => {
        return query("SELECT 42.042042").then(r => {
            expect(r[1][0]).toBe(42.042042);
        });
    });

    test("Negative Float Number", () => {
        return query("SELECT -42.042042").then(r => {
            expect(r[1][0]).toBe(-42.042042);
        });
    });

    test("Exp Float Number", () => {
        return query("SELECT 42.042042e+8").then(r => {
            expect(r[1][0]).toBe(4204204200);
        });
    });

    test("Negative Exp Float Number", () => {
        return query("SELECT -42.042042e+8").then(r => {
            expect(r[1][0]).toBe(-4204204200);
        });
    });

    test("Exp Negative Float Number", () => {
        return query("SELECT 42.042042e-3").then(r => {
            expect(r[1][0]).toBe(0.042042042);
        });
    });

    test("True", () => {
        return query("SELECT true").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("False", () => {
        return query("SELECT false").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });
});

describe("Maths", () => {
    test("Addition", () => {
        return query("SELECT 14 + 28").then(r => {
            expect(r[1][0]).toBe(42);
        });
    });
    
    test("Subtraction", () => {
        return query("SELECT 14 - 28").then(r => {
            expect(r[1][0]).toBe(-14);
        });
    });
    
    test("Multiplication", () => {
        return query("SELECT 14 * 28").then(r => {
            expect(r[1][0]).toBe(14 * 28);
        });
    });
    
    test("Division", () => {
        return query("SELECT 14 / 28").then(r => {
            expect(r[1][0]).toBe(14 / 28);
        });
    });
});

describe("Strings", () => {
    test("Concat operator", () => {
        return query("SELECT 'Hello, ' || 'world!'").then(r => {
            expect(r[1][0]).toBe("Hello, world!");
        });
    });
});

describe("Functions", () => {
    test("WEEKDAY()", () => {
        return query("SELECT WEEKDAY(2)").then(r => {
            expect(r[1][0]).toBe("Tuesday");
        });
    });

    test("RAND()", () => {
        return query("SELECT RAND()").then(r => {
            expect(typeof r[1][0]).toBe("number");
        });
    });

    test("CONCAT()", () => {
        return query("SELECT CONCAT('fat', 'her')").then(r => {
            expect(r[1][0]).toBe("father");
        });
    });

    test("CHAR()", () => {
        return query("SELECT CHAR(65)").then(r => {
            expect(r[1][0]).toBe("A");
        });
    });

    test("UNICODE()", () => {
        return query("SELECT UNICODE('a')").then(r => {
            expect(r[1][0]).toBe(97);
        });
    });

    test("DATE()", () => {
        return query("SELECT DATE('2018-07-18T14:27:29')").then(r => {
            expect(r[1][0]).toBe("2018-07-18");
        });
    });

    test("TIME()", () => {
        return query("SELECT TIME('2018-07-18T14:27:29')").then(r => {
            expect(r[1][0]).toBe("14:27:29");
        });
    });

    test("DATETIME()", () => {
        return query("SELECT DATETIME('2018-07-18T14:27:29')").then(r => {
            expect(r[1][0]).toBe('2018-07-18 14:27:29');
        });
    });

    describe("EXTRACT()", () => {
        test("EXTRACT(MILLENNIUM)", () => {
            return query("SELECT EXTRACT(MILLENNIUM FROM '2018-07-18T14:27:29')").then(r=> {
                expect(r[1][0]).toBe(3);
            });
        });

        test("EXTRACT(HOUR)", () => {
            return query("SELECT EXTRACT(HOUR FROM '2018-07-18T14:27:29')").then(r=> {
                expect(r[1][0]).toBe(14);
            });
        });

        test("EXTRACT(DOW)", () => {
            return query("SELECT EXTRACT(DOW FROM '2018-07-18T14:27:29')").then(r=> {
                expect(r[1][0]).toBe(3);
            });
        });

        test("EXTRACT(DOY)", () => {
            return query("SELECT EXTRACT(DOY FROM '2018-07-18T14:27:29')").then(r=> {
                expect(r[1][0]).toBe(199);
            });
        });

        test("EXTRACT(WEEK)", () => {
            return query("SELECT EXTRACT(WEEK FROM '2018-07-18T14:27:29')").then(r=> {
                expect(r[1][0]).toBe(29);
            });
        });
    });

    describe("CAST()", () => {
        test("INT", () => {
            return query("SELECT CAST('42.547' AS INT)").then(r => {
                expect(r[1][0]).toBe(42);
            });
        });

        test("FLOAT", () => {
            return query("SELECT CAST('42.547' AS FLOAT)").then(r => {
                expect(r[1][0]).toBe(42.547);
            });
        });

        test("STRING", () => {
            return query("SELECT CAST(42.547 AS STRING)").then(r => {
                expect(r[1][0]).toBe("42.547");
            });
        });
    });
});

describe("Nested Functions", () => {
    test("Function -> Expression", () => {
        return query("SELECT WEEKDAY(5 - 1)").then(r => {
            expect(r[1][0]).toBe("Thursday");
        });
    });

    test("Function x2", () => {
        return query("SELECT CONCAT(WEEKDAY(3), ' ', CHAR(66), ' ', UNICODE('d'))").then(r => {
            expect(r[1][0]).toBe("Wednesday B 100");
        });
    });

    test("Function x4", () => {
        return query("SELECT CHAR(UNICODE(CHAR(UNICODE('i'))))").then(r => {
            expect(r[1][0]).toBe("i");
        });
    });

    test("(Function -> Expression) x2", () => {
        return query("SELECT CHAR(UNICODE(CHAR(UNICODE('2') * 2)) + 3)").then(r => {
            expect(r[1][0]).toBe("g");
        });
    });
});

describe("Logic Operators", () => {
    test("=", () => {
        return query("SELECT 4 = 4").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("!=", () => {
        return query("SELECT 4 != 4").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });

    test("<", () => {
        return query("SELECT 4 < 4").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });

    test(">", () => {
        return query("SELECT 4 > 4").then(r => {
            expect(r[1][0]).toBe(false);
        });
    });

    test("<=", () => {
        return query("SELECT 4 <= 4").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test(">", () => {
        return query("SELECT 4 >= 4").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("IS NULL", () => {
        return query("SELECT null IS NULL").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("IS NOT NULL", () => {
        return query("SELECT 42 IS NOT NULL").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("LIKE", () => {
        return query("SELECT 'hello' LIKE 'h?l%'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("NOT LIKE", () => {
        return query("SELECT 'goodbye' NOT LIKE 'h?l%'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("REGEXP", () => {
        return query("SELECT 'abcdef' REGEXP '[a-z]{6}'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });

    test("NOT REGEXP", () => {
        return query("SELECT 'abcdef' NOT REGEXP '^[0-9]+'").then(r => {
            expect(r[1][0]).toBe(true);
        });
    });
});