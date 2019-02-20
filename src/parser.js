const { tokenize, TOKEN_TYPES } = require('./tokenizer');

/** @typedef {import('../types').Token} Token */
/** @typedef {import('../types').Node} Node */
/** @typedef {import('../types').WindowSpec} WindowSpec */

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

    parse,

    parseString (sql) {
        return parse(tokenize(sql), sql);
    },

    NODE_TYPES,
}

/**
 * @param {Token[]} tokenList
 * @param {string} source
 * @returns {Node}
 */
function parse (tokenList, source="") {
    let i = 0;

    /**
     * Peek ahead but don't consume the next token
     * @param {number} type
     * @param {string} value
     * @returns {boolean}
     */
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

    /**
     * Check if the next token matches the provided type
     * and consume if so.
     * @param {number} type
     * @param {string} value
     * @returns {boolean}
     */
    function suspect (type, value=undefined) {
        if (peek(type, value)) {

            // If we're returning true, move to next token automatically
            next();

            return true;
        }

        return false;
    }

    /**
     * Consume and return a specific type. If the next token
     * is not exactly as expected this frunction throws.
     * @param {number} type
     * @param {string} value
     * @returns {Token}
     */
    function expect (type, value=undefined) {
        const current = tokenList[i];

        const expected = () => `token[${type}${typeof value !== "undefined" ? ` '${value}'`: ""}]`;

        if (!current) {
            throw new Error(`ParseError: Expected ${expected()} but ran out of tokens.`);
        }

        if ((type !== current.type) && (typeof value != "undefined" && value !== current.value)) {
            throw new Error(`ParseError: Expected ${expected()} got token[${current.type} '${current.value}']`);
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

                if (t.value === "WINDOW") {
                    while (i < tokenList.length) {
                        const id = expect(TOKEN_TYPES.NAME).value;

                        /** @type {Node} */
                        const child = { type: NODE_TYPES.SYMBOL, id };

                        expect(TOKEN_TYPES.KEYWORD, "AS");
                        expect(TOKEN_TYPES.BRACKET, "(");

                        child.window = descendWindow();

                        expect(TOKEN_TYPES.BRACKET, ")");

                        out.children.push(child);

                        suspect(TOKEN_TYPES.COMMA);
                    }
                    return out;
                }

                if (suspect(TOKEN_TYPES.KEYWORD, "DISTINCT")) {
                    out.distinct = true;
                }

                // TODO: Why are we avoiding brackets here?
                while (i < tokenList.length && current().type !== TOKEN_TYPES.BRACKET) {

                    // Consume each item in the list following the keyword
                    const child = appendChild(out, descend());

                    if (suspect(TOKEN_TYPES.KEYWORD, "AS")) {
                        next_token = expect(TOKEN_TYPES.NAME);

                        child.alias = next_token.value;
                        child.source += ` AS ${next_token.value}`;
                    }

                    if (suspect(TOKEN_TYPES.KEYWORD, "ON")) {
                        child.predicate = descendExpression();
                        child.source += ` ON ${child.predicate.source}`;

                    } else if (suspect(TOKEN_TYPES.KEYWORD, "USING")) {
                        child.predicate = descend();
                        child.source += ` USING ${child.predicate.source}`;

                    } else if (suspect(TOKEN_TYPES.KEYWORD, "INNER")) {
                        child.inner = true;
                    }

                    suspect(TOKEN_TYPES.COMMA);
                }

                next_token = current();
                out.source = source.substring(t.start, next_token && next_token.start).trim();

                return out;
            case TOKEN_TYPES.NAME:
                next();

                if (suspect(TOKEN_TYPES.BRACKET, "(")) {
                    // Open bracket signifies a function call

                    out.type = NODE_TYPES.FUNCTION_CALL;
                    out.id = t.value;
                    out.children = [];

                    if (suspect(TOKEN_TYPES.KEYWORD, "DISTINCT")) {
                        out.distinct = true;
                    }

                    while (i < tokenList.length && current().type !== TOKEN_TYPES.BRACKET) {

                        // Loop through adding each paramater
                        appendChild(out, descend());

                        // Consume a comma if needed
                        suspect(TOKEN_TYPES.COMMA);

                        // This is special treatment for `EXTRACT(x FROM y)` or `CAST(x AS y)`
                        // They can be treated like a comma.
                        suspect(TOKEN_TYPES.KEYWORD, "FROM");
                        suspect(TOKEN_TYPES.KEYWORD, "AS");
                    }

                    // More special treatment
                    //
                    // These functions always use keywords as one of their parameters.
                    // To save adding them all to the tokenizer we manually tweak them here
                    if (out.id === "EXTRACT") {
                        const extractPart = out.children[0];
                        if (extractPart) extractPart.type = NODE_TYPES.KEYWORD;
                    } else if (out.id === "CAST") {
                        const castType = out.children[1];
                        if (castType) castType.type = NODE_TYPES.KEYWORD;
                    } else if (out.id === "DATEADD") {
                        const datePart = out.children[0];
                        if (datePart) datePart.type = NODE_TYPES.KEYWORD;
                    }

                    expect(TOKEN_TYPES.BRACKET, ")");

                    if (suspect(TOKEN_TYPES.KEYWORD, "FILTER")) {

                        expect(TOKEN_TYPES.BRACKET, "(");

                        expect(TOKEN_TYPES.KEYWORD, "WHERE");

                        out.filter = descendExpression();

                        expect(TOKEN_TYPES.BRACKET, ")");
                    }

                    if (suspect(TOKEN_TYPES.KEYWORD, "WITHIN GROUP")) {

                        expect(TOKEN_TYPES.BRACKET, "(");

                        expect(TOKEN_TYPES.KEYWORD, "ORDER BY");

                        out.order = descendOrder();

                        expect(TOKEN_TYPES.BRACKET, ")");
                    }

                    if (suspect(TOKEN_TYPES.KEYWORD, "OVER")) {

                        expect(TOKEN_TYPES.BRACKET, "(");

                        if (peek(TOKEN_TYPES.NAME)) {
                            out.window = next().value;
                        }
                        else {
                            out.window = descendWindow();
                        }

                        expect(TOKEN_TYPES.BRACKET, ")");
                    }

                    out.source = source.substring(t.start, current() && current().start).trim();

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

        // We use a dummy node so that appendChild() has a place to put back
        // the topmost node of an expression tree after each loop.
        // When we're finished looping we can extract the child
        const dummyNode = { type: NODE_TYPES.UNKNOWN, id: null, children: [ node ] };

        while (i < tokenList.length && peek(TOKEN_TYPES.OPERATOR)) {
            appendChild(dummyNode, descend());
        }

        // Haha I've just invented the double pointer in javascript
        return dummyNode.children[0];

    }

    /**
     * @returns {Node}
     */
    function descendOrder () {
        const out = descendExpression();

        if (suspect(TOKEN_TYPES.KEYWORD, "DESC")) {
            out.desc = true;
        } else {
            // We can just skip over ASC
            suspect(TOKEN_TYPES.KEYWORD, "ASC");
        }

        return out;
    }

    /**
     * @returns {WindowSpec}
     */
    function descendWindow() {
        /** @type {WindowSpec} */
        const window = {};

        if (suspect(TOKEN_TYPES.KEYWORD, "PARTITION BY")) {
            window.partition = descendExpression();
        }

        if (suspect(TOKEN_TYPES.KEYWORD, "ORDER BY")) {
            window.order = descendOrder();
        }

        if (peek(TOKEN_TYPES.KEYWORD, "ROWS") ||
            peek(TOKEN_TYPES.KEYWORD, "RANGE") ||
            peek(TOKEN_TYPES.KEYWORD, "GROUPS")
        ) {
            // @ts-ignore
            window.frameUnit = next().value.toLowerCase();

            expect(TOKEN_TYPES.OPERATOR, "BETWEEN");

            if (suspect(TOKEN_TYPES.KEYWORD, "UNBOUNDED")) {
                window.preceding = Number.POSITIVE_INFINITY;
                expect(TOKEN_TYPES.KEYWORD, "PRECEDING");

            } else if (suspect(TOKEN_TYPES.KEYWORD, "CURRENT ROW")) {
                window.preceding = 0;

            } else {
                window.preceding = +expect(TOKEN_TYPES.NUMBER).value;
                expect(TOKEN_TYPES.KEYWORD, "PRECEDING");
            }

            expect(TOKEN_TYPES.OPERATOR, "AND");

            if (suspect(TOKEN_TYPES.KEYWORD, "UNBOUNDED")) {
                window.following = Number.POSITIVE_INFINITY;
                expect(TOKEN_TYPES.KEYWORD, "FOLLOWING");

            } else if (suspect(TOKEN_TYPES.KEYWORD, "CURRENT ROW")) {
                window.following = 0;

            } else {
                window.following = +expect(TOKEN_TYPES.NUMBER).value;
                expect(TOKEN_TYPES.KEYWORD, "FOLLOWING");
            }
        }

        return window;
    }

    return descendExpression();
}

/**
 * Normally adds the node to the end of the child array.
 * However, in the case of an operator it will pop the previous
 * node and add it as a child of this operator.
 * @param {Node} parent
 * @param {Node} node
 * @returns {Node} It just returns it's second parameter
 */
function appendChild (parent, node) {
    const children = parent.children;

    // Operators get special treatment to deal with precedence
    if (node.type === NODE_TYPES.OPERATOR &&
        node.id !== "NOT") // unary prefix operator
    {
        const prev = lastChild(parent);

        if (prev && prev.type === NODE_TYPES.OPERATOR &&
            // Apply operator precedence
            getPrecedence(prev) < getPrecedence(node)
        ) {
            // Current and Prev nodes are both operators but the previous
            // one outranks the current node so we'll add the current node
            // as a child of the previous one.
            appendChild(prev, node);

            // And we're done.
            return node;
        }

        // The previous node wasn't an operator or is an operator but
        // has lower precedence than the current one.
        //
        // Therefore we'll remove the previous node and add it as the
        // child of the current node.
        node.children[0] = children.pop();
        node.source = `${node.children[0].source} ${node.source}`;
    }

    // Finally add the new node to the parent.
    children.push(node);

    return node;
}

/**
 *
 * @param {Node} node
 * @returns {Node}
 */
function lastChild (node) {
    return node.children && node.children.length > 0 && node.children[node.children.length - 1];
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
