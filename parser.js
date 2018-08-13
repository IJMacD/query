const { TOKEN_TYPES } = require('./tokenizer');

 /**
  * @typedef Token
  * @prop {number} type
  * @prop {string} [value]
  * @prop {number} start
  */

 /**
  * @typedef Node
  * @prop {number} type
  * @prop {string|number} id
  * @prop {string} alias
  * @prop {Node[]} children
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
    parse (tokenList, source) {
        let i = 0;

        function descend () {
            let out = {};
            const t = tokenList[i];
            let next;

            switch (t.type) {
                case TOKEN_TYPES.KEYWORD:
                    i++;
                    out.type = NODE_TYPES.CLAUSE;
                    out.id = t.value;
                    out.children = [];
                    while (i < tokenList.length && tokenList[i].type !== TOKEN_TYPES.BRACKET) {
                        appendChild(out.children, descend());

                        next = tokenList[i];
                        if (next) {
                            if (next.type === TOKEN_TYPES.KEYWORD && next.value === "AS") {
                                i++; // AS
                                next = tokenList[i];
                                if (next.type === TOKEN_TYPES.NAME) {
                                    const child = out.children[out.children.length - 1];
                                    child.alias = next.value;
                                    child.source += ` AS ${next.value}`;
                                } else {
                                    throw new Error("Name expected");
                                }
                                i++; // alias
                                next = tokenList[i];
                            }

                            if (next && next.type === TOKEN_TYPES.COMMA) {
                                i++; // Comma
                            }
                        }
                    }

                    out.source = source.substring(t.start, next && next.start).trim();

                    return out;
                case TOKEN_TYPES.NAME:
                    i++;
                    next = tokenList[i];

                    if (next && next.type === TOKEN_TYPES.BRACKET && next.value === "(") {
                        out.type = NODE_TYPES.FUNCTION_CALL;
                        out.id = t.value;
                        out.children = [];

                        i++; // Open Bracket
                        while (i < tokenList.length && tokenList[i].type !== TOKEN_TYPES.BRACKET) {
                            appendChild(out.children, descend());

                            next = tokenList[i];
                            if (!next) {
                                throw new Error("Unexpected end");
                            }

                            if (next.type === TOKEN_TYPES.COMMA) {
                                i++; // Comma
                            } else if (next.type === TOKEN_TYPES.KEYWORD) {
                                // This is special treatment for `EXTRACT(x FROM y)` or `CAST(x AS y)`

                                i++; // FROM/AS etc.
                                next = tokenList[i];
                                if (next.type === TOKEN_TYPES.NAME ||
                                    next.type === TOKEN_TYPES.STRING ||
                                    next.type === TOKEN_TYPES.NUMBER ||
                                    next.type === TOKEN_TYPES.OPERATOR
                                ) {
                                    appendChild(out.children, descend());
                                } else {
                                    throw new Error(`Unexpected node type ${next.type}`);
                                }
                            }
                        }
                        next = tokenList[i];

                        if (!next || next.type !== TOKEN_TYPES.BRACKET || next.value !== ")") {
                            throw new Error("Expected `)`");
                        }
                        i++; // Close Bracket

                        if (out.id === "EXTRACT") {
                            const extractPart = out.children[0];
                            if (extractPart) extractPart.type = NODE_TYPES.KEYWORD;
                        } else if (out.id === "CAST") {
                            const castType = out.children[1];
                            if (castType) castType.type = NODE_TYPES.KEYWORD;
                        }

                        next = tokenList[i];
                        out.source = source.substring(t.start, next && next.start).trim();

                        return out;
                    }

                    return { type: NODE_TYPES.SYMBOL, id: t.value, source: t.value };
                case TOKEN_TYPES.STRING:
                    i++;
                    return { type: NODE_TYPES.STRING, id: t.value, source: `'${t.value}'` };
                case TOKEN_TYPES.NUMBER:
                    i++;
                    return { type: NODE_TYPES.NUMBER, id: +t.value, source: t.value };
                case TOKEN_TYPES.OPERATOR:
                    i++;
                    out = { type: NODE_TYPES.OPERATOR, id: t.value, children: [] };

                    if (t.value === "*") {
                        next = tokenList[i];
                        if (!next || next.type === TOKEN_TYPES.COMMA || next.type === TOKEN_TYPES.KEYWORD) {
                            // This is not an operator i.e. `SELECT *`
                            return { type: NODE_TYPES.SYMBOL, id: "*", source: "*" };
                        }
                    }

                    if (t.value !== "IS NULL" &&
                        t.value !== "IS NOT NULL"
                    ) {
                        out.children[1] = descend();
                    }

                    next = tokenList[i];
                    out.source = source.substring(t.start, next && next.start).trim();

                    return out;
                case TOKEN_TYPES.COMMA:
                    throw new Error("Unexpected comma");
                default:
                    throw new Error("Only able to parse some tokens. Got token type " + t.type);
            }
        }

        return descend();
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
    if (node.type === NODE_TYPES.OPERATOR) {
        const prev = array[array.length-1];

        if (prev.type === NODE_TYPES.OPERATOR &&
            getPrecedence(prev) < getPrecedence(node)
        ) {
            // apply operator precedence
            appendChild(prev.children, node); // add this as a child of the AND instead
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
        default:
            return -1;
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