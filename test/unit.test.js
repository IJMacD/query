const Tokenizer = require("../src/tokenizer");
const Parser = require("../src/parser");

const { TOKEN_TYPES } = Tokenizer;
const { NODE_TYPES } = Parser;

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

  test("FROM Test AS a, Test AS b SELECT a.n, b.n", () => {
    const tokens = Tokenizer.tokenize("FROM Test AS a, Test AS b SELECT a.n, b.n");
    expect(tokens).toEqual([
      { start: 0,  type: TOKEN_TYPES.KEYWORD, value: "FROM" },
      { start: 5,  type: TOKEN_TYPES.NAME,    value: "Test" },
      { start: 10, type: TOKEN_TYPES.KEYWORD, value: "AS" },
      { start: 13, type: TOKEN_TYPES.NAME,    value: "a" },
      { start: 14, type: TOKEN_TYPES.COMMA },
      { start: 16, type: TOKEN_TYPES.NAME,    value: "Test" },
      { start: 21, type: TOKEN_TYPES.KEYWORD, value: "AS" },
      { start: 24, type: TOKEN_TYPES.NAME,    value: "b" },
      { start: 26, type: TOKEN_TYPES.KEYWORD, value: "SELECT" },
      { start: 33, type: TOKEN_TYPES.NAME,    value: "a.n" },
      { start: 36, type: TOKEN_TYPES.COMMA },
      { start: 38, type: TOKEN_TYPES.NAME,    value: "b.n" },
    ])
  })
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

  test("SELECT expression", () => {
    const source = "SELECT 1 + 2";
    const ast = Parser.parse(source);

    expect(ast).toEqual({
      type: NODE_TYPES.STATEMENT,
      id: null,
      children: [{
        type: NODE_TYPES.CLAUSE,
        id: "SELECT",
        source,
        children: [
          {
            type: NODE_TYPES.OPERATOR,
            id: "+",
            source: "1 + 2",
            children: [
              { type: NODE_TYPES.NUMBER, id: 1, source: "1" },
              { type: NODE_TYPES.NUMBER, id: 2, source: "2" },
            ]
          }
        ]
      }]
    });
  });

  test("SELECT expression in function call", () => {
    const source = "SELECT RANGE(1 + 2)";
    const ast = Parser.parse(source);

    expect(ast).toEqual({
      type: NODE_TYPES.STATEMENT,
      id: null,
      children: [{
        type: NODE_TYPES.CLAUSE,
        id: "SELECT",
        source,
        children: [
          {
            type: NODE_TYPES.FUNCTION_CALL,
            id: "RANGE",
            source: "RANGE(1 + 2)",
            children: [{
              type: NODE_TYPES.OPERATOR,
              id: "+",
              source: "1 + 2",
              children: [
                { type: NODE_TYPES.NUMBER, id: 1, source: "1" },
                { type: NODE_TYPES.NUMBER, id: 2, source: "2" },
              ]
            }]
          }
        ]
      }]
    });
  });

  test("FROM Test AS a, Test AS b SELECT a.n, b.n", () => {
    const source = "FROM Test AS a, Test AS b SELECT a.n, b.n";
    const ast = Parser.parse(source);

    expect(ast).toEqual({
      type: NODE_TYPES.STATEMENT,
      id: null,
      children: [{
        type: NODE_TYPES.CLAUSE,
        id: "FROM",
        source: source.substr(0,25),
        children: [
          { type: NODE_TYPES.SYMBOL, id: "Test", alias: "a", source: "Test AS a" },
          { type: NODE_TYPES.SYMBOL, id: "Test", alias: "b", source: "Test AS b" },
        ]
      },{
        type: NODE_TYPES.CLAUSE,
        id: "SELECT",
        source: source.substr(26),
        children: [
          { type: NODE_TYPES.SYMBOL, id: "a.n", source: "a.n" },
          { type: NODE_TYPES.SYMBOL, id: "b.n", source: "b.n" },
        ]
      }]
    });
  });
});