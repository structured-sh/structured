/**
 * Flush Service
 * Transforms buffered records to Parquet and writes to storage.
 * Uses tiny-parquet for WASM-based Parquet encoding.
 */

import { writeParquet } from 'tiny-parquet/writer';
import { applySchemaValidation } from '../utils/schema.js';
import { updateMemoryStats, trackUsage } from '../db/memories.js';

/**
 * Null coercion — tiny-parquet WASM crashes on null/undefined.
 * Coerce to type-appropriate zero values.
 */
function coerceNull(type) {
    switch (type) {
        case 'int32':
        case 'int64':
        case 'timestamp':
            return 0;
        case 'float32':
        case 'float64':
            return 0.0;
        case 'boolean':
            return false;
        default:
            return '';
    }
}

/**
 * Coerce a value to the expected type.
 */
function coerceValue(value, type) {
    if (value === null || value === undefined) return coerceNull(type);

    switch (type) {
        case 'int32':
        case 'int64':
            return typeof value === 'number' ? Math.trunc(value) : (parseInt(value, 10) || 0);
        case 'float32':
        case 'float64':
            return typeof value === 'number' ? value : (parseFloat(value) || 0.0);
        case 'boolean':
            return Boolean(value);
        case 'timestamp':
            return typeof value === 'number' ? value : (new Date(value).getTime() || Date.now());
        case 'string':
        default:
            return typeof value === 'string' ? value : String(value);
    }
}

/**
 * Transform records to columnar data for Parquet.
 * @param {Array} records - Row data
 * @param {Array} fields - [{ name, type }]
 * @returns {{ schema: Array, columnData: Object }}
 */
function transformToColumns(records, fields) {
    // Always add _ingested_at metadata column
    const schema = [
        { name: '_ingested_at', type: 'timestamp' },
        ...fields,
    ];

    const columnData = {};
    for (const col of schema) {
        columnData[col.name] = [];
    }

    const now = Date.now();

    for (const record of records) {
        columnData['_ingested_at'].push(now);

        for (const field of fields) {
            const value = record[field.name];
            columnData[field.name].push(coerceValue(value, field.type));
        }
    }

    return { schema, columnData };
}

/**
 * Flush records to Parquet and write to storage.
 * @param {Object} storage - Storage adapter (LocalStorage or S3Client)
 * @param {string} memoryName - Memory name
 * @param {Array} records - Data records
 * @param {Array} fields - [{ name, type }]
 * @param {string} schemaMode - flex | evolve | strict
 * @returns {Promise<{ bytesWritten: number, accepted: number, rejected: number, path: string }>}
 */
export async function flushRecords(storage, memoryName, records, fields, schemaMode = 'flex') {
    if (!records || records.length === 0) {
        return { bytesWritten: 0, accepted: 0, rejected: 0, path: null };
    }

    // Apply schema validation
    const validation = applySchemaValidation(records, fields, schemaMode);
    const { accepted, rejected, driftSummary } = validation;

    if (driftSummary) {
        console.log(`Schema drift for ${memoryName}:`,
            `new=${driftSummary.newFields.length}`,
            `missing=${driftSummary.missingFields.length}`,
            `type_changes=${driftSummary.typeChanges.length}`,
            `rejected=${driftSummary.totalRejected}`);
    }

    if (accepted.length === 0) {
        return { bytesWritten: 0, accepted: 0, rejected: rejected.length, path: null };
    }

    // Transform to columnar format
    const { schema, columnData } = transformToColumns(accepted, fields);

    // Write Parquet via tiny-parquet WASM
    const parquetBuffer = await writeParquet(schema, columnData, {
        compression: 'snappy',
    });

    // Build storage path
    const path = buildPath(memoryName);

    // Write to storage
    await storage.put(path, parquetBuffer, {
        customMetadata: {
            memory_name: memoryName,
            record_count: String(accepted.length),
            schema_mode: schemaMode,
            created_at: new Date().toISOString(),
        },
    });

    const bytesWritten = parquetBuffer.byteLength;

    // Update stats in DB
    try {
        updateMemoryStats(memoryName, accepted.length, bytesWritten);
        trackUsage(memoryName, accepted.length, bytesWritten);
    } catch (err) {
        console.error('Failed to update stats:', err.message);
    }

    return {
        bytesWritten,
        accepted: accepted.length,
        rejected: rejected.length,
        path,
        driftSummary,
    };
}

/**
 * Build a storage path for a Parquet file.
 * Pattern: {memory}/{year}/{month}/{day}/{timestamp}.parquet
 */
function buildPath(memoryName) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const ts = now.toISOString().replace(/[:.]/g, '-');

    return `${memoryName}/${year}/${month}/${day}/${ts}.parquet`;
}
