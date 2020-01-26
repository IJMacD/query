const path = require('path');
const pkg = require('../../package.json');

const fs = require('fs').promises;
const { getColumnTypes } = require('../util');

const DATA_DIR = process.env.IL_DATA_DIR || path.join(`.${pkg.name}/data`);

require('fs').mkdirSync(DATA_DIR, { recursive: true });

/** @type {import('../..').Schema} */
module.exports = {
    name: "FS",
    callbacks: {
        primaryTable,
        getTables,
        getColumns: async (name) => {
            const results = await primaryTable({ name });

            if (!results) return [];

            return getColumnTypes(results[0]);
        },
        createTable,
        insertIntoTable,
        updateTable,
        deleteFromTable,
        dropTable,
    },
};

/**
 * @typedef {import ('../..').ParsedTable} ParsedTable
 */

/**
 * @typedef {import ('../..').Node} Node
 */

/**
 * Converts table name into filename
 * @param {string} name 
 */
function filename(name) {
    return path.join(DATA_DIR, name + ".json");
}

/**
 * @this {QueryContext}
 * @param {{ name: string }} table
 * @returns {Promise<any[]>}
 */
async function primaryTable (table) {
    try {
        return readTable(table.name);
    } catch (e) {
        throw new Error("Table not recognised: `" + table.name + "`");
    }
}

async function getTables () {
    const files = await fs.readdir(DATA_DIR);
    
    return files.filter(f => f.endsWith(".json")).map(f => f.substr(0, f.length - 5));
}

/**
 *
 * @param {string} name
 * @param {string} [key]
 */
function createTable (name, key) {
    return fs.writeFile(filename(name), "");
}

/**
 *
 * @param {string} name
 * @param {object|object[]} rows
 * @param {"error"|"ignore"|"update"} duplicate
 * @return {Promise<number>}
 */
async function insertIntoTable (name, rows, duplicate="ignore") {
    try {
        let data = await readTable(name);
        if (Array.isArray(rows)) {
            data.push(...rows);
        }
        else {
            data.push(rows);
        }
        await fs.writeFile(filename(name), JSON.stringify(data));
        return -1;
    } catch (e) {
        throw new Error("Unable to INSERT INTO table: `" + name + "` " + e);
    }
}

function updateTable () {}

/**
 *
 * @param {string} name
 * @param {(data: object) => boolean} where
 * @return {Promise}
 */
async function deleteFromTable (name, where) {
    try {
        const data = (await readTable(name)).filter(d => !where(d));
        await fs.writeFile(filename(name), JSON.stringify(data));
        return -1;
    } catch (e) {
        throw new Error("Unable to INSERT INTO table: `" + name + "`");
    }
}

function dropTable () {}


async function readTable(name) {
    const file = filename(name);
    const buf = await fs.readFile(file);
    let data;
    if (buf.length === 0) {
        data = [];
    }
    else {
        data = JSON.parse(buf.toString());
        if (!Array.isArray(data)) {
            data = [ data ];
        }
    }
    return data;
}
