/*
 * TOKENS:
 * -------
 * BRACKET: [()]
 * COMMA: ,
 * KEYWORD: "SELECT"|"FROM"|"WHERE"|"ORDER BY"|"LIMIT"|"GROUP BY"|"OFFSET"|"HAVING"|"EXPLAIN"|"AS"
 * NAME: [a-zA-Z_][a-zA-Z0-9_\.]*
 * STRING: '.*'
 * NUMBER: 0x[0-9a-f]+|[0-9]+
 * OPERATOR: [+-*\/=!><]|AND
 */

 /**
  * @typedef Token
  * @prop {number} type
  * @prop {string} [value]
  * @prop {number} start
  */

module.exports = {
    /**
     * @param {string} string
     * @return {Token[]}
     */
    tonkenize (string) {
        const len = string.length;
        let i = 0;

        /** @type {Token[]} */
        const out = [];

        function prevToken() {
            return out[out.length - 1];
        }

        while (i < len) {
            const c = string[i];
            if (/\s/.test(c)) {
                i++;
            } else if (c === "(" || c === ")") {
                out.push({ type: this.TOKEN_TYPES.BRACKET, value: c, start: i });
                i++;
            } else if (c === ",") {
                out.push({ type: this.TOKEN_TYPES.COMMA, start: i });
                i++;
            } else if (c === "'") {
                const end = string.indexOf("'", i + 1);
                if (end < 0) {
                    throw new Error("Unterminated String: " + string.substring(i));
                }
                const str = string.substring(i + 1, end);
                out.push({ type: this.TOKEN_TYPES.STRING, value: str, start: i });
                i = end + 1;
            } else if (c === "\"") {
                const end = string.indexOf("\"", i + 1);
                if (end < 0) {
                    throw new Error("Unterminated Name: " + string.substring(i));
                }
                const str = string.substring(i + 1, end);
                out.push({ type: this.TOKEN_TYPES.NAME, value: str, start: i });
                i = end + 1;
            } else if (/[-\d]/.test(c)) {
                const r = /^(?:0x[0-9a-f]+|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i;
                const ss = string.substr(i);
                const m = r.exec(ss);

                if (m) {
                    out.push({ type: this.TOKEN_TYPES.NUMBER, value: m[0], start: i });
                    i += m[0].length;
                }
                else if (c === "-") {
                    out.push({ type: this.TOKEN_TYPES.OPERATOR, value: "-", start: i });
                    i += 1;
                }
                else throw new Error(`Unrecognised number: '${ss.substr(0, 10)}' at ${i}`);
            } else {
                const ss = string.substr(i);

                let m = /^(?:SELECT|FROM|WHERE|ORDER BY|LIMIT|GROUP BY|OFFSET|HAVING|EXPLAIN|AS|USING|ON|INNER)\b/i.exec(ss);
                if (m) {
                    out.push({ type: this.TOKEN_TYPES.KEYWORD, value: m[0].toUpperCase(), start: i });
                    i += m[0].length;
                    continue;
                }

                m = /^([<>+=!*\/|-]+|IS(?: NOT)? NULL\b|(?:NOT )?LIKE\b|(?:NOT )?REGEXP\b|(?:NOT )?IN\b|NOT\b|AND\b)/i.exec(ss);
                if (m) {
                    out.push({ type: this.TOKEN_TYPES.OPERATOR, value: m[1], start: i });
                    i += m[1].length;
                    continue;
                }

                m = /^([a-z_][a-z0-9_\.]*|\*)/i.exec(ss); // Asterisk as in: COUNT(*)
                if (m) {
                    out.push({ type: this.TOKEN_TYPES.NAME, value: m[0], start: i });
                    i += m[0].length;
                    continue;
                }

                throw new Error(`Unrecognised input: '${ss.substr(0, 10)}' at ${i}`);
            }
        }

        return out;
    },

    TOKEN_TYPES: {
        UNKNOWN: 0,
        BRACKET: 1,
        COMMA: 2,
        KEYWORD: 3,
        NAME: 4,
        STRING: 5,
        NUMBER: 6,
        OPERATOR: 7,
    },
}