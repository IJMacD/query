const Tokenizer = require("../src/tokenizer");
const Parser = require("../src/parser");

const { TOKEN_TYPES } = Tokenizer;

describe("Tokenizer", () => {
  test("SELECT list", () => {
    const tokens = Tokenizer.tokenize("SELECT a, b, c");
    expect(tokens).toEqual([
      {start: 0, type: TOKEN_TYPES.KEYWORD, value: "SELECT"},
      {start: 7, type: TOKEN_TYPES.NAME, value: "a"},
      {start: 8, type: TOKEN_TYPES.COMMA},
      {start: 10, type: TOKEN_TYPES.NAME, value: "b"},
      {start: 11, type: TOKEN_TYPES.COMMA},
      {start: 13, type: TOKEN_TYPES.NAME, value: "c"}
    ]);
  });

  test("expression", () => {
    const tokens = Tokenizer.tokenize("a + 1");
    expect(tokens).toEqual([
      {start: 0, type: TOKEN_TYPES.NAME, value: "a"},
      {start: 2, type: TOKEN_TYPES.OPERATOR, value: "+"},
      {start: 4, type: TOKEN_TYPES.NUMBER, value: "1"}
    ]);
  });

  test("expression with *", () => {
    const tokens = Tokenizer.tokenize("a * 1");
    expect(tokens).toEqual([
      {start: 0, type: TOKEN_TYPES.NAME, value: "a"},
      {start: 2, type: TOKEN_TYPES.OPERATOR, value: "*"},
      {start: 4, type: TOKEN_TYPES.NUMBER, value: "1"}
    ]);
  });

  test("SELECT *", () => {
    const tokens = Tokenizer.tokenize("SELECT *");
    expect(tokens).toEqual([
      {start: 0,  type: TOKEN_TYPES.KEYWORD, value: "SELECT"},
      {start: 7, type: TOKEN_TYPES.NAME, value: "*"},
    ]);
  });
});

describe("Parser", () => {
  test("SELECT list", () => {
    const source = "SELECT a, b, c";
    const ast = Parser.parse(source);

    expect(ast).toEqual({
      type: 1,
      id: null,
      children: [{
        type: 2,
        id: "SELECT",
        source,
        children: [
          { type: 4, id: "a", source: "a" },
          { type: 4, id: "b", source: "b" },
          { type: 4, id: "c", source: "c" },
        ]
      }]
    });
  });
});