/**
 * Ingest Service
 * Buffers incoming records in memory, flushes to Parquet on threshold.
 */

import { flushRecords } from './flush.js';

// Buffer config
const FLUSH_THRESHOLD = 1000;       // Records per memory before auto-flush
const FLUSH_INTERVAL_MS = 30_000;   // 30 seconds max hold time
const MAX_BUFFER_SIZE = 10_000;     // Hard cap per memory

class IngestBuffer {
    constructor(storage) {
        this.storage = storage;
        this.buffers = new Map();    // memoryName → record[]
        this.timers = new Map();     // memoryName → timerId
        this.configs = new Map();    // memoryName → { fields, schema_mode }
    }

    /**
     * Buffer records for a memory.
     * @param {string} memoryName
     * @param {Array} records
     * @param {Array} fields - [{ name, type }]
     * @param {string} schemaMode
     * @returns {{ accepted: number, buffered: number, flushed: boolean }}
     */
    async ingest(memoryName, records, fields, schemaMode = 'flex') {
        if (!this.buffers.has(memoryName)) {
            this.buffers.set(memoryName, []);
        }

        const buf = this.buffers.get(memoryName);

        // Store config for timer-based flush
        this.configs.set(memoryName, { fields, schema_mode: schemaMode });

        // Check hard cap
        if (buf.length + records.length > MAX_BUFFER_SIZE) {
            // Flush current buffer first
            await this.flush(memoryName);
        }

        // Add records to buffer
        buf.push(...records);

        // Reset flush timer
        this._resetTimer(memoryName);

        // Check threshold
        let flushed = false;
        if (buf.length >= FLUSH_THRESHOLD) {
            await this.flush(memoryName);
            flushed = true;
        }

        return {
            accepted: records.length,
            buffered: this.buffers.get(memoryName)?.length || 0,
            flushed,
        };
    }

    /**
     * Flush all buffered records for a memory.
     * @param {string} memoryName
     * @returns {Promise<Object>}
     */
    async flush(memoryName) {
        const buf = this.buffers.get(memoryName);
        if (!buf || buf.length === 0) {
            return { bytesWritten: 0, accepted: 0, rejected: 0 };
        }

        const config = this.configs.get(memoryName);
        if (!config) {
            console.error(`No config for memory ${memoryName} — cannot flush`);
            return { bytesWritten: 0, accepted: 0, rejected: 0 };
        }

        // Take all records from buffer
        const records = buf.splice(0, buf.length);
        this._clearTimer(memoryName);

        try {
            const result = await flushRecords(
                this.storage,
                memoryName,
                records,
                config.fields,
                config.schema_mode,
            );
            return result;
        } catch (err) {
            // On failure, put records back
            console.error(`Flush failed for ${memoryName}:`, err.message);
            buf.unshift(...records);
            throw err;
        }
    }

    /**
     * Flush all memories.
     * @returns {Promise<Object>}
     */
    async flushAll() {
        const results = {};
        for (const memoryName of this.buffers.keys()) {
            try {
                results[memoryName] = await this.flush(memoryName);
            } catch (err) {
                results[memoryName] = { error: err.message };
            }
        }
        return results;
    }

    /**
     * Get buffer status.
     * @returns {Object}
     */
    status() {
        const memories = {};
        for (const [name, buf] of this.buffers) {
            memories[name] = { buffered: buf.length };
        }
        return {
            total_buffered: [...this.buffers.values()].reduce((s, b) => s + b.length, 0),
            memories,
        };
    }

    /** @private */
    _resetTimer(memoryName) {
        this._clearTimer(memoryName);
        const timer = setTimeout(() => {
            this.flush(memoryName).catch(err =>
                console.error(`Timer flush failed for ${memoryName}:`, err.message)
            );
        }, FLUSH_INTERVAL_MS);

        if (timer.unref) timer.unref();
        this.timers.set(memoryName, timer);
    }

    /** @private */
    _clearTimer(memoryName) {
        const timer = this.timers.get(memoryName);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(memoryName);
        }
    }

    /**
     * Graceful shutdown — flush everything.
     */
    async destroy() {
        for (const [, timer] of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();
        await this.flushAll();
    }
}

// Singleton
let instance = null;

export function getIngestBuffer(storage) {
    if (!instance) {
        instance = new IngestBuffer(storage);
    }
    return instance;
}
