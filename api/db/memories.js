/**
 * Memories Database Queries
 * CRUD operations for the memories table.
 */

import { queryAll, queryOne, run } from './init.js';

const VALID_SCHEMA_MODES = ['flex', 'evolve', 'strict'];
const VALID_TYPES = ['string', 'int32', 'int64', 'float32', 'float64', 'boolean', 'timestamp'];

/** List all memories. */
export function listMemories() {
    return queryAll('SELECT * FROM memories ORDER BY created_at DESC');
}

/** Get a specific memory by name. */
export function getMemory(name) {
    return queryOne('SELECT * FROM memories WHERE name = ?', [name]);
}

/**
 * Create a new memory.
 * @param {Object} params
 */
export function createMemory({ name, fields, schema_mode = 'flex', description = null }) {
    if (!name || typeof name !== 'string') throw new Error('name is required');
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('name must be alphanumeric (a-z, 0-9, _, -)');
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
        throw new Error('fields must be a non-empty array of { name, type }');
    }
    for (const field of fields) {
        if (!field.name || !field.type) throw new Error('Each field must have a name and type');
        if (!VALID_TYPES.includes(field.type)) {
            throw new Error(`Invalid type "${field.type}". Valid: ${VALID_TYPES.join(', ')}`);
        }
    }
    if (!VALID_SCHEMA_MODES.includes(schema_mode)) {
        throw new Error(`schema_mode must be one of: ${VALID_SCHEMA_MODES.join(', ')}`);
    }

    run(
        `INSERT INTO memories (name, fields, schema_mode, description) VALUES (?, ?, ?, ?)`,
        [name, JSON.stringify(fields), schema_mode, description]
    );

    return getMemory(name);
}

/** Update an existing memory. */
export function updateMemory(name, updates) {
    const existing = getMemory(name);
    if (!existing) return null;

    const sets = [];
    const values = [];

    if (updates.fields !== undefined) {
        if (!Array.isArray(updates.fields) || updates.fields.length === 0) throw new Error('fields must be a non-empty array');
        for (const field of updates.fields) {
            if (!field.name || !field.type) throw new Error('Each field must have a name and type');
            if (!VALID_TYPES.includes(field.type)) throw new Error(`Invalid type "${field.type}"`);
        }
        sets.push('fields = ?');
        values.push(JSON.stringify(updates.fields));
    }

    if (updates.schema_mode !== undefined) {
        if (!VALID_SCHEMA_MODES.includes(updates.schema_mode)) throw new Error(`Invalid schema_mode`);
        sets.push('schema_mode = ?');
        values.push(updates.schema_mode);
    }

    if (updates.description !== undefined) {
        sets.push('description = ?');
        values.push(updates.description);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = datetime('now')");
    values.push(name);

    run(`UPDATE memories SET ${sets.join(', ')} WHERE name = ?`, values);
    return getMemory(name);
}

/** Delete a memory. */
export function deleteMemory(name) {
    const result = run('DELETE FROM memories WHERE name = ?', [name]);
    return result.changes > 0;
}

/** Update memory stats after flush. */
export function updateMemoryStats(name, eventCount, bytesStored) {
    run(
        `UPDATE memories SET event_count = event_count + ?, bytes_stored = bytes_stored + ?, file_count = file_count + 1, updated_at = datetime('now') WHERE name = ?`,
        [eventCount, bytesStored, name]
    );
}

/** Track daily usage. */
export function trackUsage(memoryName, eventCount, bytesStored) {
    const date = new Date().toISOString().slice(0, 10);
    run(
        `INSERT INTO usage (memory_name, date, event_count, bytes_stored, file_count) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (memory_name, date) DO UPDATE SET
            event_count = event_count + excluded.event_count,
            bytes_stored = bytes_stored + excluded.bytes_stored,
            file_count = file_count + 1`,
        [memoryName, date, eventCount, bytesStored]
    );
}

export { VALID_SCHEMA_MODES, VALID_TYPES };
