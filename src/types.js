
const NODE_TYPES = {
    UNKNOWN: 0,
    STATEMENT: 1,
    CLAUSE: 2,
    FUNCTION_CALL: 3,
    SYMBOL: 4,
    STRING: 5,
    NUMBER: 6,
    OPERATOR: 7,
    LIST: 8,
    COMPOUND_QUERY: 9,
    CONSTANT: 10,
    PARAM: 11,
};

/**
* TOKENS
* @enum {number}
*/
const TOKEN_TYPES = {
   UNKNOWN: 0,
   BRACKET: 1,
   COMMA: 2,
   KEYWORD: 3,
   NAME: 4,
   STRING: 5,
   NUMBER: 6,
   OPERATOR: 7,
   QUERY_OPERATOR: 8,
   CONSTANT: 9,
   PARAM: 10,
};


module.exports = { NODE_TYPES, TOKEN_TYPES };