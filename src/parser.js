const { tokenize, TOKEN_TYPES, DEBUG_TOKEN_TYPES } = require('./tokenizer');

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
    LIST: 8,
};

const DEBUG_NODE_TYPES = [
    "UNKNOWN",
    "STATEMENT",
    "CLAUSE",
    "FUNCTION_CALL",
    "SYMBOL",
    "STRING",
    "NUMBER",
    "OPERATOR",
    "LIST",
];

module.exports = {

    parseTokenList: parseFromTokenList,

    parse (sql) {
        return parseFromTokenList(tokenize(sql), sql);
    },

    NODE_TYPES,
    DEBUG_NODE_TYPES,
};

class TokenError extends Error {
    constructor (token, expectedType=undefined, expectedValue=undefined) {
        const tokenMessage = token ?
            `Invalid token found: [${DEBUG_TOKEN_TYPES[token.type]} ${token.value}] at ${token.start}` :
            "Unexpected end of tokens";

        let message = tokenMessage;

        if (typeof expectedType !== "undefined") {
            message += `\nExpected: [${DEBUG_TOKEN_TYPES[expectedType]}${typeof expectedValue !== "undefined" ? ` '${expectedValue}'`: ""}]`;
        }

        super(message);
    }
}

/**
 * @param {Token[]} tokenList
 * @param {string} source
 * @returns {Node}
 */
function parseFromTokenList (tokenList, source="") {
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

        if ((type !== current.type) || (typeof value !== "undefined" && value !== current.value)) {
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

        if (!current) {
            throw new TokenError(null, type, value);
        }

        if ((type !== current.type) && (typeof value === "undefined" || value !== current.value)) {
            throw new TokenError(current, type, value);
        }

        return tokenList[i++];
    }

    function current () {
        return tokenList[i];
    }

    function next () {
        return tokenList[i++];
    }

    function end () {
        return i >= tokenList.length;
    }

    function isList () {
        return (!end() && !peek(TOKEN_TYPES.KEYWORD) && !peek(TOKEN_TYPES.BRACKET, ")"));
    }

    function descendStatement () {
        /** @type {Node} */
        let out = {
            type: NODE_TYPES.STATEMENT,
            id: null,
            children: [],
        };

        while (!end() && !peek(TOKEN_TYPES.BRACKET, ")")) {
            out.children.push(descendClause());
        }

        return out;
    }

    function descendClause () {
        const t = expect(TOKEN_TYPES.KEYWORD);

        /** @type {Node} */
        let out = {
            type: NODE_TYPES.CLAUSE,
            id: t.value,
            children: [],
        };

        switch (t.value) {
            case "FROM":
                while (isList()) {
                    let child;

                    // First check for a sub-query
                    if (suspect(TOKEN_TYPES.BRACKET, "(")) {
                        child = descendStatement();

                        expect(TOKEN_TYPES.BRACKET, ")");
                    } else {
                        // It can't quite be an expression but it can be a function
                        // call i.e. RANGE()
                        child = descend();
                    }
                    out.children.push(child);

                    if (suspect(TOKEN_TYPES.KEYWORD, "AS")) {
                        child.alias = expect(TOKEN_TYPES.NAME).value

                        // Column rename
                        if (suspect(TOKEN_TYPES.BRACKET, "(")) {
                            child.headers = [];

                            while(isList()) {
                                const id = expect(TOKEN_TYPES.NAME).value;
                                child.headers.push(id);

                                if (!suspect(TOKEN_TYPES.COMMA)) {
                                    break;
                                }
                            }

                            expect(TOKEN_TYPES.BRACKET, ")");
                        }
                    }

                    if (suspect(TOKEN_TYPES.KEYWORD, "ON")) {
                        child.predicate = descendExpression();
                        child.source += ` ON ${child.predicate.source}`;

                    } else if (suspect(TOKEN_TYPES.KEYWORD, "USING")) {
                        const name = expect(TOKEN_TYPES.NAME);
                        child.using = name.value;
                        child.source += ` USING ${name.value}`;
                    }

                    if (suspect(TOKEN_TYPES.KEYWORD, "INNER")) {
                        child.inner = true;
                    }

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }
                break;
            case "SELECT":
                if (suspect(TOKEN_TYPES.KEYWORD, "DISTINCT")) {
                    out.distinct = true;
                }

                while (isList()) {
                    const child = descendExpression();
                    out.children.push(child);

                    if (suspect(TOKEN_TYPES.KEYWORD, "AS")) {
                        const alias = expect(TOKEN_TYPES.NAME);

                        child.alias = alias.value;
                        child.source += ` AS ${alias.value}`;
                    }

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }
                break;
            case "ORDER BY":
                while (isList()) {
                    // Consume each item in the list following the keyword
                    out.children.push(descendOrder());

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }
                break;
            case "GROUP BY":
                while (isList()) {
                    // Consume each item in the list following the keyword
                    out.children.push(descendExpression());

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }
                break;
            case "WHERE":
            case "HAVING":
                // Single expression child
                out.children.push(descendExpression());
                break;
            case "WITH":
                while (isList()) {
                    const id = expect(TOKEN_TYPES.NAME).value;

                    /** @type {Node} */
                    const child = { type: NODE_TYPES.SYMBOL, id };
                    out.children.push(child);

                    if (suspect(TOKEN_TYPES.BRACKET, "(")) {
                        child.headers = [];

                        while(isList()) {
                            const id = expect(TOKEN_TYPES.NAME).value;
                            child.headers.push(id);

                            if (!suspect(TOKEN_TYPES.COMMA)) {
                                break;
                            }
                        }

                        expect(TOKEN_TYPES.BRACKET, ")");
                    }

                    expect(TOKEN_TYPES.KEYWORD, "AS");
                    expect(TOKEN_TYPES.BRACKET, "(");

                    child.children = [ descendStatement() ];

                    expect(TOKEN_TYPES.BRACKET, ")");

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }
                break;
            case "WINDOW":
                while (isList()) {
                    const id = expect(TOKEN_TYPES.NAME).value;

                    /** @type {Node} */
                    const child = { type: NODE_TYPES.SYMBOL, id };

                    expect(TOKEN_TYPES.KEYWORD, "AS");
                    expect(TOKEN_TYPES.BRACKET, "(");

                    child.window = descendWindow();

                    expect(TOKEN_TYPES.BRACKET, ")");

                    out.children.push(child);

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }
                break;
            case "VALUES":
                while (isList()) {
                    const child = { type: NODE_TYPES.LIST, id: null, children: [] };
                    out.children.push(child);

                    expect(TOKEN_TYPES.BRACKET, "(");
                    while (isList()) {
                        child.children.push(descend());

                        if (!suspect(TOKEN_TYPES.COMMA)) {
                            break;
                        }
                    }
                    expect(TOKEN_TYPES.BRACKET, ")");

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }
                break;
            case "LIMIT":
                out.children.push(descendExpression())
                break;
            case "OFFSET":
                out.children.push(descendExpression())
                break;
            case "EXPLAIN":
                break;
            default:
                throw TypeError(`Unexpected Keyword. Expected a clause but got ${t.value}`);
        }

        const next_token = current();
        out.source = source.substring(t.start, next_token && next_token.start).trim();

        return out;
    }

    /**
     * @returns {Node}
     */
    function descend () {
        /** @type {Node} */
        let out;
        const t = current();
        let next_token;

        switch (t.type) {
            case TOKEN_TYPES.NAME:
                next();

                if (suspect(TOKEN_TYPES.BRACKET, "(")) {
                    // Open bracket signifies a function call

                    out = { type: NODE_TYPES.FUNCTION_CALL, id: t.value, children: [] };

                    if (suspect(TOKEN_TYPES.KEYWORD, "DISTINCT")) {
                        out.distinct = true;
                    }

                    while (isList()) {

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

                        const bracket = suspect(TOKEN_TYPES.BRACKET, "(");

                        if (peek(TOKEN_TYPES.NAME)) {
                            out.window = next().value;
                            bracket && expect(TOKEN_TYPES.BRACKET, ")");
                        }
                        else {
                            bracket || expect(TOKEN_TYPES.BRACKET, "(");
                            out.window = descendWindow();
                            expect(TOKEN_TYPES.BRACKET, ")");
                        }

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
            case TOKEN_TYPES.BRACKET:
                next();

                if (peek(TOKEN_TYPES.KEYWORD)) {
                    const stmt = descendStatement();
                    expect(TOKEN_TYPES.BRACKET);
                    return stmt;
                }

                out = { type: NODE_TYPES.LIST, id: null, children: [] };

                while(isList()) {
                    out.children.push(descendExpression());

                    if (!suspect(TOKEN_TYPES.COMMA)) {
                        break;
                    }
                }

                expect(TOKEN_TYPES.BRACKET, ")");

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

        while (i < tokenList.length && (peek(TOKEN_TYPES.OPERATOR) || peek(TOKEN_TYPES.NUMBER))) {
            let child;

            if (peek(TOKEN_TYPES.NUMBER)) {
                const currToken = current();
                const currValue = +currToken.value;
                if(currValue < 0) {
                    // '-' was interpreted as unary minus rather than subtract operator
                    const val = current().value;
                    current().value = String(+val * -1);
                    child = { type: NODE_TYPES.OPERATOR, id: '-', children: [ null, descend() ], source: val };
                } else {
                    // we had a positive number following a node other than an operator
                    // that's illegal
                    throw new TokenError(currToken);
                }
            } else {
                child = descend();
            }

            appendChild(dummyNode, child);
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

        // These probably should be keywords rather than names.
        // However when they're added to the tokenizer it clashes with
        // the RANGE() table valued function.
        if (peek(TOKEN_TYPES.NAME, "ROWS") ||
            peek(TOKEN_TYPES.NAME, "RANGE") ||
            peek(TOKEN_TYPES.NAME, "GROUPS")
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

    return descendStatement();
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

        if (prev && prev.type === NODE_TYPES.OPERATOR) {
            // Special special treatment for BETWEEN since there are 3 operands
            if (prev.id === "BETWEEN" && node.id === "AND") {
                prev.children[2] = node.children[1];
                return prev;
            }
            // Apply operator precedence
            else if (getPrecedence(prev) < getPrecedence(node)) {
                // Current and Prev nodes are both operators but the previous
                // one outranks the current node so we'll add the current node
                // as a child of the previous one.
                appendChild(prev, node);

                // And we're done.
                return node;
            }
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
 * Higher number is tighter binding
 * @param {Node} node
 */
function getPrecedence (node) {
    switch (node.id) {
        case "BETWEEN":
            return 5;
        case "AND":
            return 10;
        case "OR":
            return 15;
        case ">":
        case "<":
        case "=":
        case "!=":
        case "<=":
        case ">=":
        case "IS NULL":
        case "IS NOT NULL":
        case "IN":
        case "NOT IN":
        case "LIKE":
        case "NOT LIKE":
        case "REGEXP":
        case "NOT REGEXP":
            return 20;
        case "||":
            return 25;
        case "+":
        case "-":
            return 30;
        case "*":
        case "/":
            return 40;
        case "??":
            return 50;
        default:
            return 100;
    }
}
