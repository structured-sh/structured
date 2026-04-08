/**
 * Database Initialization
 * Sets up SQLite via sql.js (WASM) and provides a synchronous wrapper.
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;
let dbPath = null;

/**
 * Initialize the SQLite database (async, call once at startup).
 * @param {string} [path] - Path to SQLite file
 * @returns {Promise<Object>} - Wrapper with prepare/exec methods
 */
export async function initDb(path) {
    if (db) return db;

    dbPath = path || process.env.DB_PATH || './data/structured.db';
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const SQL = await initSqlJs();

    // Load existing DB or create new
    if (existsSync(dbPath)) {
        const buffer = readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Run schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.run(schema);

    // Save after schema init
    saveDb();

    return db;
}

/**
 * Get the database instance (must call initDb first).
 * @returns {Object}
 */
export function getDb() {
    if (!db) throw new Error('Database not initialized. Call initDb() first.');
    return db;
}

/**
 * Save database to disk.
 */
export function saveDb() {
    if (!db || !dbPath) return;
    const data = db.export();
    writeFileSync(dbPath, Buffer.from(data));
}

/**
 * Close the database.
 */
export function closeDb() {
    if (db) {
        saveDb();
        db.close();
        db = null;
    }
}

/**
 * Helper: Run a query and return all results.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Array<Object>}
 */
export function queryAll(sql, params = []) {
    const stmt = getDb().prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Helper: Run a query and return first result.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Object|undefined}
 */
export function queryOne(sql, params = []) {
    const results = queryAll(sql, params);
    return results[0];
}

/**
 * Helper: Run a statement (INSERT/UPDATE/DELETE).
 * @param {string} sql
 * @param {Array} [params]
 * @returns {{ changes: number }}
 */
export function run(sql, params = []) {
    getDb().run(sql, params);
    const changes = getDb().getRowsModified();
    saveDb();
    return { changes };
}
