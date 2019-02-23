module.exports = {
    callbacks: {
        primaryTable,
        afterJoin,
        beforeJoin,
        getTables: () => [ "Posts", "Comments", "Albums", "Photos", "Todos", "Users" ],
    },
    userFunctions: {
    }
};

const API_ROOT = `https://jsonplaceholder.typicode.com/`;

/**
 * @typedef {import ('../../types').ParsedTable} ParsedTable
 */

/**
 * @typedef {import ('../../types').Node} Node
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
                const post = await getPlaceholderJSON(`posts/${whereID}`);
                return [ post ];
            }

            return getPlaceholderJSON(`posts`);
        }
        case "Comments":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const comment = await getPlaceholderJSON(`comments/${whereID}`);
                return [ comment ];
            }

            return getPlaceholderJSON(`comments`);
        }
        case "Albums":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const album = await getPlaceholderJSON(`albums/${whereID}`);
                return [ album ];
            }

            return getPlaceholderJSON(`albums`);
        }
        case "Photos":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const photo = await getPlaceholderJSON(`photos/${whereID}`);
                return [ photo ];
            }

            return getPlaceholderJSON(`photos`);
        }
        case "Todos":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const todo = await getPlaceholderJSON(`todos/${whereID}`);
                return [ todo ];
            }

            return getPlaceholderJSON(`todos`);
        }
        case "Users":
        {
            const whereID = this.findWhere("id");
            if (whereID) {
                const user = await getPlaceholderJSON(`users/${whereID}`);
                return [ user ];
            }

            return getPlaceholderJSON(`users`);
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
        {
            const postsTable = this.findTable("Posts");
            if (postsTable) {
                // This is an example of setting a predicate and letting the library
                // do a cross join which will then be filtered using this predicate.
                this.setJoinPredicate(table, `${table.join}.id = ${postsTable.join}.userId`);
                // TODO: We're assuming the joined table's join won't change
            }
            break;
        }
        case 'Comments':
        {
            const postsTable = this.findTable("Posts");
            if (postsTable) {
                this.setJoin(table, postsTable);

                /** @type {any[]} */
                const comments = await getPlaceholderJSON(`comments`);

                for (const row of rows) {
                    const post = this.getRowData(row, postsTable);
                    this.setRowData(row, table, comments.filter(c => c.postId === post.id));
                }
            }
            break;
        }
        case 'Posts':
        {

            const usersTable = this.findTable("Users");
            if (usersTable) {
                this.setJoin(table, usersTable);

                /** @type {any[]} */
                const posts = await getPlaceholderJSON(`posts`);

                for (const row of rows) {
                    const user = this.getRowData(row, usersTable);
                    this.setRowData(row, table, posts.filter(p => p.userId === user.id));
                }
                break;
            }

            const commentsTable = this.findTable("Comments");
            if (commentsTable) {
                this.setJoin(table, commentsTable);

                /** @type {any[]} */
                const posts = await getPlaceholderJSON(`posts`);

                for (const row of rows) {
                    const comment = this.getRowData(row, commentsTable);
                    this.setRowData(row, table, posts.find(p => p.id === comment.postId));
                }
                break;
            }

            break;
        }
        case 'Albums':
        {
            const usersTable = this.findTable("Users");
            if (usersTable) {
                this.setJoin(table, usersTable);

                /** @type {any[]} */
                const albums = await getPlaceholderJSON(`albums`);

                for (const row of rows) {
                    const user = this.getRowData(row, usersTable);
                    this.setRowData(row, table, albums.filter(a => a.userId === user.id));
                }
            }
            break;
        }
    }
}

async function getPlaceholderJSON (path) {
    const url = `${API_ROOT}${path}`;
    // console.log(url);
    const r = await fetch(url);
    return await r.json();
}