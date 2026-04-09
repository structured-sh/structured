/**
 * Template: App Analytics Ingest
 * ─────────────────────────────────────────────────────────────
 * Send events from your mobile or web app to Structured Memory.
 * Copy and adapt this for your app.
 *
 * Usage:
 *   node ingest-app-analytics.js
 *
 * Or import and call track() from your app code.
 */

const API_URL = process.env.STRUCTURED_API_URL || 'http://localhost:3001';
const API_KEY  = process.env.STRUCTURED_API_KEY  || 'sk_structured_dev';
const MEMORY   = 'app_events';

// ── Schema ──────────────────────────────────────────────────────
// Define the shape of your events. Change fields to match your app.
const SCHEMA = {
    name: MEMORY,
    description: 'Mobile and web app analytics events',
    schema_mode: 'flex', // flex = accept any extra fields too
    fields: [
        { name: 'event',      type: 'string' },    // e.g. 'install', 'scan', 'purchase'
        { name: 'user_id',    type: 'string' },    // anonymous or authenticated user ID
        { name: 'session_id', type: 'string' },    // session UUID
        { name: 'platform',   type: 'string' },    // 'ios', 'android', 'web'
        { name: 'app_version',type: 'string' },    // '1.2.3'
        { name: 'timestamp',  type: 'timestamp' }, // unix ms
        { name: 'properties', type: 'string' },    // JSON blob for extra props
    ],
};

// ── API helper ──────────────────────────────────────────────────
async function api(method, path, body) {
    const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

// ── Setup ────────────────────────────────────────────────────────
async function ensureMemory() {
    const existing = await api('GET', `/memories/${MEMORY}`);
    if (!existing.error) return; // already exists
    const result = await api('POST', '/memories', SCHEMA);
    console.log('Created memory:', result.name);
}

// ── Track ────────────────────────────────────────────────────────
export async function track(event, userId, props = {}) {
    const { platform, app_version, session_id, ...extra } = props;
    const record = {
        event,
        user_id: userId,
        session_id: session_id || crypto.randomUUID(),
        platform: platform || 'unknown',
        app_version: app_version || '0.0.0',
        timestamp: Date.now(),
        properties: JSON.stringify(extra),
    };
    return api('POST', `/${MEMORY}/write`, { data: [record] });
}

// ── Example usage ────────────────────────────────────────────────
//
// import { track } from './ingest-app-analytics.js';
//
// await track('install',  'user_abc', { platform: 'ios', app_version: '1.0.0' });
// await track('scan',     'user_abc', { platform: 'ios', item_id: 'LEGO-42083' });
// await track('purchase', 'user_abc', { platform: 'ios', amount_usd: 4.99 });
//
// Then query with DuckDB:
//   SELECT event, COUNT(*) as n, COUNT(DISTINCT user_id) as users
//   FROM app_events
//   WHERE timestamp > now() - INTERVAL '30 days'
//   GROUP BY event ORDER BY n DESC

// ── CLI demo (run directly to test) ───────────────────────────────
if (process.argv[1] === new URL(import.meta.url).pathname) {
    await ensureMemory();
    const demo = [
        ['install',  'user_001', { platform: 'ios', app_version: '1.0.0' }],
        ['scan',     'user_001', { platform: 'ios', item_id: 'LEGO-42083' }],
        ['purchase', 'user_001', { platform: 'ios', amount_usd: 4.99 }],
        ['install',  'user_002', { platform: 'android', app_version: '1.0.0' }],
        ['scan',     'user_002', { platform: 'android', item_id: 'LEGO-10255' }],
    ];
    for (const [event, userId, props] of demo) {
        await track(event, userId, props);
        console.log(`✓ ${event} — ${userId}`);
    }
    await api('POST', `/${MEMORY}/flush`);
    console.log('\nFlushed to Parquet. Try querying:');
    console.log(`  curl -X POST ${API_URL}/query \\`);
    console.log(`    -H "Authorization: Bearer ${API_KEY}" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"sql": "SELECT event, COUNT(*) as n FROM app_events GROUP BY event"}'`);
}
