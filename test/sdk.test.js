require('fetch-everywhere');
require('dotenv').config();

const query = require('../src/query');

describe("Simple Queries", () => {
    test("Tutor Query", () => {
        return query("FROM Tutor");
    });

    test("Room Query", () => {
        return query("FROM Room");
    });

    test("Term Query", () => {
        return query("FROM Term");
    });

    test("Lesson Query", () => {
        return query("FROM Lesson");
    }, 60000);
});

describe("Simple Joins", () => {
    test("Lesson, Tutor JOIN", () => {
        return query("FROM Lesson, Tutor");
    }, 60000);

    test("Lesson, Room JOIN", () => {
        return query("FROM Lesson, Room");
    }, 60000);

    test("Lesson, Tutor JOIN with SELECT", () => {
        return query("FROM Lesson, Tutor SELECT start,name").then(r => {
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
        });
    }, 60000);

    test("Lesson, Tutor, Room JOIN with Qualified SELECT", () => {
        return query("FROM Lesson, Tutor, Room SELECT Lesson.start, Tutor.name, Room.name").then(r => {
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
            expect(r[1][2]).not.toBeNull();
        });
    }, 60000);

    test("Lesson, Tutor, Room JOIN with Aliased SELECT", () => {
        return query("FROM Lesson AS l, Tutor AS t, Room AS r SELECT l.start, t.name, r.name").then(r => {
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
            expect(r[1][2]).not.toBeNull();
        });
    }, 60000);

    test("Lesson, Tutor JOIN with Aliased SELECT", () => {
        return query("FROM Lesson AS l, Tutor AS t1, Tutor AS t2 USING course.tutor SELECT l.start, t1.name, t2.name").then(r => {
            expect(r[1][0]).toBeInstanceOf(Date);
            expect(r[1][1]).not.toBeNull();
            expect(r[1][2]).not.toBeNull();
        });
    }, 60000);
});