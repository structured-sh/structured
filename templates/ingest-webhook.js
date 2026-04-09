/**
 * Template: Webhook Forwarder
 * ─────────────────────────────────────────────────────────────
 * Receive webhooks (Stripe, GitHub, Shopify, etc.) and forward
 * them into Structured Memory for querying later.
 *
 * Usage:
 *   node ingest-webhook.js
 *   # Starts an HTTP server on :3030 that accepts POST /webhook
 *
 * Configure your webhook provider to send to:
 *   http://your-server:3030/webhook
 */

import http from 'http';

const API_URL  = process.env.STRUCTURED_API_URL || 'http://localhost:3001';
const API_KEY  = process.env.STRUCTURED_API_KEY  || 'sk_structured_dev';
const PORT     = process.env.PORT || 3030;
const MEMORY   = process.env.MEMORY_NAME || 'webhooks';
const SOURCE   = process.env.WEBHOOK_SOURCE || 'stripe'; // stripe | github | shopify

// ── Schema ──────────────────────────────────────────────────────
const SCHEMA = {
    name: MEMORY,
    description: `Incoming webhooks from ${SOURCE}`,
    schema_mode: 'flex',
    fields: [
        { name: 'source',     type: 'string' },    // 'stripe', 'github', etc.
        { name: 'event_type', type: 'string' },    // e.g. 'payment_intent.succeeded'
        { name: 'event_id',   type: 'string' },    // provider's event ID (idempotency)
        { name: 'timestamp',  type: 'timestamp' },
        { name: 'payload',    type: 'string' },    // full JSON blob
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

async function ensureMemory() {
    const existing = await api('GET', `/memories/${MEMORY}`);
    if (!existing.error) return;
    await api('POST', '/memories', SCHEMA);
    console.log(`Created memory: ${MEMORY}`);
}

// ── Event type extraction per source ─────────────────────────────
function extractEventType(source, body) {
    switch (source) {
        case 'stripe':   return body.type;                         // e.g. 'payment_intent.succeeded'
        case 'github':   return body.action ? `${body.zen ? 'ping' : 'push'}.${body.action}` : 'push';
        case 'shopify':  return body.topic || body.event;
        default:         return body.event || body.type || 'unknown';
    }
}

function extractEventId(source, body, headers) {
    switch (source) {
        case 'stripe':  return body.id;
        case 'github':  return headers['x-github-delivery'];
        case 'shopify': return body.id?.toString();
        default:        return crypto.randomUUID();
    }
}

// ── HTTP server ──────────────────────────────────────────────────
async function startServer() {
    await ensureMemory();

    const server = http.createServer(async (req, res) => {
        if (req.method !== 'POST' || req.url !== '/webhook') {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const headers = req.headers;

                const record = {
                    source: SOURCE,
                    event_type: extractEventType(SOURCE, payload),
                    event_id:   extractEventId(SOURCE, payload, headers),
                    timestamp:  Date.now(),
                    payload:    body, // raw JSON string
                };

                await api('POST', `/memories/${MEMORY}/write`, { data: [record] });
                console.log(`✓ ${record.event_type}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ received: true }));
            } catch (err) {
                console.error('Error processing webhook:', err.message);
                res.writeHead(400);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    });

    server.listen(PORT, () => {
        console.log(`Webhook receiver listening on :${PORT}`);
        console.log(`Source: ${SOURCE} → Memory: ${MEMORY}`);
        console.log(`API: ${API_URL}`);
    });
}

// ── Query examples (run after collecting some webhooks) ──────────
//
//   # All events in last 24h
//   SELECT event_type, COUNT(*) as n
//   FROM webhooks
//   WHERE timestamp > now() - INTERVAL '1 day'
//   GROUP BY event_type ORDER BY n DESC
//
//   # Stripe revenue (requires parsing payload JSON)
//   SELECT COUNT(*) as payments,
//          SUM(json_extract_string(payload, '$.data.object.amount')::int) / 100.0 as total_usd
//   FROM webhooks
//   WHERE event_type = 'payment_intent.succeeded'

startServer();
