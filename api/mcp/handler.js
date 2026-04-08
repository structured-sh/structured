/**
 * MCP SSE Handler
 * Integrates MCP tools directly into the API server via SSE transport.
 * This allows Claude Desktop to connect via "Remote MCP server URL".
 *
 * Endpoints:
 *   GET  /sse       → SSE stream (client connects here)
 *   POST /messages  → Client sends JSON-RPC messages here
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { listMemories, getMemory, createMemory, deleteMemory } from '../db/memories.js';
import { putDocument, getDocument, listDocuments, listCollections } from '../db/documents.js';
import { getIngestBuffer } from '../services/ingest.js';
import { executeQuery, previewMemory } from '../services/query.js';

/**
 * Create a new MCP server with all structured memory tools.
 */
function createMcpServer() {
    const server = new McpServer({
        name: 'structured',
        version: '0.1.0',
    });

    // ── create_memory ─────────────────────────────────────
    server.tool(
        'create_memory',
        'Create a new structured memory with typed fields. This defines a schema for storing structured data as Parquet files.',
        {
            name: z.string().describe('Memory name (alphanumeric, _, -). Example: "user_preferences"'),
            fields: z.array(z.object({
                name: z.string().describe('Field name'),
                type: z.enum(['string', 'int32', 'int64', 'float32', 'float64', 'boolean', 'timestamp']).describe('Field type'),
            })).describe('Array of field definitions'),
            description: z.string().optional().describe('Human-readable description'),
            schema_mode: z.enum(['flex', 'evolve', 'strict']).optional().describe('Schema validation mode'),
        },
        async ({ name, fields, description, schema_mode }) => {
            try {
                const result = createMemory({ name, fields, description, schema_mode });
                const parsedFields = JSON.parse(result.fields);
                return {
                    content: [{
                        type: 'text',
                        text: `✓ Memory "${name}" created with ${parsedFields.length} fields.\n\nSchema:\n${parsedFields.map(f => `  ${f.name}: ${f.type}`).join('\n')}\n\nMode: ${result.schema_mode}`,
                    }],
                };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── list_memories ──────────────────────────────────────
    server.tool(
        'list_memories',
        'List all structured memories with their schemas, record counts, and storage usage.',
        {},
        async () => {
            try {
                const memories = listMemories();
                if (memories.length === 0) {
                    return { content: [{ type: 'text', text: 'No memories found. Create one with create_memory.' }] };
                }
                const lines = memories.map(m => {
                    const fields = JSON.parse(m.fields);
                    return `• ${m.name} (${fields.length} fields, ${m.event_count} records, ${formatBytes(m.bytes_stored)})\n  ${m.description || 'No description'}\n  Mode: ${m.schema_mode}`;
                });
                return { content: [{ type: 'text', text: `Found ${memories.length} memories:\n\n${lines.join('\n\n')}` }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── describe_memory ───────────────────────────────────
    server.tool(
        'describe_memory',
        'Get detailed information about a memory including its schema, stats, and sample data.',
        { name: z.string().describe('Memory name') },
        async ({ name }) => {
            try {
                const memory = getMemory(name);
                if (!memory) return { content: [{ type: 'text', text: `Memory "${name}" not found.` }], isError: true };

                const fields = JSON.parse(memory.fields);
                let preview;
                try {
                    preview = await previewMemory(name, process.env.STORAGE_PATH || './data/parquet', 5);
                } catch { preview = { totalRows: 0, sample: [] }; }

                const lines = [
                    `Memory: ${memory.name}`,
                    `Description: ${memory.description || 'None'}`,
                    `Mode: ${memory.schema_mode}`,
                    `Records: ${memory.event_count}`,
                    `Storage: ${formatBytes(memory.bytes_stored)}`,
                    `Files: ${memory.file_count}`,
                    '', 'Schema:',
                    ...fields.map(f => `  ${f.name}: ${f.type}`),
                ];
                if (preview.sample?.length > 0) {
                    lines.push('', `Sample data (${preview.totalRows} total rows):`, JSON.stringify(preview.sample, null, 2));
                }
                return { content: [{ type: 'text', text: lines.join('\n') }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── write_memory ──────────────────────────────────────
    server.tool(
        'write_memory',
        'Write structured records to a memory. Records are buffered and automatically flushed to Parquet.',
        {
            name: z.string().describe('Memory name'),
            data: z.array(z.record(z.any())).describe('Array of records matching the schema'),
        },
        async ({ name, data }) => {
            try {
                const memory = getMemory(name);
                if (!memory) return { content: [{ type: 'text', text: `Memory "${name}" not found. Create it first.` }], isError: true };

                const fields = JSON.parse(memory.fields);
                const buffer = getIngestBuffer();
                const result = await buffer.ingest(name, data, fields, memory.schema_mode);
                return {
                    content: [{
                        type: 'text',
                        text: `✓ Wrote ${result.accepted} records to "${name}".\nBuffered: ${result.buffered} | Flushed: ${result.flushed ? 'yes' : 'no (buffering)'}`,
                    }],
                };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── query_memory ──────────────────────────────────────
    server.tool(
        'query_memory',
        'Run a DuckDB SQL query across memories. Use memory names as table names. Example: SELECT * FROM user_preferences WHERE key = \'theme\'',
        { sql: z.string().describe('DuckDB SQL query') },
        async ({ sql }) => {
            try {
                const storagePath = process.env.STORAGE_PATH || './data/parquet';
                const result = await executeQuery(sql, storagePath);
                if (result.rows.length === 0) {
                    return { content: [{ type: 'text', text: `Query returned 0 rows.\n\nSQL: ${sql}` }] };
                }
                const header = result.columns.join(' | ');
                const sep = result.columns.map(c => '-'.repeat(Math.max(c.length, 3))).join('-+-');
                const rows = result.rows.map(r => result.columns.map(c => String(r[c] ?? '')).join(' | '));
                return { content: [{ type: 'text', text: `${result.rowCount} rows:\n\n${header}\n${sep}\n${rows.join('\n')}` }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Query error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── store_document ────────────────────────────────────
    server.tool(
        'store_document',
        'Store an unstructured JSON document in a collection.',
        {
            collection: z.string().describe('Collection name'),
            data: z.record(z.any()).describe('JSON data'),
            id: z.string().optional().describe('Document ID'),
        },
        async ({ collection, data, id }) => {
            try {
                const result = putDocument({ collection, data, id });
                return { content: [{ type: 'text', text: `✓ Document stored in "${collection}" with ID: ${result.id}` }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── get_document ──────────────────────────────────────
    server.tool(
        'get_document',
        'Retrieve a document by its ID.',
        { id: z.string().describe('Document ID') },
        async ({ id }) => {
            try {
                const doc = getDocument(id);
                if (!doc) return { content: [{ type: 'text', text: 'Document not found.' }], isError: true };
                return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── flush_memory ──────────────────────────────────────
    server.tool(
        'flush_memory',
        'Force flush buffered records to Parquet.',
        { name: z.string().optional().describe('Memory name, or omit to flush all') },
        async ({ name }) => {
            try {
                const buffer = getIngestBuffer();
                if (name) {
                    const result = await buffer.flush(name);
                    return { content: [{ type: 'text', text: `✓ Flushed "${name}": ${result.accepted || 0} records` }] };
                } else {
                    const results = await buffer.flushAll();
                    return { content: [{ type: 'text', text: `✓ All flushed: ${JSON.stringify(results)}` }] };
                }
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    // ── delete_memory ─────────────────────────────────────
    server.tool(
        'delete_memory',
        'Delete a memory and all its data.',
        { name: z.string().describe('Memory name') },
        async ({ name }) => {
            try {
                const deleted = deleteMemory(name);
                if (!deleted) return { content: [{ type: 'text', text: `Memory "${name}" not found.` }], isError: true };
                return { content: [{ type: 'text', text: `✓ Memory "${name}" deleted.` }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    return server;
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── SSE Transport Handler ─────────────────────────────────────────────────────

let mcpServer = null;
const transports = new Map(); // sessionId → transport

/**
 * Handle SSE connection (GET /sse)
 * Claude Desktop connects here to establish the SSE stream.
 */
export async function handleSSE(nodeReq, nodeRes) {
    mcpServer = mcpServer || createMcpServer();

    const transport = new SSEServerTransport('/messages', nodeRes);
    transports.set(transport.sessionId, transport);

    transport.onclose = () => {
        transports.delete(transport.sessionId);
    };

    await mcpServer.server.connect(transport);
}

/**
 * Handle message (POST /messages)
 * Claude Desktop sends JSON-RPC messages here.
 */
export async function handleMessage(nodeReq, nodeRes) {
    const sessionId = new URL(nodeReq.url, 'http://localhost').searchParams.get('sessionId');
    const transport = transports.get(sessionId);

    if (!transport) {
        nodeRes.writeHead(400, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ error: 'Invalid session' }));
        return;
    }

    await transport.handlePostMessage(nodeReq, nodeRes);
}
