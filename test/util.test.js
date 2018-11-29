const { matchInBrackets } = require('../src/util');

describe("matchInBrackets", () => {
  test("Single bracket pair", () => {
    expect(matchInBrackets("(hello)")).toBe("hello");
  });

  test("Double bracket pair", () => {
    expect(matchInBrackets("((hello))")).toBe("(hello)");
  });

  test("Sibling bracket pairs", () => {
    expect(matchInBrackets("(hello)(goodbye)")).toBe("hello");
  });

  test("Nested sibling bracket pairs", () => {
    expect(matchInBrackets("((hello)(goodbye))")).toBe("(hello)(goodbye)");
  });
});