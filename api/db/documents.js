/**
 * Documents Database Queries
 * NoSQL-style key/value JSON document store.
 */

import { queryAll, queryOne, run } from './init.js';
import { randomUUID } from 'node:crypto';

/** Store a document (upsert). */
export function putDocument({ id, collection, data, metadata = null }) {
    if (!collection || typeof collection !== 'string') throw new Error('collection is required');
    if (!data || typeof data !== 'object') throw new Error('data must be an object');

    const docId = id || randomUUID();
    const dataJson = JSON.stringify(data);
    const metaJson = metadata ? JSON.stringify(metadata) : null;

    run(
        `INSERT INTO documents (id, collection, data, metadata) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            collection = excluded.collection,
            data = excluded.data,
            metadata = excluded.metadata,
            updated_at = datetime('now')`,
        [docId, collection, dataJson, metaJson]
    );

    return getDocument(docId);
}

/** Get a document by ID. */
export function getDocument(id) {
    const doc = queryOne('SELECT * FROM documents WHERE id = ?', [id]);
    if (doc) {
        doc.data = JSON.parse(doc.data);
        if (doc.metadata) doc.metadata = JSON.parse(doc.metadata);
    }
    return doc;
}

/** List documents in a collection. */
export function listDocuments(collection, { limit = 100, offset = 0 } = {}) {
    const docs = queryAll(
        'SELECT * FROM documents WHERE collection = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [collection, Math.min(limit, 1000), offset]
    );
    return docs.map(doc => {
        doc.data = JSON.parse(doc.data);
        if (doc.metadata) doc.metadata = JSON.parse(doc.metadata);
        return doc;
    });
}

/** List all document collections. */
export function listCollections() {
    return queryAll('SELECT collection, COUNT(*) as doc_count FROM documents GROUP BY collection ORDER BY collection');
}

/** Delete a document by ID. */
export function deleteDocument(id) {
    const result = run('DELETE FROM documents WHERE id = ?', [id]);
    return result.changes > 0;
}

/** Delete all documents in a collection. */
export function deleteCollection(collection) {
    const result = run('DELETE FROM documents WHERE collection = ?', [collection]);
    return result.changes;
}

/** Search documents by JSON field value. */
export function queryDocuments(collection, jsonPath, value) {
    const docs = queryAll(
        `SELECT * FROM documents WHERE collection = ? AND json_extract(data, ?) = ? ORDER BY created_at DESC LIMIT 100`,
        [collection, jsonPath, value]
    );
    return docs.map(doc => {
        doc.data = JSON.parse(doc.data);
        if (doc.metadata) doc.metadata = JSON.parse(doc.metadata);
        return doc;
    });
}
