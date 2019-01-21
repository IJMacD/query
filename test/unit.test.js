const Tokenizer = require("../src/tokenizer");
const Parser = require("../src/parser");

describe("Tokenizer", () => {
  test("SELECT list", () => {
    const tokens = Tokenizer.tokenize("SELECT a, b, c");
    expect(tokens).toEqual([
      {start: 0, type: 3, value: "SELECT"},
      {start: 7, type: 4, value: "a"},
      {start: 8, type: 2},
      {start: 10, type: 4, value: "b"},
      {start: 11, type: 2},
      {start: 13, type: 4, value: "c"}
    ]);
  });
});

describe("Parser", () => {
  test("SELECT list", () => {
    const source = "SELECT a, b, c";
    const tokens = Tokenizer.tokenize(source);
    const ast = Parser.parse(tokens, source);

    expect(ast).toEqual({
      type: 2,
      id: "SELECT",
      source,
      children: [
        { type: 4, id: "a", source: "a" },
        { type: 4, id: "b", source: "b" },
        { type: 4, id: "c", source: "c" },
      ]
    });
  });
});