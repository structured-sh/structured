/**
 * Query Service
 * Execute DuckDB SQL queries against stored Parquet files.
 * Uses @duckdb/duckdb-wasm in Node.js blocking mode — pure WASM, no native.
 *
 * DuckDB reads Parquet schemas automatically from the file headers.
 * Memory names are resolved to Parquet glob paths so users can write:
 *   SELECT * FROM user_preferences WHERE key = 'theme'
 */

import { createRequire } from 'module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

let db = null;
let conn = null;

/**
 * Initialize DuckDB WASM (blocking mode for Node.js).
 * Singleton — one instance for the API server.
 */
async function getDuckDb() {
    if (conn) return conn;

    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
    const DUCKDB_DIST = dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'));

    const logger = new duckdb.VoidLogger();
    db = await duckdb.createDuckDB(
        {
            mvp: {
                mainModule: resolve(DUCKDB_DIST, 'duckdb-mvp.wasm'),
                mainWorker: resolve(DUCKDB_DIST, 'duckdb-node-mvp.worker.cjs'),
            },
            eh: {
                mainModule: resolve(DUCKDB_DIST, 'duckdb-eh.wasm'),
                mainWorker: resolve(DUCKDB_DIST, 'duckdb-node-eh.worker.cjs'),
            },
        },
        logger,
        duckdb.NODE_RUNTIME,
    );

    await db.instantiate();
    conn = db.connect();

    return conn;
}

/**
 * Execute a DuckDB SQL query.
 * Memory names in FROM/JOIN are auto-resolved to Parquet glob paths.
 *
 * @param {string} sql - SQL query (e.g., "SELECT * FROM user_preferences WHERE key = 'theme'")
 * @param {string} storagePath - Base path for Parquet files
 * @returns {Promise<{ columns: string[], rows: Object[], rowCount: number }>}
 */
export async function executeQuery(sql, storagePath) {
    const connection = await getDuckDb();
    const resolvedSql = resolveMemoryReferences(sql, resolve(storagePath));

    try {
        const result = connection.query(resolvedSql);
        const rows = result.toArray().map(r => sanitizeRow(r.toJSON()));
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        return { columns, rows, rowCount: rows.length };
    } catch (err) {
        throw new Error(`Query failed: ${err.message}`);
    }
}

/**
 * Convert BigInt and other Arrow types to JSON-safe values.
 */
function sanitizeRow(row) {
    const clean = {};
    for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
            clean[key] = Number(value);
        } else if (value instanceof Uint8Array || value instanceof Int8Array) {
            clean[key] = Array.from(value);
        } else {
            clean[key] = value;
        }
    }
    return clean;
}

/**
 * Preview a memory — get schema + sample rows via DuckDB.
 * DuckDB reads the Parquet schema automatically from file headers.
 *
 * @param {string} memoryName
 * @param {string} storagePath
 * @param {number} [limit=10]
 */
export async function previewMemory(memoryName, storagePath, limit = 10) {
    const connection = await getDuckDb();
    const parquetPath = join(resolve(storagePath), memoryName, '**', '*.parquet');

    try {
        // DuckDB reads schema from Parquet headers — no need to pre-feed it
        const schemaResult = connection.query(
            `DESCRIBE SELECT * FROM read_parquet('${parquetPath}')`
        );
        const schema = schemaResult.toArray().map(r => {
            const obj = r.toJSON();
            return { name: obj.column_name, type: obj.column_type };
        });

        // Count total rows
        const countResult = connection.query(
            `SELECT COUNT(*) as total FROM read_parquet('${parquetPath}')`
        );
        const totalRows = countResult.toArray()[0]?.toJSON()?.total || 0;

        // Get sample
        const sampleResult = connection.query(
            `SELECT * FROM read_parquet('${parquetPath}') LIMIT ${limit}`
        );
        const sample = sampleResult.toArray().map(r => sanitizeRow(r.toJSON()));

        const columns = sample.length > 0 ? Object.keys(sample[0]) : schema.map(s => s.name);

        return {
            schema,
            totalRows: Number(totalRows),
            sample,
            columns,
            rows: sample,
            rowCount: sample.length,
        };
    } catch (err) {
        if (err.message?.includes('No files found') || err.message?.includes('no parquet')) {
            return { schema: [], totalRows: 0, sample: [], columns: [], rows: [], rowCount: 0 };
        }
        throw err;
    }
}

/**
 * Resolve memory name references to Parquet glob paths in SQL.
 * FROM user_preferences → FROM read_parquet('/path/to/user_preferences/**\/*.parquet')
 */
function resolveMemoryReferences(sql, storagePath) {
    return sql.replace(
        /\b(FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_-]*)\b(?!\s*\()/gi,
        (match, keyword, tableName) => {
            const reserved = new Set([
                'read_parquet', 'read_csv', 'read_json', 'generate_series',
                'information_schema', 'pg_catalog', 'unnest', 'range',
                'select', 'where', 'group', 'order', 'limit', 'offset',
                'having', 'values', 'lateral',
            ]);
            if (reserved.has(tableName.toLowerCase())) return match;

            const parquetPath = join(storagePath, tableName, '**', '*.parquet');
            return `${keyword} read_parquet('${parquetPath}')`;
        }
    );
}

/**
 * Close DuckDB.
 */
export function closeDuckDb() {
    if (conn) {
        try { conn.close(); } catch { }
        conn = null;
    }
    // Note: DuckDB WASM blocking mode doesn't have db.terminate()
    db = null;
}
