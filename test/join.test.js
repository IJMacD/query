const demoQuery = require('./demoQuery');

test("JOIN on object", () => {
  return demoQuery("FROM Test_3, O").then(r => {
    // Don't forget header row
    expect(r.length - 1).toBe(10);
    expect(r[1][0]).toBe('A');
    expect(r[1][1]).toBe(-1);
    expect(r[2][0]).toBe('B');
    expect(r[2][1]).toBe(-2);
  });
});

test("SELECT columns FROM JOIN on object", () => {
  return demoQuery("FROM Test_3, O SELECT n, c").then(r => {
    // Don't forget header row
    expect(r.length - 1).toBe(10);
    expect(r[1][0]).toBe(-1);
    expect(r[1][1]).toBe('A');
    expect(r[2][0]).toBe(-2);
    expect(r[2][1]).toBe('B');
  });
});

test("JOIN on array", () => {
  return demoQuery("FROM Test_4, A").then(r => {
    // Don't forget header row
    expect(r.length - 1).toBe(20);
    expect(r[1][0]).toBe('K');
    expect(r[1][1]).toBe(-1);
    expect(r[2][0]).toBe('K');
    expect(r[2][1]).toBe(-11);
    expect(r[3][0]).toBe('L');
    expect(r[3][1]).toBe(-2);
    expect(r[4][0]).toBe('L');
    expect(r[4][1]).toBe(-12);
    expect(r[5][0]).toBe('L');
    expect(r[5][1]).toBe(-13);
    expect(r[6][0]).toBe('N');
    expect(r[6][1]).toBe(-3);
  });
});

test("SELECT columns JOIN on array", () => {
  return demoQuery("FROM Test_4, A SELECT n, c").then(r => {
    // Don't forget header row
    expect(r.length - 1).toBe(20);
    expect(r[1][0]).toBe(-1);
    expect(r[1][1]).toBe('K');
    expect(r[2][0]).toBe(-11);
    expect(r[2][1]).toBe('K');
    expect(r[3][0]).toBe(-2);
    expect(r[3][1]).toBe('L');
    expect(r[4][0]).toBe(-12);
    expect(r[4][1]).toBe('L');
    expect(r[5][0]).toBe(-13);
    expect(r[5][1]).toBe('L');
    expect(r[6][0]).toBe(-3);
    expect(r[6][1]).toBe('N');
  });
});

test("Explicit INNER JOIN on array", () => {
  return demoQuery("FROM Test_4, A INNER SELECT n, c").then(r => {
    // Don't forget header row
    expect(r.length - 1).toBe(20);
    expect(r[1][0]).toBe(-1);
    expect(r[1][1]).toBe('K');
    expect(r[2][0]).toBe(-11);
    expect(r[2][1]).toBe('K');
    expect(r[3][0]).toBe(-2);
    expect(r[3][1]).toBe('L');
    expect(r[4][0]).toBe(-12);
    expect(r[4][1]).toBe('L');
    expect(r[5][0]).toBe(-13);
    expect(r[5][1]).toBe('L');
    expect(r[6][0]).toBe(-3);
    expect(r[6][1]).toBe('N');
  });
});

test("LEFT JOIN on array", () => {
  return demoQuery("FROM Test_4, A LEFT SELECT n, c").then(r => {
    // Don't forget header row
    expect(r.length - 1).toBe(22);
    expect(r[1][0]).toBe(-1);
    expect(r[1][1]).toBe('K');
    expect(r[2][0]).toBe(-11);
    expect(r[2][1]).toBe('K');
    expect(r[3][0]).toBe(-2);
    expect(r[3][1]).toBe('L');
    expect(r[4][0]).toBe(-12);
    expect(r[4][1]).toBe('L');
    expect(r[5][0]).toBe(-13);
    expect(r[5][1]).toBe('L');
    expect(r[6][0]).toBeNull();
    expect(r[6][1]).toBe('M');
    expect(r[7][0]).toBe(-3);
    expect(r[7][1]).toBe('N');
  });
});

test("CROSS JOIN", () => {
  return demoQuery("FROM Test, Test_2 SELECT n,c").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(100);

      // Check all columns have been selected
      expect(r[1].length).toBe(2);

      // Check the values are the cartesian product
      expect(r[1][0]).toBe(0);
      expect(r[1][1]).toBe('f');

      expect(r[2][0]).toBe(0);
      expect(r[2][1]).toBe('g');

      expect(r[11][0]).toBe(1);
      expect(r[11][1]).toBe('f');

      expect(r[12][0]).toBe(1);
      expect(r[12][1]).toBe('g');
  });
});

test("CROSS JOIN Explicit Columns", () => {
  return demoQuery("FROM Test, Test_2 SELECT c,n").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(100);
      expect(r[1].length).toBe(2);
      expect(r[1][0]).toBe('f');
      expect(r[1][1]).toBe(0);
  });
});

test("CROSS JOIN Resolved Columns", () => {
  return demoQuery("FROM Test, Test_2 SELECT Test_2.c,Test.n").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(100);
      expect(r[1].length).toBe(2);
      expect(r[1][0]).toBe('f');
      expect(r[1][1]).toBe(0);
  });
});

test("CROSS JOIN Aliased Columns", () => {
  return demoQuery("FROM Test AS t1, Test_2 AS t2 SELECT t2.c,t1.n").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(100);
      expect(r[1].length).toBe(2);
      expect(r[1][0]).toBe('f');
      expect(r[1][1]).toBe(0);
  });
});

test("Self CROSS JOIN", () => {
  return demoQuery("FROM Test, Test").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(100);
  });
});

test("Filtered Self CROSS JOIN", () => {
  return demoQuery("FROM Test AS a, Test AS b WHERE a.n != b.n").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(90);
  });
});

test("Invariant Filtered Self CROSS JOIN", () => {
  return demoQuery("FROM Test AS a, Test AS b WHERE a.n < b.n").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(45);
  });
});

test("Expression Filtered Self CROSS JOIN", () => {
    return demoQuery("FROM Test AS a, Test AS b WHERE a.n + b.n = 3").then(r => {
        // Don't forget header row
        expect(r.length - 1).toBe(4);
    });
});

test("Expression Predicate Self CROSS JOIN", () => {
  return demoQuery("FROM Test AS a, Test AS b ON a.n + 1 = b.n").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(9);
  });
});

test("Expression Access Predicate Self CROSS JOIN", () => {
  return demoQuery("FROM Test AS a, Test AS b ON a.n + b.n = 3").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(4);
  });
});

test("Self CROSS JOIN misaligned", () => {
  return demoQuery("FROM Test AS a, Test AS b ON a.n = b.n2").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(10);
  });
});

test("Multiple JOINs", () => {
  return demoQuery("FROM Test AS a, Test AS b ON a.n3 = b.n3, Test").then(r => {
      // Don't forget header row
      expect(r.length - 1).toBe(280);
  });
});
