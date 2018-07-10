/*
 * TOKENS:
 * -------
 * BRACKET: [()]
 * COMMA: ,
 * KEYWORD: "SELECT"|"FROM"|"WHERE"|"ORDER BY"|"LIMIT"|"GROUP BY"|"OFFSET"|"HAVING"|"EXPLAIN"|"AS"
 * NAME: [a-zA-Z_][a-zA-Z0-9_\.]*
 * STRING: '.*'
 * NUMBER: 0x[0-9a-f]+|[0-9]+
 * OPERATOR: [+-*\/=!><]
 */

module.exports = {
    /**
     * @param {string} string
     */
    tonkenize (string) {
        const len = string.length;
        let i = 0;
        const out = [];

        while (i < len) {
            const c = string[i];
            if (/\s/.test(c)) {
                i++;
            } else if (c === "(" || c === ")") {
                out.push({ type: this.TYPES.BRACKET, value: c });
                i++;
            } else if (c === ",") {
                out.push({ type: this.TYPES.COMMA });
                i++;
            } else if (c === "'") {
                const end = string.indexOf("'", i + 1);
                if (end < 0) {
                    throw new Error("Unterminated String: " + string.substring(i));
                }
                const str = string.substring(i + 1, end);
                out.push({ type: this.TYPES.STRING, value: str });
                i = end + 1;
            } else if (/[-\d]/.test(c)) {
                const r = /^0x[0-9a-f]+|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i;
                const ss = string.substr(i);
                const m = r.exec(ss);

                if (m) {
                    out.push({ type: this.TYPES.NUMBER, value: m[0] });
                    i += m[0].length;
                }
                else throw new Error(`Unrecognised number: '${ss.substr(0, 10)}' at ${i}`);
            } else {
                const ss = string.substr(i);

                let m = /^(?:SELECT|FROM|WHERE|ORDER BY|LIMIT|GROUP BY|OFFSET|HAVING|EXPLAIN|AS)/i.exec(ss);
                if (m) {
                    out.push({ type: this.TYPES.KEYWORD, value: m[0].toUpperCase() });
                    i += m[0].length;
                    continue;
                }

                m = /^[a-z_][a-z0-9_\.]*/i.exec(ss);
                if (m) {
                    out.push({ type: this.TYPES.NAME, value: m[0] });
                    i += m[0].length;
                    continue;
                }

                m = /^(?:[<>+=!*\/-]+|IS(?: NOT)?(?: NULL)?|(?:NOT )?LIKE|(?:NOT )?REGEXP|IN)/i.exec(ss);
                if (m) {
                    out.push({ type: this.TYPES.OPERATOR, value: m[0] });
                    i += m[0].length;
                    continue;
                }

                throw new Error(`Unrecognised input: '${ss.substr(0, 10)}' at ${i}`);
            }
        }

        return out;
    },

    TYPES: {
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