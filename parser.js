const { TYPES } = require('./tokenizer');

 /**
  * @typedef Token
  * @prop {number} type
  * @prop {string} value
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
     * @returns {Node}
     */
    parse (tokenList) {
        let i = 0;

        function descend () {
            let out = {};
            const t = tokenList[i];

            switch (t.type) {
                case TYPES.KEYWORD:
                    i++;
                    out.type = NODE_TYPES.CLAUSE;
                    out.id = t.value;
                    out.children = [];
                    while (i < tokenList.length && tokenList[i].type !== TYPES.BRACKET) {
                        appendChild(out.children, descend());

                        let next = tokenList[i];
                        if (next) {
                            if (next.type === TYPES.KEYWORD && next.value === "AS") {
                                i++; // AS
                                next = tokenList[i];
                                if (next.type === TYPES.NAME) {
                                    out.children[out.children.length-1].alias = next.value;
                                } else {
                                    throw new Error("Name expected");
                                }
                                i++; // alias
                                next = tokenList[i];
                            }

                            if (next && next.type === TYPES.COMMA) {
                                i++; // Comma
                            }
                        }
                    }
                    return out;
                case TYPES.NAME:
                    i++;
                    const next = tokenList[i];
                    if (next && next.type === TYPES.BRACKET && next.value === "(") {
                        out.type = NODE_TYPES.FUNCTION_CALL;
                        out.id = t.value;
                        out.children = [];

                        i++; // Open Bracket
                        while (i < tokenList.length && tokenList[i].type !== TYPES.BRACKET) {
                            appendChild(out.children, descend());

                            let next = tokenList[i];
                            if (next.type === TYPES.COMMA) {
                                i++; // Comma
                            } else if (next.type === TYPES.KEYWORD && next.value === "FROM") {
                                // This is special treatment for `EXTRACT(x FROM y)`
                                i++; // FROM
                                next = tokenList[i];
                                if (next.type === TYPES.NAME ||
                                    next.type === TYPES.STRING ||
                                    next.type === TYPES.NUMBER ||
                                    next.type === TYPES.OPERATOR
                                ) {
                                    appendChild(out.children, descend());
                                }
                            }
                        }
                        i++; // Close Bracket
                        return out;
                    }
                    return { type: NODE_TYPES.SYMBOL, id: t.value };
                case TYPES.STRING:
                    i++;
                    return { type: NODE_TYPES.STRING, id: t.value };
                case TYPES.NUMBER:
                    i++;
                    return { type: NODE_TYPES.NUMBER, id: +t.value };
                case TYPES.OPERATOR:
                    i++;
                    out = { type: NODE_TYPES.OPERATOR, id: t.value, children: [] };

                    if (t.value === "*") {
                        const next = tokenList[i];
                        if (!next || next.type === TYPES.COMMA || next.type === TYPES.KEYWORD) {
                            // This is not an operator i.e. `SELECT *`
                            return { type: NODE_TYPES.SYMBOL, id: "*" };
                        }
                    }
                    else if (t.value !== "IS NULL" &&
                        t.value !== "IS NOT NULL"
                    ) {
                        out.children[1] = descend();
                    }

                    return out;
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
        node.children[0] = array.pop();
    }
    array.push(node);
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