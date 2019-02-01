const demoQuery = require('../src/providers/demo');

test("UNION ALL", () => {
    return demoQuery("FROM Test UNION ALL FROM Test").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(20);
    });
});

test("UNION ALL multiple", () => {
    return demoQuery("FROM Test UNION ALL FROM Test UNION ALL FROM Test").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(30);
    });
});

test("UNION", () => {
    return demoQuery("FROM Test WHERE n < 3 UNION FROM Test WHERE n > 6").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(6);
    });
});

test("UNION removes duplicates", () => {
    return demoQuery("FROM Test WHERE n < 6 UNION FROM Test WHERE n > 3").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(10);
    });
});

test("INTERSECT", () => {
    return demoQuery("FROM Test WHERE n < 6 INTERSECT FROM Test WHERE n > 3").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(2);
    });
});

test("EXCEPT", () => {
    return demoQuery("FROM Test WHERE n < 6 EXCEPT FROM Test WHERE n > 3").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(4);
    });
});

test("DISTINCT", () => {
    return demoQuery("FROM Test SELECT DISTINCT n2").then(r => {
        // Remember header row
        expect(r.length - 1).toBe(5);
    });
});