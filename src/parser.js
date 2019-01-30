const { TOKEN_TYPES } = require('./tokenizer');

 /**
  * @typedef Token
  * @prop {number} type
  * @prop {string} [value]
  * @prop {number} start
  */

  /**
   * @typedef {Token[] & { index: number, current: Token, next: Token }} TokenList
   */

 /**
  * @typedef Node
  * @prop {number} type
  * @prop {string|number} id
  * @prop {string} [alias]
  * @prop {boolean} [inner]
  * @prop {Node} [predicate]
  * @prop {Node[]} [children]
  * @prop {string} [source]
  * @prop {Node} [over]
  * @prop {Node} [order]
  * @prop {boolean} [desc]
  * @prop {boolean} [distinct]
  */

const NODE_TYPES = {
    UNKNOWN: 0,
    STATEMENT: 1,
    CLAUSE: 2,
    FUNCTION_CALL: 3,
    SYMBOL: 4,
    STRING: 5,
    NUMBER: 6,
    OPERATOR: 7,
};

module.exports = {
    /**
     * @param {Token[]} tokenList
     * @param {string} source
     * @returns {Node}
     */
    parse (tokenList, source="") {
        let i = 0;

        function peek (type, value=undefined) {
            const current = tokenList[i];

            if (!current) {
                return false;
            }

            if ((type !== current.type) || (typeof value != "undefined" && value !== current.value)) {
                return false;
            }

            return true;
        }

        function expect (type, value=undefined) {
            const current = tokenList[i];

            const expected = `token[${type}${typeof value !== "undefined" ? ` '${value}'`: ""}]`;

            if (!current) {
                throw new Error(`ParseError: Expected ${expected} but ran out of tokens.`);
            }

            if ((type !== current.type) && (typeof value != "undefined" && value !== current.value)) {
                throw new Error(`ParseError: Expected ${expected} got token[${current.type} '${current.value}']`);
            }

            return tokenList[i++];
        }

        function current () {
            return tokenList[i];
        }

        function next () {
            return tokenList[i++];
        }

        /**
         * @returns {Node}
         */
        function descend () {
            /** @type {Node} */
            let out = {};
            const t = current();
            let next_token;

            switch (t.type) {
                case TOKEN_TYPES.KEYWORD:
                    next();

                    out.type = NODE_TYPES.CLAUSE;
                    out.id = t.value;
                    out.children = [];

                    if (peek(TOKEN_TYPES.KEYWORD, "DISTINCT")) {
                        next();
                        out.distinct = true;
                    }

                    while (i < tokenList.length && current().type !== TOKEN_TYPES.BRACKET) {
                        appendChild(out.children, descend());

                        if (peek(TOKEN_TYPES.KEYWORD, "OVER")) {
                            next();

                            const child = out.children[out.children.length - 1];
                            child.over = { type: NODE_TYPES.NUMBER, id: 1 };

                            expect(TOKEN_TYPES.BRACKET, "(");

                            if (peek(TOKEN_TYPES.KEYWORD, "PARTITION BY")) {
                                next();

                                child.over = descendExpression();
                            }


                            if (peek(TOKEN_TYPES.KEYWORD, "ORDER BY")) {
                                next();

                                child.order = descendExpression();
                            }

                            expect(TOKEN_TYPES.BRACKET, ")");
                        }

                        if (peek(TOKEN_TYPES.KEYWORD, "AS")) {
                            next();

                            next_token = expect(TOKEN_TYPES.NAME);

                            const child = out.children[out.children.length - 1];
                            child.alias = next_token.value;
                            child.source += ` AS ${next_token.value}`;
                        }

                        if (peek(TOKEN_TYPES.KEYWORD, "ON")) {
                            next();

                            const child = out.children[out.children.length - 1];
                            child.predicate = descendExpression();
                            child.source += ` ON ${child.predicate.source}`;

                        } else if (peek(TOKEN_TYPES.KEYWORD, "USING")) {
                            next();

                            const child = out.children[out.children.length - 1];
                            child.predicate = descend();
                            child.source += ` USING ${child.predicate.source}`;

                        } else if (peek(TOKEN_TYPES.KEYWORD, "INNER")) {
                            next();

                            const child = out.children[out.children.length - 1];
                            child.inner = true;
                        }

                        if (peek(TOKEN_TYPES.COMMA)) {
                            next();
                        }
                    }

                    next_token = current();
                    out.source = source.substring(t.start, next_token && next_token.start).trim();

                    return out;
                case TOKEN_TYPES.NAME:
                    next();
                    if (peek(TOKEN_TYPES.BRACKET, "(")) {
                        next();

                        out.type = NODE_TYPES.FUNCTION_CALL;
                        out.id = t.value;
                        out.children = [];

                        if (peek(TOKEN_TYPES.KEYWORD, "DISTINCT")) {
                            next();

                            out.distinct = true;
                        }

                        while (i < tokenList.length && current().type !== TOKEN_TYPES.BRACKET) {
                            appendChild(out.children, descend());

                            next_token = current();
                            if (!next_token) {
                                throw new Error("Unexpected end");
                            }

                            if (peek(TOKEN_TYPES.COMMA)) {
                                next();
                            } else if (peek(TOKEN_TYPES.KEYWORD)) {
                                next();
                                next_token = current();

                                // This is special treatment for `EXTRACT(x FROM y)` or `CAST(x AS y)`
                                if (next_token.type === TOKEN_TYPES.NAME ||
                                    next_token.type === TOKEN_TYPES.STRING ||
                                    next_token.type === TOKEN_TYPES.NUMBER ||
                                    next_token.type === TOKEN_TYPES.OPERATOR
                                ) {
                                    appendChild(out.children, descend());
                                } else {
                                    throw new Error(`ParseError: Unexpected token type ${next_token.type}`);
                                }
                            }
                        }

                        if (out.id === "EXTRACT") {
                            const extractPart = out.children[0];
                            if (extractPart) extractPart.type = NODE_TYPES.KEYWORD;
                        } else if (out.id === "CAST") {
                            const castType = out.children[1];
                            if (castType) castType.type = NODE_TYPES.KEYWORD;
                        }

                        expect(TOKEN_TYPES.BRACKET, ")");
                        next_token = current();

                        out.source = source.substring(t.start, next_token && next_token.start).trim();

                        return out;
                    }

                    return { type: NODE_TYPES.SYMBOL, id: t.value, source: t.value };
                case TOKEN_TYPES.STRING:
                    next();
                    return { type: NODE_TYPES.STRING, id: t.value, source: `'${t.value}'` };
                case TOKEN_TYPES.NUMBER:
                    next();
                    return { type: NODE_TYPES.NUMBER, id: +t.value, source: t.value };
                case TOKEN_TYPES.OPERATOR:
                    next();
                    out = { type: NODE_TYPES.OPERATOR, id: t.value, children: [], source: "" };

                    if (t.value === "*") {
                        next_token = current();
                        if (!next_token ||
                            next_token.type === TOKEN_TYPES.COMMA ||
                            next_token.type === TOKEN_TYPES.KEYWORD ||
                            next_token.type === TOKEN_TYPES.BRACKET)
                        {
                            // This is not an operator i.e. `SELECT *`
                            return { type: NODE_TYPES.SYMBOL, id: "*", source: "*" };
                        }
                    }

                    // Unary operators

                    // Unary prefix
                    if (t.value === "NOT") {
                        out.children[0] = descend();
                    }
                    else
                    // Unary postfix
                    if (t.value !== "IS NULL" &&
                        t.value !== "IS NOT NULL")
                    {
                        out.children[1] = descend();
                    }

                    next_token = current();
                    out.source = source.substring(t.start, next_token && next_token.start).trim();

                    return out;
                case TOKEN_TYPES.COMMA:
                    throw new Error(`ParseError: Unexpected comma at ${t.start}`);
                default:
                    throw new Error("ParseError: Only able to parse some tokens. Got token type " + t.type);
            }
        }

        function descendExpression () {

            let node = descend();

            while (i < tokenList.length && peek(TOKEN_TYPES.OPERATOR)) {
                const arr = [node];
                appendChild(arr, descend());
                // Haha I've just invented the double pointer in javascript
                node = arr[0];
            }

            return node;

        }

        return descendExpression();
    },

    NODE_TYPES,
}

/**
 * Normally adds the node to the end of the child array.
 * However, in the case of an operator it will pop the previous
 * node and add it as a child of this operator.
 * @param {Node[]} array
 * @param {Node} node
 */
function appendChild (array, node) {
    if (node.type === NODE_TYPES.OPERATOR &&
        node.id !== "NOT") // unary prefix operator
    {
        const prev = array[array.length-1];

        if (prev && prev.type === NODE_TYPES.OPERATOR &&
            getPrecedence(prev) < getPrecedence(node)
        ) {
            // apply operator precedence
            appendChild(prev.children, node);
            return;
        }

        node.children[0] = array.pop();
        node.source = `${node.children[0].source} ${node.source}`;
    }
    array.push(node);
}

/**
 * Get operator precedence
 * @param {Node} node
 */
function getPrecedence (node) {
    switch (node.id) {
        case "AND":
            return 0;
        case ">":
        case "<":
        case "=":
        case "!=":
        case "<=":
        case ">=":
            return 1;
        case "+":
        case "-":
            return 2;
        case "*":
        case "/":
            return 3;
        case "LIKE":
        case "NOT LIKE":
        case "REGEXP":
        case "NOT REGEXP":
            return 4;
        default:
            return 100;
    }
}

/**
 *
 * @param {Node} node
 * @returns {boolean}
 */
function isExpression (node) {
    return (
        node.type === NODE_TYPES.FUNCTION_CALL ||
        node.type === NODE_TYPES.SYMBOL ||
        node.type === NODE_TYPES.NUMBER ||
        node.type === NODE_TYPES.STRING ||
        node.type === NODE_TYPES.OPERATOR
    );
}

/**
 * @param {Token[]} tokens
 * @returns {TokenList}
 */
function makeTokenList (tokens) {
    Object.defineProperties(tokens, {
        index: {
            value: 0,
            writable: true,
        },
        current: {
            get () {
                return this[this.index];
            }
        },
        next: {
            get () {
                return this[++this.index];
            }
        },
    });
    // @ts-ignore
    return tokens;
}

/**
 *
 * @param {TokenList} tokens
 */
function parseClause (tokens) {
    const token = tokens.current;
    if (!token || token.type != TOKEN_TYPES.KEYWORD) return null;

    switch (token.value) {
        case 'AS':
        case 'USING':
        case 'ON':
            return null;
    }

    const node = makeNode(NODE_TYPES.CLAUSE, token.value);

    if (node.id === "FROM") {
        let next;
        while((next = tokens.next) != null && next.type !== TOKEN_TYPES.KEYWORD) {

        }
    }
}
function parseName (tokens) {

}
function parseOperator (tokens) {

}
function parseExpression (tokens) {

}
function parseAlias (tokens) {

}
function parseJoin (tokens) {

}
function makeNode (type, id=null) {
    return {
        type,
        id,
        children: [],
        source: ""
    };
}