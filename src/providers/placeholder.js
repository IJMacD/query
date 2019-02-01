const Parser = require('../parser');
const Query = require('../query');

module.exports = QueryExecutor;

const API_ROOT = `https://jsonplaceholder.typicode.com/`;

/**
 *
 * @param {string} query
 * @param {{ debug?: boolean }} options
 * @returns {Promise<any[][]>}
 */
async function QueryExecutor (query, { debug } = {}) {
    return Query(query, {
        callbacks: {
            primaryTable,
            afterJoin,
            beforeJoin,
        },
        userFunctions: {
        }
    });
}

/**
 * @typedef {import ('../parse').ParsedTable} ParsedTable
 */

/**
 * @typedef {import ('../parse').Node} Node
 */

/**
 * @this {QueryContext}
 * @param {ParsedTable} table
 * @returns {Promise<any[]>}
 */
async function primaryTable (table) {
    switch (table.name) {
        case "Posts":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const post = await getJSON(`${API_ROOT}posts/${whereID}`);
                return [ post ];
            }

            return getJSON(`${API_ROOT}posts`);
        }
        case "Comments":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const comment = await getJSON(`${API_ROOT}comments/${whereID}`);
                return [ comment ];
            }

            return getJSON(`${API_ROOT}comments`);
        }
        case "Albums":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const album = await getJSON(`${API_ROOT}albums/${whereID}`);
                return [ album ];
            }

            return getJSON(`${API_ROOT}albums`);
        }
        case "Photos":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const photo = await getJSON(`${API_ROOT}photos/${whereID}`);
                return [ photo ];
            }

            return getJSON(`${API_ROOT}photos`);
        }
        case "Todos":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const todo = await getJSON(`${API_ROOT}todos/${whereID}`);
                return [ todo ];
            }

            return getJSON(`${API_ROOT}todos`);
        }
        case "Users":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const user = await getJSON(`${API_ROOT}users/${whereID}`);
                return [ user ];
            }

            return getJSON(`${API_ROOT}users`);
        }
        default:
            throw new Error("Table not recognised: `" + table.name + "`");
    }
}

/** @typedef {import ('../query').ResultRow} ResultRow */
/** @typedef {import ('../query').QueryContext} QueryContext */

/**
 * @this {QueryContext}
 * @param {ParsedTable} table
 * @param {ResultRow[]} rows
 */
async function afterJoin (table, rows) {
    switch (table.name) {
    }
}

/**
 * @this {QueryContext}
 * @param {ParsedTable} table
 * @param {ResultRow[]} rows
 */
async function beforeJoin (table, rows) {
    switch (table.name) {
        case 'Users':
            const postsTable = this.findTable("Posts");
            if (postsTable) {
                table.join = "Users";
                table.predicate = Parser.parseString(`${table.join}.id = ${postsTable.join}.userId`);
            }
            break;
    }
}

async function getJSON (url) {
  const r = await fetch(url);
  return await r.json();
}