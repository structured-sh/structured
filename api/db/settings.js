/**
 * Settings DB helpers
 * Key/value config store backed by SQLite.
 */

import { queryAll, run } from './init.js';

export function getSetting(key) {
    const rows = queryAll('SELECT value FROM settings WHERE key = ?', [key]);
    return rows.length > 0 ? rows[0].value : null;
}

export function setSetting(key, value) {
    run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value]
    );
}

export function deleteSetting(key) {
    run('DELETE FROM settings WHERE key = ?', [key]);
}

/**
 * Generate a new API key and store it in the DB.
 * Returns the new key. Old key is immediately invalidated.
 */
export function rotateApiKey() {
    const key = 'sk_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    setSetting('api_key', key);
    return key;
}

/**
 * Get the active API key.
 * Priority: DB setting → STRUCTURED_API_KEY env → API_KEY env → null
 */
export function getActiveApiKey(envKey) {
    return getSetting('api_key') || envKey || null;
}
