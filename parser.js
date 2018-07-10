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
};

module.exports = {
    /**
     * @param {Token[]} tokenList
     * @returns {Node}
     */
    parse (tokenList) {
        let i = 0;
        
        function descend () {
            const out = {};
            const t = tokenList[i];
            
            switch (t.type) {
                case TYPES.KEYWORD:
                    i++;
                    out.type = NODE_TYPES.CLAUSE;
                    out.id = t.value;
                    out.children = [];
                    while (i < tokenList.length && tokenList[i].type !== TYPES.BRACKET) {
                        out.children.push(descend());
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
                            out.children.push(descend());
                            let next = tokenList[i];
                            if (next.type === TYPES.COMMA) {
                                i++; // Comma
                            } else if (next.type === TYPES.KEYWORD && next.value === "FROM") {
                                // This is special treatment for `EXTRACT(x FROM y)`
                                i++; // FROM
                                next = tokenList[i];
                                if (next.type === TYPES.NAME || 
                                    next.type === TYPES.STRING ||
                                    next.type === TYPES.NUMBER) {
                                    out.children.push(descend());
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
                default:
                    throw new Error("Only able to parse some tokens. Got token type " + t.type);
            }
        }

        return descend();
    },

    NODE_TYPES,
}