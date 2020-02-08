const { TOKEN_TYPES } = require('../types');
const DEBUG_TOKEN_TYPES = Object.keys(TOKEN_TYPES);

/** @typedef {import('../..').Token} Token */

module.exports = {
    /**
     * @param {string} string
     * @return {Token[]}
     */
    tokenize (string) {
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
                out.push({ type: TOKEN_TYPES.BRACKET, value: c, start: i });
                i++;
            } else if (c === ",") {
                out.push({ type: TOKEN_TYPES.COMMA, start: i });
                i++;
            } else if (c === "'") {
                let end = string.indexOf("'", i + 1);
                if (end < 0) {
                    throw new Error("Unterminated String: " + string.substring(i));
                }
                while (string[end-1] === "\\") {
                    end = string.indexOf("'", end + 1);
                }
                const str = string.substring(i + 1, end).replace(/\\'/g, "'");
                out.push({ type: TOKEN_TYPES.STRING, value: str, start: i });
                i = end + 1;
            } else if (c === "\"") {
                const end = string.indexOf("\"", i + 1);
                if (end < 0) {
                    throw new Error("Unterminated Name: " + string.substring(i));
                }
                const str = string.substring(i + 1, end);
                out.push({ type: TOKEN_TYPES.NAME, value: str, start: i });
                i = end + 1;
            } else if (/^[-\d]/.test(c)) {
                const r = /^(?:0x[0-9a-f]+|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i;
                const ss = string.substr(i);
                const m = r.exec(ss);

                if (m) {
                    let value = m[0];
                    // Two numbers back-to-back probably means something like '5-2'
                    if (prevToken().type === TOKEN_TYPES.NUMBER && value[0] === "-") {
                        out.push({ type: TOKEN_TYPES.OPERATOR, value: "-", start: i });
                        value = value.substr(1);
                        i++;
                    }

                    out.push({ type: TOKEN_TYPES.NUMBER, value, start: i });
                    i += value.length;
                }
                else if (c === "-") {
                    out.push({ type: TOKEN_TYPES.OPERATOR, value: "-", start: i });
                    i += 1;
                }
                else throw new Error(`Unrecognised number: '${ss.substr(0, 10)}' at ${i}`);
            } else if (c === ":") {
                const re = /[a-z0-9_]+/gi;
                re.lastIndex = i;
                const match = re.exec(string);
                if (!match) throw Error("Tokenizer thought it was getting a param");
                out.push({ type: TOKEN_TYPES.PARAM, value: match[0], start: i });
                i += match[0].length + 1;
            } else {
                const ss = string.substr(i);

                let m = /^(?:SELECT|FROM|WHERE|ORDER BY|LIMIT|GROUP BY|OFFSET|HAVING|EXPLAIN|WITH|WINDOW|VALUES|AS|USING|ON|LEFT|INNER|OVER|PARTITION BY|DISTINCT|FILTER|WITHIN GROUP|ASC|DESC|ROWS|RANGE|GROUPS|UNBOUNDED|PRECEDING|FOLLOWING|CURRENT ROW|FORMAT)\b/i.exec(ss);
                if (m) {
                    out.push({ type: TOKEN_TYPES.KEYWORD, value: m[0].toUpperCase(), start: i });
                    i += m[0].length;
                    continue;
                }

                m = /^(?:UNION(?: ALL)?|INTERSECT|EXCEPT)\b/i.exec(ss);
                if (m) {
                    out.push({ type: TOKEN_TYPES.QUERY_OPERATOR, value: m[0].toUpperCase(), start: i });
                    i += m[0].length;
                    continue;
                }

                // subtract is dealt with as part of the number parsing
                m = /^([<>+=!*\/|%?]+|IS(?: NOT)? NULL\b|(?:NOT )?LIKE\b|(?:NOT )?REGEXP\b|(?:NOT )?IN\b|NOT\b|AND\b|OR\b|BETWEEN\b)/i.exec(ss);
                if (m) {
                    let type = TOKEN_TYPES.OPERATOR;

                    if (m[0] === "*" &&
                        // SELECT *; COUNT(*) etc.
                        (prevToken().type === TOKEN_TYPES.KEYWORD ||
                        (prevToken().type === TOKEN_TYPES.BRACKET && prevToken().value === "(") ||
                        prevToken().type === TOKEN_TYPES.COMMA)
                    ) {
                        type = TOKEN_TYPES.NAME;
                    }

                    out.push({ type, value: m[0], start: i });
                    i += m[0].length;
                    continue;
                }

                m = /^(TRUE|FALSE|NULL|NOW|PI)/i.exec(ss);
                if (m) {
                    out.push({ type: TOKEN_TYPES.CONSTANT, value: m[0].toUpperCase(), start: i });
                    i += m[0].length;
                    continue;
                }

                m = /^([a-z_][a-z0-9_\.\*]*)/i.exec(ss);
                //                      ^ Asterisk as in: Table.*
                if (m) {
                    out.push({ type: TOKEN_TYPES.NAME, value: m[0], start: i });
                    i += m[0].length;
                    continue;
                }

                throw new Error(`Unrecognised input: '${ss.substr(0, 10)}' at ${i}`);
            }
        }

        return out;
    },

    TOKEN_TYPES,
    DEBUG_TOKEN_TYPES,
}