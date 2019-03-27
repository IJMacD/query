const { getColumnTypes } = require('../util');

if (typeof window === "undefined" || !window.indexedDB) {
    throw Error("IndexedDB is not supported");
}

const STORE_NAME = "tables";

async function primaryTable (table) {
    const db = await openDB();

    const result = await getTable(db, table.name);

    if (typeof result !== "undefined") {
        return result;
    }

    throw new Error(`Table not recognised: ${table.name}`);
}

async function getTables () {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

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
        createTable: async (name) => {
            const db = await openDB();

            return createTable(db, name);
        },
        insertIntoTable: async (name, data) => {
            const db = await openDB();

            return insertIntoTable(db, name, data);
        },
    },
};

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDB () {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open("ijmacd-query", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore(STORE_NAME);
        }
    });
}

/**
 * 
 * @param {IDBDatabase} db 
 * @param {string} name 
 */
function getTable (db, name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME);
        const objStore = transaction.objectStore(STORE_NAME);
        const request = objStore.get(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 
 * @param {IDBDatabase} db 
 * @param {string} name 
 */
function createTable (db, name, values=[]) {
    if (!Array.isArray(values)) {
        throw RangeError("Values must be an array. Received: " + typeof values);
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const objStore = transaction.objectStore(STORE_NAME);
        const request = objStore.add(values, name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 
 * @param {IDBDatabase} db 
 * @param {string} name 
 */
function updateTable (db, name, values) {
    if (!Array.isArray(values)) {
        throw RangeError("Values must be an array. Received: " + typeof values);
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const objStore = transaction.objectStore(STORE_NAME);
        const request = objStore.put(values, name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 
 * @param {IDBDatabase} db 
 * @param {string} name 
 * @param {any} row
 */
function insertIntoTable (db, name, row) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const objStore = transaction.objectStore(STORE_NAME);
        const request = objStore.get(name);
        request.onsuccess = () => {
            const rows = request.result;

            rows.push(row);

            const insertRequest = objStore.put(rows, name);
            insertRequest.onsuccess = () => resolve(insertRequest.result);
            insertRequest.onerror = () => reject(insertRequest.error);
        };
        request.onerror = () => reject(request.error);
    });
}