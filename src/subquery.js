module.exports = {
    getCTEs,
};

const Query = require('./query');
const { matchInBrackets, queryResultToObjectArray } = require('./util');

/**
 *
 * @param {string} cteList
 * @returns {Promise<{ [name: string ]: any[] }>}
 */
async function getCTEs (cteList, options) {

    /** @type {{ [name: string ]: any[] }} */
    const CTEs = {};

    const cteRegex = /^\s*([a-zA-Z0-9_]+)\s*(?:\(([^)]+)\))? AS\s+/;
    let cteMatch;
    while (cteMatch = cteRegex.exec(cteList)) {
        const name = cteMatch[1];
        const headers = cteMatch[2] && cteMatch[2].split(",").map(v => v.trim());
        const cte = matchInBrackets(cteList.substr(cteMatch[0].length));

        CTEs[name] = queryResultToObjectArray(await Query(cte, options), headers);

        const endIdx = cteMatch[0].length + 2 + cte.length;
        cteList = cteList.substr(endIdx);

        cteList = cteList.replace(/^\s*,\s*/, "");
    }

    return CTEs;
}
