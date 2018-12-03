require('fetch-everywhere');
require('dotenv').config();

const query = require('../src/query');

describe("Tutor Queries", () => {
    test("Simple Tutor Query", () => {
        return query("FROM Tutor").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    });

    test("Tutor Query by id", () => {
        return query("FROM Tutor WHERE id = 9").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe("9");
            expect(r[1][1]).toBe('Kemmiss Pun');
        });
    });

    test("Tutor Query by name", () => {
        return query("FROM Tutor WHERE name = 'Iain MacDonald'").then(r => {
            expect(r.length - 1).toBe(1);
            expect(r[1][0]).toBe("3967");
            expect(r[1][1]).toBe('Iain MacDonald');
        });
    });
});

test("Room Query", () => {
    return query("FROM Room").then(r => {
        expect(r.length - 1).toBeGreaterThan(0);
    });
});

test("Term Query", () => {
    return query("FROM Term").then(r => {
        expect(r.length - 1).toBeGreaterThan(0);
    });
});

describe("Lesson Queries", () => {
    test("Simple all", () => {
        return query("FROM Lesson").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("With start date", () => {
        return query("FROM Lesson WHERE start > '2018-12-01'").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("With start between", () => {
        return query("FROM Lesson WHERE start > '2018-12-01' AND start < '2018-12-03' GROUP BY DATE(start)").then(r => {
            expect(r.length - 1).toBe(2);
        });
    }, 60000);

    test("With start and end", () => {
        return query("FROM Lesson WHERE start > '2018-12-01' AND end < '2018-12-03' GROUP BY DATE(start)").then(r => {
            expect(r.length - 1).toBe(2);
        });
    }, 60000);

    test("With tutor id", () => {
        return query("FROM Lesson WHERE start > '2018-12-01' AND tutor.id = 9").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("With tutor name", () => {
        return query("FROM Lesson WHERE start > '2018-12-01' AND tutor.name = 'Kemmiss Pun'").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);
});

describe("Course Queries", () => {
    test("by id", () => {
        return query("FROM Course WHERE id = 8820").then(r => {
            expect(r.length - 1).toBe(1);
        });
    }, 60000);

    test("by title", () => {
        return query("FROM Course WHERE title = 'Love to Write'").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("by tutor id", () => {
        return query("FROM Course WHERE tutor.id = 9").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("by tutor name", () => {
        return query("FROM Course WHERE tutor.name = 'Kemmiss Pun'").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);
});

describe("Simple Joins", () => {
    test("Lesson, Tutor JOIN", () => {
        return query("FROM Lesson, Tutor").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Lesson, Room JOIN", () => {
        return query("FROM Lesson, Room").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Lesson, Course JOIN", () => {
        return query("FROM Lesson, Course").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Lesson, Course JOIN", () => {
        return query("FROM Lesson, Course").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Room, Lesson JOIN", () => {
        return query("FROM Room, Lesson").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Room, Centre JOIN", () => {
        return query("FROM Room, Centre").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Centre, Room JOIN", () => {
        return query("FROM Centre, Room").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Centre, Lesson JOIN", () => {
        return query("FROM Centre, Lesson").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Lesson, Centre JOIN", () => {
        return query("FROM Lesson, Centre").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Lesson, Attendee JOIN", () => {
        return query("FROM Lesson, Attendee").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Lesson, Attendee, Student JOIN", () => {
        return query("FROM Lesson, Attendee, Student").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
        });
    }, 60000);

    test("Lesson, Tutor JOIN with SELECT", () => {
        return query("FROM Lesson, Tutor SELECT start,name").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
        });
    }, 60000);

    test("Lesson, Tutor, Room JOIN with Qualified SELECT", () => {
        return query("FROM Lesson, Tutor, Room SELECT Lesson.start, Tutor.name, Room.name").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
            expect(r[1][2]).not.toBeNull();
        });
    }, 60000);

    test("Lesson, Tutor, Room JOIN with Aliased SELECT", () => {
        return query("FROM Lesson AS l, Tutor AS t, Room AS r SELECT l.start, t.name, r.name").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
            expect(r[1][2]).not.toBeNull();
        });
    }, 60000);

    test("Lesson, Tutor JOIN with Aliased SELECT", () => {
        return query("FROM Lesson AS l, Tutor AS t1, Tutor AS t2 USING course.tutor SELECT l.start, t1.name, t2.name").then(r => {
            expect(r.length - 1).toBeGreaterThan(0);
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
            expect(r[1][2]).not.toBeNull();
        });
    }, 60000);
});