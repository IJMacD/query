require('fetch-everywhere');
require('dotenv').config();
const query = require('../query');

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
});