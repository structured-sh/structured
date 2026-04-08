/**
 * Schema Validation Utilities
 * Pure functions for schema drift detection and validation.
 * Adapted from enrich.sh
 */

export const VALID_SCHEMA_MODES = ['flex', 'evolve', 'strict'];

/**
 * Detect schema drift between a record and field definitions.
 * @param {Object} record - Data record
 * @param {Array} fields - [{ name, type }]
 * @returns {{ newFields: string[], missingFields: string[], typeChanges: Array }}
 */
export function detectSchemaDrift(record, fields) {
    const drift = { newFields: [], missingFields: [], typeChanges: [] };
    if (!fields || fields.length === 0) return drift;

    const definedNames = new Set(fields.map(f => f.name));
    const recordKeys = new Set(Object.keys(record));

    for (const key of recordKeys) {
        if (!definedNames.has(key)) drift.newFields.push(key);
    }
    for (const name of definedNames) {
        if (!recordKeys.has(name)) drift.missingFields.push(name);
    }

    const fieldTypeMap = {};
    for (const f of fields) fieldTypeMap[f.name] = f.type;

    for (const key of recordKeys) {
        if (!definedNames.has(key)) continue;
        const value = record[key];
        if (value === null || value === undefined) continue;

        const expected = fieldTypeMap[key];
        const actual = typeof value;

        const isTypeMismatch =
            ((expected === 'int64' || expected === 'int32') && actual !== 'number') ||
            ((expected === 'float64' || expected === 'float32') && actual !== 'number') ||
            (expected === 'boolean' && actual !== 'boolean') ||
            (expected === 'string' && actual !== 'string') ||
            (expected === 'timestamp' && actual !== 'number');

        if (isTypeMismatch) {
            drift.typeChanges.push({ field: key, expected, actual });
        }
    }

    return drift;
}

/**
 * Check if drift is a violation (new fields or type changes).
 */
export function hasSchemaDrift(drift) {
    return drift.newFields.length > 0 || drift.typeChanges.length > 0;
}

/**
 * Apply schema validation based on mode.
 * @param {Array} records - Data records
 * @param {Array} fields - [{ name, type }]
 * @param {string} schemaMode - flex | evolve | strict
 * @returns {{ accepted: Array, rejected: Array, driftSummary: Object|null }}
 */
export function applySchemaValidation(records, fields, schemaMode) {
    if (schemaMode === 'flex' || !fields || fields.length === 0) {
        return { accepted: records, rejected: [], driftSummary: null };
    }

    const accepted = [];
    const rejected = [];
    const seenNewFields = new Set();
    const seenMissingFields = new Set();
    const seenTypeChanges = new Map();

    for (const record of records) {
        const drift = detectSchemaDrift(record, fields);

        for (const f of drift.newFields) seenNewFields.add(f);
        for (const f of drift.missingFields) seenMissingFields.add(f);
        for (const tc of drift.typeChanges) {
            if (!seenTypeChanges.has(tc.field)) {
                seenTypeChanges.set(tc.field, { expected: tc.expected, actual: tc.actual });
            }
        }

        if (schemaMode === 'strict' && hasSchemaDrift(drift)) {
            rejected.push({
                record,
                reason: { newFields: drift.newFields, typeChanges: drift.typeChanges },
            });
        } else {
            accepted.push(record);
        }
    }

    const hasDrift = seenNewFields.size > 0 || seenMissingFields.size > 0 || seenTypeChanges.size > 0;
    const driftSummary = hasDrift ? {
        newFields: [...seenNewFields],
        missingFields: [...seenMissingFields],
        typeChanges: [...seenTypeChanges.entries()].map(([field, info]) => ({ field, ...info })),
        totalRejected: rejected.length,
    } : null;

    return { accepted, rejected, driftSummary };
}

/**
 * FNV-1a hash for schema identity.
 */
export function hashSchema(fields) {
    const str = fields.map(f => `${f.name}:${f.type}`).join(',');
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
