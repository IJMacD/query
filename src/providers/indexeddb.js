const { getColumnTypes } = require('../util');

if (typeof window === "undefined" || !window.indexedDB) {
    throw Error("IndexedDB is not supported");
}

async function primaryTable (table) {
    const db = await openDB();

    const result = await getTable(db, table.name);

    db.close();

    if (typeof result !== "undefined") {
        return result;
    }

    throw new Error(`Table not recognised: ${table.name}`);
}

async function getTables () {
    const db = await openDB();

    const tables = Array.from(db.objectStoreNames);

    db.close();

    return tables;
}

/** @type {import('../../index').Schema} */
module.exports = {
    name: "IndexedDB",
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
 * @returns {Promise<IDBDatabase>}
 */
function openDB () {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open("ijmacd-query");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * @param {(db: IDBDatabase) => void} callback
 * @returns {Promise<IDBDatabase>}
 */
async function upgradeDB (callback) {
    const db = await openDB();
    const { version } = db;
    db.close();

    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open("ijmacd-query", version + 1);
        request.onupgradeneeded = () => callback(request.result);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 *
 * @param {IDBDatabase} db
 * @param {string} name
 */
function getTable (db, name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(name);
        const objStore = transaction.objectStore(name);
        const request = objStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 *
 * @param {string} name
 * @param {string} [keyPath]
 */
function createTable (name, keyPath) {
    if (keyPath) {
        return upgradeDB(db => db.createObjectStore(name, { keyPath }));
    }
    return upgradeDB(db => db.createObjectStore(name, { autoIncrement: true }));
}

/**
 * @param {string} name
 */
function dropTable (name) {
    return upgradeDB(db => db.deleteObjectStore(name));
}

/**
 *
 * @param {string} name
 * @param {object} row
 * @param {"error"|"ignore"|"update"} duplicate
 * @return {Promise<IDBValidKey>}
 */
async function insertIntoTable (name, row, duplicate="error") {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(name, "readwrite");
        const objStore = transaction.objectStore(name);

        const request = objStore.add(row);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            if (duplicate === "error") {
                reject(request.error);
            } else if (duplicate === "update") {
                reject(new Error("ON DUPLICATE KEY UPDATE not implemented yet"));
            }
            else {
                resolve();
            }
        }
    }).then((key) => (db.close(),key));
}

/**
 *
 * @param {string} name
 * @param {(data: object) => object} update
 * @param {(data: object) => boolean} where
 * @return {Promise}
 */
async function updateTable (name, update, where) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(name, "readwrite");
        const objStore = transaction.objectStore(name);
        const cursorRequest = objStore.openCursor();

        cursorRequest.onsuccess = e => {
            const cursor = cursorRequest.result;
            let failed = false;
            if (cursor && !failed) {
                if (where(cursor.value)) {
                    const updateRequest = cursor.update(update(cursor.value));

                    updateRequest.onerror = () => {
                        reject(updateRequest.error);
                        transaction.abort();
                        failed = true;
                    }
                }

                cursor.continue();
            }
            resolve();
        }
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
}

/**
 *
 * @param {string} name
 * @param {(data: object) => boolean} where
 * @return {Promise}
 */
async function deleteFromTable (name, where) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(name, "readwrite");
        const objStore = transaction.objectStore(name);
        const cursorRequest = objStore.openCursor();

        cursorRequest.onsuccess = e => {
            const cursor = cursorRequest.result;
            let failed = false;
            if (cursor && !failed) {
                if (where(cursor.value)) {
                    const deleteRequest = cursor.delete();

                    deleteRequest.onerror = () => {
                        reject(deleteRequest.error);
                        transaction.abort();
                        failed = true;
                    }
                }

                cursor.continue();
            }
            resolve();
        }
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
}