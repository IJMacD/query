const { tokenize, TOKEN_TYPES, DEBUG_TOKEN_TYPES } = require('./tokenizer');
const { repeat } = require('../util');

/** @typedef {import('../..').Token} Token */
/** @typedef {import('../..').Node} Node */
/** @typedef {import('../..').WindowSpec} WindowSpec */
/** @typedef {import('../..').NodeTypes} NodeTypes */
/** @typedef {import('../..').TokenTypes} TokenTypes */

const { NODE_TYPES } = require('../types');

const DEBUG_NODE_TYPES = Object.keys(NODE_TYPES);

const KEYWORD_CONSTANTS = /^(?:MILLENNIUM|MILLENNIA|CENTURY|CENTURIES|(?:DECADE|YEAR|QUARTER|MONTH|WEEK|DAY|HOUR|MINUTE|SECOND|MILLISECOND|MICROSECOND)S?|WEEKDAY|DOY|DOW|EPOCH|ISO|ISOWEEK|ISOYEAR|TIMEZONE(?:_HOUR|_MINUTE)?|INT|FLOAT|STRING|NUM|DATE)\b/i;

module.exports = {
    parseTokenList: parseFromTokenList,

    parse (sql) {
        const preProcessors = [ stringsThatAreReallyFunctionCalls, keywordsThatAreReallyFunctionCalls ];

        const tokens = preProcessors.reduce((tokens, processor) => processor(tokens), tokenize(sql));

        const postProcessors = [ castKeywordStrings, extractKeywordStrings ];

        return postProcessors.reduce((ast, processor) => processor(ast), parseFromTokenList(tokens, sql));
    },

    NODE_TYPES,
    DEBUG_NODE_TYPES,
    KEYWORD_CONSTANTS,
};

class TokenError extends Error {
    /**
     *
     * @param {Token} token
     * @param {string} source
     * @param {TokenTypes} expectedType
     * @param {string} expectedValue
     */
    constructor (token, source, expectedType=undefined, expectedValue=undefined) {
        const tokenMessage = token ?
            `Invalid token found: [${DEBUG_TOKEN_TYPES[token.type]} ${token.value}] at ${token.start}` :
            "Unexpected end of tokens";

        let message = tokenMessage;

        if (typeof expectedType !== "undefined") {
            message += `\nExpected: [${DEBUG_TOKEN_TYPES[expectedType]}${typeof expectedValue !== "undefined" ? ` '${expectedValue}'`: ""}]`;
        }

        const offset = Math.max(0, token.start - 5);
        message += `\nSource:     ${source.substr(offset, 15)}`;
        message += `\nError here: ${repeat(" ", Math.min(5, offset))}^`;

        super(message);
    }
}

class ClauseError extends Error {}

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
     * is not exactly as expected this function throws.
     * @param {number} type
     * @param {string} value
     * @returns {Token}
     */
    function expect (type, value=undefined) {
        const current = tokenList[i];

        if (!current) {
            throw new TokenError(null, source, type, value);
        }

        if ((type !== current.type) || (typeof value !== "undefined" && value !== current.value)) {
            throw new TokenError(current, source, type, value);
        }

        return tokenList[i++];
    }

    function current () {
        return tokenList[i];
    }

    function next () {
        return tokenList[i++];
    }

    function prev () {
        return tokenList[--i];
    }

    function end () {
        return i >= tokenList.length;
    }

    function isList () {
        // This implementation will allow a leading comma in a list
        suspect(TOKEN_TYPES.COMMA);
        return (!end() && !peek(TOKEN_TYPES.KEYWORD) && !peek(TOKEN_TYPES.QUERY_OPERATOR) && !peek(TOKEN_TYPES.BRACKET, ")"));
    }

    function descendQueryExpression () {
        const { start } = current();

        let root = descendStatement();

        while (peek(TOKEN_TYPES.QUERY_OPERATOR)) {

            const t = next();

            const op = {
                type: NODE_TYPES.COMPOUND_QUERY,
                id: t.value,
                children: [ root, descendStatement() ],
            };

            op.source = source.substring(start, current() && current().start).trim();

            root = op;
        }

        return root;
    }

    function descendStatement () {
        const { start } = current();

        /** @type {Node} */
        let out = {
            type: NODE_TYPES.STATEMENT,
            id: null,
            children: [],
        };

        while (peek(TOKEN_TYPES.KEYWORD)) {
            out.children.push(descendClause());
        }

        out.source = source.substring(start, current() && current().start).trim();

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
                    const c = current();
                    /** @type {Node} */
                    let child;

                    // First check for a sub-query
                    if (suspect(TOKEN_TYPES.BRACKET, "(")) {
                        child = descendQueryExpression();

                        expect(TOKEN_TYPES.BRACKET, ")");
                    } else {
                        // It can't quite be an expression but it can be a function
                        // call i.e. RANGE()
                        child = descendNode();
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

                    child.inner = true;
                    if (suspect(TOKEN_TYPES.KEYWORD, "LEFT")) {
                        child.inner = false;
                    } else {
                        suspect(TOKEN_TYPES.KEYWORD, "INNER");
                    }

                    child.source = source.substring(c.start, current() && current().start).trim();
                }
            break;
            case "SELECT":
                if (suspect(TOKEN_TYPES.KEYWORD, "DISTINCT")) {
                    out.distinct = true;
                }

                while (isList()) {
                    const c = current();
                    const child = descendExpression();
                    out.children.push(child);

                    if (suspect(TOKEN_TYPES.KEYWORD, "AS")) {
                        const alias = expect(TOKEN_TYPES.NAME);

                        child.alias = alias.value;
                        child.source += ` AS ${alias.value}`;
                    }

                    child.source = source.substring(c.start, current() && current().start).trim();
                }
            break;
            case "ORDER BY":
                while (isList()) {
                    // Consume each item in the list following the keyword
                    out.children.push(descendOrder());
                }
            break;
            case "GROUP BY":
                while (isList()) {
                    // Consume each item in the list following the keyword
                    out.children.push(descendExpression());
                }
            break;
            case "WHERE":
            case "HAVING":
            case "LIMIT":
            case "OFFSET":
                // Single expression child
                out.children.push(descendExpression());
            break;
            case "WITH":
                while (isList()) {
                    const c = current();
                    const id = expect(TOKEN_TYPES.NAME).value;

                    /** @type {Node} */
                    const child = { type: NODE_TYPES.SYMBOL, id };
                    out.children.push(child);

                    if (suspect(TOKEN_TYPES.BRACKET, "(")) {
                        child.headers = [];

                        while(isList()) {
                            const id = expect(TOKEN_TYPES.NAME).value;
                            child.headers.push(id);
                        }

                        expect(TOKEN_TYPES.BRACKET, ")");
                    }

                    expect(TOKEN_TYPES.KEYWORD, "AS");
                    expect(TOKEN_TYPES.BRACKET, "(");

                    child.children = [ descendQueryExpression() ];

                    expect(TOKEN_TYPES.BRACKET, ")");

                    child.source = source.substring(c.start, current() && current().start).trim();
                }
            break;
            case "WINDOW":
                while (isList()) {
                    const c = current();
                    const id = expect(TOKEN_TYPES.NAME).value;

                    /** @type {Node} */
                    const child = { type: NODE_TYPES.SYMBOL, id };

                    expect(TOKEN_TYPES.KEYWORD, "AS");
                    expect(TOKEN_TYPES.BRACKET, "(");

                    child.window = descendWindow();

                    expect(TOKEN_TYPES.BRACKET, ")");

                    out.children.push(child);

                    child.source = source.substring(c.start, current() && current().start).trim();
                }
            break;
            case "VALUES":
                while (isList()) {
                    const c = current();
                    const child = { type: NODE_TYPES.LIST, id: null, children: [] };
                    out.children.push(child);

                    expect(TOKEN_TYPES.BRACKET, "(");
                    while (isList()) {
                        child.children.push(descendExpression());
                    }
                    expect(TOKEN_TYPES.BRACKET, ")");

                    child.source = source.substring(c.start, current() && current().start).trim();
                }
            break;
            case "EXPLAIN":
                if (suspect(TOKEN_TYPES.NAME, "ANALYSE")) {
                    out.children.push({ type: NODE_TYPES.SYMBOL, id: "ANALYSE" });
                }
                else if (suspect(TOKEN_TYPES.NAME, "AST")) {
                    out.children.push({ type: NODE_TYPES.SYMBOL, id: "AST" });
                } else {
                    out.children.push({ type: NODE_TYPES.SYMBOL, id: "QUERY" });
                }
            break;
            case "CREATE TABLE":
            case "DROP TABLE":
            case "INSERT INTO": 
            case "DELETE FROM": {
                const id = expect(TOKEN_TYPES.NAME).value;
                out.children.push({ type: NODE_TYPES.SYMBOL, id });
            }
            break;
            case "UPDATE": {
                const id = expect(TOKEN_TYPES.NAME).value;
                // Abuse alias field to save table name
                out.alias = id;

                expect(TOKEN_TYPES.KEYWORD, "SET");

                while (isList()) {
                    const name = expect(TOKEN_TYPES.NAME).value;

                    expect(TOKEN_TYPES.OPERATOR, "=");

                    const value = descendExpression();

                    out.children.push({
                        type: NODE_TYPES.OPERATOR,
                        id: "=",
                        children: [
                            { type: NODE_TYPES.SYMBOL, id: name },
                            value,
                        ],
                    });
                }
            }
            break;
            default:
                throw new TokenError(t, source, TOKEN_TYPES.KEYWORD);
        }

        out.source = source.substring(t.start, current() && current().start).trim();

        return out;
    }

    /**
     * @returns {Node}
     */
    function descendNode () {
        /** @type {Node} */
        let out;
        const t = current();

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

                        // Loop through adding each parameter
                        out.children.push(descendExpression());

                        if (
                            // Consume a comma if needed
                            !suspect(TOKEN_TYPES.COMMA) &&

                            // This is special treatment for
                            //      `EXTRACT(x FROM y)`
                            //      `CAST(x AS y)`
                            //      `CAST(x AS y FORMAT z)`
                            // They can be treated like a comma.
                            !suspect(TOKEN_TYPES.KEYWORD)
                        )
                        {
                            // We didn't have a comma (or FROM/AS) so we can't have
                            // any more function parameters
                            break;
                        }
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

                    break;
                }

                out = { type: NODE_TYPES.SYMBOL, id: t.value };
                break;
            case TOKEN_TYPES.STRING:
                next();
                out = { type: NODE_TYPES.STRING, id: t.value };
                break;
            case TOKEN_TYPES.NUMBER:
                next();
                out = { type: NODE_TYPES.NUMBER, id: +t.value };
                break;
            case TOKEN_TYPES.CONSTANT:
                next();
                out = { type: NODE_TYPES.CONSTANT, id: t.value };
                break;
            case TOKEN_TYPES.PARAM:
                next();
                out = { type: NODE_TYPES.PARAM, id: t.value };
                break;
            case TOKEN_TYPES.OPERATOR:
                next();
                out = { type: NODE_TYPES.OPERATOR, id: t.value, children: [] };
                break;
            case TOKEN_TYPES.BRACKET:
                next();

                if (peek(TOKEN_TYPES.KEYWORD)) {
                    out = descendQueryExpression();
                    expect(TOKEN_TYPES.BRACKET, ")");
                    break;
                }

                out = { type: NODE_TYPES.LIST, id: null, children: [] };

                while(isList()) {
                    out.children.push(descendExpression());
                }

                expect(TOKEN_TYPES.BRACKET, ")");

                break;
            case TOKEN_TYPES.COMMA:
                throw new Error(`ParseError: Unexpected comma at ${t.start}`);
            default:
                throw new TokenError(t, source);
        }

        out.source = source.substring(t.start, current() && current().start).trim();

        return out;
    }

    function descendExpression () {
        const { start } = current();

        const nodes = [];

        while (!end() && !peek(TOKEN_TYPES.BRACKET, ")")) {
            try {
                nodes.push(descendNode());
            } catch (e) {
                break;
            }
        }

        if (nodes.length === 0) {
            throw Error("Expected an expression but didn't find one");
        }

        if (nodes.length === 1) {
            return nodes[0];
        }

        markBAnd(nodes);

        bubbleOperators(nodes);

        stripBAnd(nodes);

        let index = 0;

        /**
         *
         * @param {Node[]} nodes
         * @returns {Node}
         */
        function assembleExpressionTree (nodes) {
            const root = nodes[index];

            if (!root || root.type !== NODE_TYPES.OPERATOR) {
                throw Error("Expecting an operator");
            }

            // // Unary prefix
            // if (t.value === "NOT") {}

            let left = nodes[++index];

            if (left.type === NODE_TYPES.OPERATOR) {
                left = assembleExpressionTree(nodes);
            } else if (left.type === NODE_TYPES.LIST) {
                // If we have a list here it's not actually a list
                // it's really a subexpression in brackets.
                // That subexpression has already been correctly parsed.
                left = left.children[0];
                left.source = `(${left.source})`;
            }

            root.children[0] = left;

            // Unary postfix
            if (root.id === "IS NULL" ||
                root.id === "IS NOT NULL")
            {
                return root;
            }

            let right = nodes[++index];

            if (right.type === NODE_TYPES.OPERATOR) {
                right = assembleExpressionTree(nodes);
            } else if (right.type === NODE_TYPES.LIST && (root.id !== "IN" && root.id !== "NOT IN")) {
                // Most of the time 'LISTs' are just bracketed sub-expressions
                // but the IN operators can take a list
                right = right.children[0];
                right.source = `(${right.source})`;
            }

            root.children[1] = right;

            root.source = `${root.children[0].source} ${root.source} ${root.children.length > 1 ? root.children[1].source:''}`;

            if (root.id === "BETWEEN") {
                // Between has a third child node
                let farRight = nodes[++index];

                if (farRight.type === NODE_TYPES.OPERATOR) {
                    farRight = assembleExpressionTree(nodes);
                } else if (farRight.type === NODE_TYPES.LIST) {
                    farRight = farRight.children[0];
                }

                root.children[2] = farRight;

                root.source += ` AND ${farRight.source}`;
            }

            return root;
        }

        const root = assembleExpressionTree(nodes);

        root.source = source.substring(start, current() && current().start).trim();

        return root;
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

        if (suspect(TOKEN_TYPES.KEYWORD, "NULLS FIRST")) {
            out.nulls = "first";
        } else if (suspect(TOKEN_TYPES.KEYWORD, "NULLS LAST")) {
            out.nulls = "last";
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

    return descendQueryExpression();
}

/**
 * The 'AND' following a 'BETWEEN' should have higher
 * binding power than normal ANDs. In order to process
 * properly we can just strip out the first AND after
 * every BETWEEN.
 * @param {Node[]} nodes
 */
function markBAnd (nodes) {
    let pending = false;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n) break;

        if (n.id === "BETWEEN") {
            pending = true;
        } else if (pending && n.id === "AND") {
            n.id = "BAND";
            pending = false;
        }
    }
}

function stripBAnd (nodes) {
    for (const i in nodes) {
        if (nodes[i].id === "BAND") {
            nodes.splice(i, 1);
        }
    }
}

/**
 *
 * @param {Node[]} nodes
 */
function bubbleOperators (nodes) {
    for (let i = nodes.length - 1; i > 0; i--) {
        const n = nodes[i];

        if (n.type !== NODE_TYPES.OPERATOR) {
            continue;
        }

        for (let j = i; j > 0; j--) {
            const a = nodes[j];
            const b = nodes[j-1];

            if (b.type === NODE_TYPES.OPERATOR && getPrecedence(b) < getPrecedence(a)) {
                // i--;
                break;
            }

            nodes[j-1] = a;
            nodes[j] = b;
        }
    }
}

/**
 * Get operator precedence
 * Higher number is tighter binding
 * @param {Node} node
 */
function getPrecedence (node) {
    switch (node.id) {
        case "AND":
            return 10;
        case "OR":
            return 15;
        case "BETWEEN":
        case "BAND":
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

/**
 * The tokenizer recognizes certain "keywords" as strings
 * however that might not be correct.
 * An example of this is when the token is followed by an
 * open bracket because it means it must be a function call.
 * @param {Token[]} tokens
 */
function stringsThatAreReallyFunctionCalls (tokens) {
    for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].type === TOKEN_TYPES.STRING &&
            tokens[i+1].type === TOKEN_TYPES.BRACKET &&
            tokens[i+1].value === "(")
        {
            tokens[i].type = TOKEN_TYPES.NAME;
        }
    }
    return tokens;
}

/**
 * 
 * The tokenizer recognizes certain function names as keywords
 * however that might not be correct.
 * An example of this is when the token is followed by an
 * open bracket because it means it must be a function call.
 * e.g. RANGE()
 * @param {Token[]} tokens 
 */
function keywordsThatAreReallyFunctionCalls (tokens) {
    for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].type === TOKEN_TYPES.KEYWORD &&
            tokens[i].value === "RANGE" &&
            tokens[i+1].type === TOKEN_TYPES.BRACKET &&
            tokens[i+1].value === "(")
        {
            tokens[i].type = TOKEN_TYPES.NAME;
        }
    }
    return tokens;
}


/**
 * CAST (X AS ____)
 * @param {Node} ast 
 */
function castKeywordStrings (ast) {
    ast = walk(ast, node => {
        if (node.type === NODE_TYPES.FUNCTION_CALL && /^CAST$/i.test(node.id)) {
            const c2 = node.children[1];
            if (/^(INT|REAL|FLOAT|NUM|DATE|STRING)$/.test(c2.id)) {
                c2.type = NODE_TYPES.STRING;
            }
        }
        return node;
    });
    return ast;
}

/**
 * EXTRACT (____ FROM )
 * @param {Node} ast 
 */
function extractKeywordStrings (ast) {
    ast = walk(ast, node => {
        if (node.type === NODE_TYPES.FUNCTION_CALL && /^EXTRACT$/i.test(node.id)) {
            const c1 = node.children[0];
            if (KEYWORD_CONSTANTS.test(c1.id)) {
                c1.type = NODE_TYPES.STRING;
            }
        }
        return node;
    });
    return ast;
}

function walk (node, callback) {
    node = callback(node);
    if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
            node.children[i] = walk(node.children[i], callback);
        }
    }
    return node;
}