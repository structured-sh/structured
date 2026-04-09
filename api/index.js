/**
 * Structured Memory API
 * Main entry point and router — Hono-based.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { initDb, closeDb } from './db/init.js';
import { listMemories, getMemory, createMemory, updateMemory, deleteMemory } from './db/memories.js';
import { putDocument, getDocument, listDocuments, listCollections, deleteDocument, deleteCollection, queryDocuments } from './db/documents.js';
import { getIngestBuffer } from './services/ingest.js';
import { executeQuery, previewMemory, closeDuckDb } from './services/query.js';
import { LocalStorage } from './storage/local.js';
import { authMiddleware } from './middleware/auth.js';
import { getActiveApiKey, rotateApiKey } from './db/settings.js';
import { login, validateSession, isDashboardAuthEnabled } from './services/auth.js';
import { handleSSE, handleMessage } from './mcp/handler.js';

const app = new Hono();

// Config
const PORT = parseInt(process.env.PORT || '3001', 10);
const ENV_API_KEY = process.env.API_KEY || null;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || null;
const STORAGE_PATH = process.env.STORAGE_PATH || './data/parquet';

// Returns active key (DB overrides env — allows zero-restart rotation)
function currentApiKey() { return getActiveApiKey(ENV_API_KEY); }

// Initialize
const storage = new LocalStorage(STORAGE_PATH);
const buffer = getIngestBuffer(storage);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
}));

app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    if (c.req.path === '/health') return next();
    if (c.req.path === '/sse' || c.req.path === '/messages') return next();

    // Dashboard auth routes — skip API key check
    if (c.req.path.startsWith('/auth/')) return next();

    const auth = authMiddleware(c.req.raw, currentApiKey());
    if (!auth.ok) return auth.response;

    return next();
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        service: 'structured-api',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
    });
});

// ── Memories CRUD ─────────────────────────────────────────────────────────────

app.get('/memories', (c) => {
    const memories = listMemories();
    return c.json({ memories });
});

app.get('/memories/:name', (c) => {
    const memory = getMemory(c.req.param('name'));
    if (!memory) return c.json({ error: 'Memory not found' }, 404);
    memory.fields = JSON.parse(memory.fields);
    return c.json(memory);
});

app.post('/memories', async (c) => {
    try {
        const body = await c.req.json();
        const memory = createMemory(body);
        memory.fields = JSON.parse(memory.fields);
        return c.json(memory, 201);
    } catch (err) {
        if (err.message?.includes('UNIQUE constraint')) {
            return c.json({ error: 'Memory with this name already exists' }, 409);
        }
        return c.json({ error: err.message }, 400);
    }
});

app.put('/memories/:name', async (c) => {
    try {
        const body = await c.req.json();
        const memory = updateMemory(c.req.param('name'), body);
        if (!memory) return c.json({ error: 'Memory not found' }, 404);
        memory.fields = JSON.parse(memory.fields);
        return c.json(memory);
    } catch (err) {
        return c.json({ error: err.message }, 400);
    }
});

app.delete('/memories/:name', async (c) => {
    const name = c.req.param('name');
    const deleted = deleteMemory(name);
    if (!deleted) return c.json({ error: 'Memory not found' }, 404);
    try { await buffer.flush(name); } catch { }
    return c.json({ deleted: true, name });
});

// ── Write Data ────────────────────────────────────────────────────────────────

app.post('/memories/:name/write', async (c) => {
    const name = c.req.param('name');
    const memory = getMemory(name);
    if (!memory) return c.json({ error: `Memory "${name}" not found. Create it first.` }, 404);

    try {
        const body = await c.req.json();

        if (!body.data || !Array.isArray(body.data)) {
            return c.json({ error: 'data must be an array of records' }, 400);
        }
        if (body.data.length === 0) {
            return c.json({ error: 'data array is empty' }, 400);
        }

        const fields = JSON.parse(memory.fields);
        const result = await buffer.ingest(name, body.data, fields, memory.schema_mode);

        return c.json({
            accepted: result.accepted,
            buffered: result.buffered,
            flushed: result.flushed,
            memory: name,
        });
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

// ── Flush ─────────────────────────────────────────────────────────────────────

app.post('/memories/:name/flush', async (c) => {
    const name = c.req.param('name');
    try {
        const result = await buffer.flush(name);
        return c.json({ ...result, memory: name });
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

app.post('/flush', async (c) => {
    try {
        const results = await buffer.flushAll();
        return c.json({ flushed: results });
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

// ── Query ─────────────────────────────────────────────────────────────────────

app.post('/query', async (c) => {
    try {
        const body = await c.req.json();
        if (!body.sql) return c.json({ error: 'sql is required' }, 400);
        const result = await executeQuery(body.sql, STORAGE_PATH);
        return c.json(result);
    } catch (err) {
        return c.json({ error: err.message }, 400);
    }
});

// ── Preview ───────────────────────────────────────────────────────────────────

app.get('/memories/:name/preview', async (c) => {
    const name = c.req.param('name');
    const limit = parseInt(c.req.query('limit') || '10', 10);
    try {
        const result = await previewMemory(name, STORAGE_PATH, limit);
        return c.json({ memory: name, ...result });
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

// ── Files ─────────────────────────────────────────────────────────────────────

app.get('/memories/:name/files', async (c) => {
    const name = c.req.param('name');
    try {
        const listed = await storage.list({ prefix: `${name}/` });
        return c.json({
            memory: name,
            file_count: listed.objects.length,
            files: listed.objects.map(o => ({
                path: o.key,
                size: o.size,
                uploaded_at: o.uploaded.toISOString(),
            })),
        });
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

app.get('/files/*', async (c) => {
    const path = c.req.path.replace('/files/', '');
    if (!path) return c.json({ error: 'File path required' }, 400);

    try {
        const file = await storage.get(path);
        if (!file) return c.json({ error: 'File not found' }, 404);

        return new Response(file.body, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

// ── Documents (NoSQL) ─────────────────────────────────────────────────────────

app.post('/documents', async (c) => {
    try {
        const body = await c.req.json();
        const doc = putDocument(body);
        return c.json(doc, 201);
    } catch (err) {
        return c.json({ error: err.message }, 400);
    }
});

app.get('/documents/collections', (c) => {
    const collections = listCollections();
    return c.json({ collections });
});

app.get('/documents/:collection', (c) => {
    const collection = c.req.param('collection');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const docs = listDocuments(collection, { limit, offset });
    return c.json({ collection, documents: docs, count: docs.length });
});

app.get('/documents/:collection/:id', (c) => {
    const doc = getDocument(c.req.param('id'));
    if (!doc) return c.json({ error: 'Document not found' }, 404);
    return c.json(doc);
});

app.delete('/documents/:collection/:id', (c) => {
    const deleted = deleteDocument(c.req.param('id'));
    if (!deleted) return c.json({ error: 'Document not found' }, 404);
    return c.json({ deleted: true });
});

// ── Dashboard Auth ────────────────────────────────────────────────────────────

app.get('/auth/status', (c) => {
    return c.json({ auth_enabled: isDashboardAuthEnabled(DASHBOARD_PASSWORD) });
});

app.post('/auth/login', async (c) => {
    try {
        const { password } = await c.req.json();
        const result = login(password, DASHBOARD_PASSWORD);
        return c.json(result);
    } catch (err) {
        return c.json({ error: err.message }, 401);
    }
});

app.get('/auth/me', (c) => {
    const token = c.req.header('X-Session-Token');
    const valid = validateSession(token, DASHBOARD_PASSWORD);
    if (!valid) return c.json({ error: 'Invalid or expired session' }, 401);
    return c.json({ authenticated: true });
});

app.post('/auth/logout', (c) => {
    // Stateless tokens — client just discards; nothing to invalidate server-side
    return c.json({ logged_out: true });
});

// ── API Key Management ───────────────────────────────────────────────────────


app.get('/settings/api-key', (c) => {
    const key = currentApiKey();
    if (!key) return c.json({ key: null, source: 'none' });
    const masked = key.slice(0, 8) + '…' + key.slice(-4);
    const source = getActiveApiKey(null) ? 'db' : 'env';
    return c.json({ masked, source, prefix: key.slice(0, 8) });
});

app.post('/settings/rotate-key', (c) => {
    const newKey = rotateApiKey();
    const masked = newKey.slice(0, 8) + '…' + newKey.slice(-4);
    console.log(`API key rotated → ${masked}`);
    return c.json({ key: newKey, masked, rotated_at: new Date().toISOString() });
});

// ── Buffer Status ─────────────────────────────────────────────────────────────

app.get('/status', (c) => {
    return c.json(buffer.status());
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

async function shutdown() {
    console.log('Shutting down...');
    await buffer.destroy();
    closeDuckDb();
    closeDb();
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ── Start Server ──────────────────────────────────────────────────────────────

async function start() {
    // Init DB (async — sql.js WASM needs await)
    await initDb();

    console.log(`
┌─────────────────────────────────────────┐
│   Structured Memory API                 │
│   http://localhost:${PORT}                 │
│   MCP: http://localhost:${PORT}/sse            │
│                                         │
│   Storage: ${STORAGE_PATH.padEnd(28)}│
│   Auth: ${currentApiKey() ? 'API key required' : 'disabled (dev mode)'}${''.padEnd(currentApiKey() ? 13 : 4)}│
└─────────────────────────────────────────┘
`);

    // Use raw http.createServer to intercept MCP SSE routes.
    // SSEServerTransport needs Node.js IncomingMessage/ServerResponse.
    // Non-MCP routes are passed to Hono via getRequestListener.
    const { createServer } = await import('node:http');
    const { getRequestListener } = await import('@hono/node-server');

    const honoListener = getRequestListener(app.fetch);

    const nodeServer = createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // MCP SSE endpoint — Claude Desktop connects here
        if (req.url === '/sse' && req.method === 'GET') {
            try {
                await handleSSE(req, res);
            } catch (err) {
                console.error('MCP SSE error:', err);
                if (!res.headersSent) { res.writeHead(500); res.end('MCP error'); }
            }
            return;
        }

        // MCP message endpoint
        if (req.url?.startsWith('/messages') && req.method === 'POST') {
            try {
                await handleMessage(req, res);
            } catch (err) {
                console.error('MCP message error:', err);
                if (!res.headersSent) { res.writeHead(500); res.end('MCP error'); }
            }
            return;
        }

        // Everything else → Hono
        honoListener(req, res);
    });

    nodeServer.listen(PORT);
}

start().catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});

export default app;
