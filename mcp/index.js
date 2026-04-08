/**
 * Structured Memory — MCP Server
 * Exposes structured memory as tools for AI agents.
 * Communicates with the API server over HTTP.
 * 
 * Transport: stdio (Docker/local)
 * Uses Zod 3.25 for schema definitions (required by MCP SDK).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || '';

// ── HTTP Helper ──────────────────────────────────────────────────────────────

async function api(method, path, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (API_KEY) opts.headers['Authorization'] = `Bearer ${API_KEY}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_URL}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API error (${res.status})`);
    return data;
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
    name: 'structured',
    version: '0.1.0',
});

// ── create_memory ────────────────────────────────────────────────────────────

server.tool(
    'create_memory',
    'Create a new structured memory with typed fields for storing data as Parquet files.',
    {
        name: z.string().describe('Memory name (alphanumeric, _, -)'),
        fields: z.array(z.object({
            name: z.string(),
            type: z.enum(['string', 'int32', 'int64', 'float32', 'float64', 'boolean', 'timestamp']),
        })).describe('Field definitions'),
        description: z.string().optional().describe('Human-readable description'),
        schema_mode: z.enum(['flex', 'evolve', 'strict']).optional().describe('Schema validation mode'),
    },
    async ({ name, fields, description, schema_mode }) => {
        try {
            const result = await api('POST', '/memories', { name, fields, description, schema_mode });
            return { content: [{ type: 'text', text: `✓ Memory "${name}" created with ${fields.length} fields.\n\nSchema:\n${fields.map(f => `  ${f.name}: ${f.type}`).join('\n')}\n\nMode: ${result.schema_mode}` }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── list_memories ────────────────────────────────────────────────────────────

server.tool(
    'list_memories',
    'List all structured memories with schemas, record counts, and storage.',
    {},
    async () => {
        try {
            const { memories } = await api('GET', '/memories');
            if (memories.length === 0) return { content: [{ type: 'text', text: 'No memories found. Create one with create_memory.' }] };
            const lines = memories.map(m => {
                const fields = JSON.parse(m.fields);
                return `• ${m.name} (${fields.length} fields, ${m.event_count} records, ${fmt(m.bytes_stored)})\n  ${m.description || 'No description'}\n  Mode: ${m.schema_mode}`;
            });
            return { content: [{ type: 'text', text: `${memories.length} memories:\n\n${lines.join('\n\n')}` }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── describe_memory ──────────────────────────────────────────────────────────

server.tool(
    'describe_memory',
    'Get schema, stats, and sample data for a memory.',
    { name: z.string().describe('Memory name') },
    async ({ name }) => {
        try {
            const memory = await api('GET', `/memories/${encodeURIComponent(name)}`);
            let preview = { totalRows: 0, sample: [] };
            try { preview = await api('GET', `/memories/${encodeURIComponent(name)}/preview?limit=5`); } catch {}

            const lines = [
                `Memory: ${memory.name}`,
                `Description: ${memory.description || 'None'}`,
                `Mode: ${memory.schema_mode} | Records: ${memory.event_count} | Storage: ${fmt(memory.bytes_stored)} | Files: ${memory.file_count}`,
                '', 'Schema:',
                ...memory.fields.map(f => `  ${f.name}: ${f.type}`),
            ];
            if (preview.sample?.length > 0) lines.push('', `Sample (${preview.totalRows} total):`, JSON.stringify(preview.sample, null, 2));
            return { content: [{ type: 'text', text: lines.join('\n') }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── write_memory ─────────────────────────────────────────────────────────────

server.tool(
    'write_memory',
    'Write records to a memory. Auto-flushed to Parquet.',
    {
        name: z.string().describe('Memory name'),
        data: z.array(z.object({}).passthrough()).describe('Array of record objects'),
    },
    async ({ name, data }) => {
        try {
            const result = await api('POST', `/memories/${encodeURIComponent(name)}/write`, { data });
            return { content: [{ type: 'text', text: `✓ Wrote ${result.accepted} records to "${name}". Buffered: ${result.buffered} | Flushed: ${result.flushed}` }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── query_memory ─────────────────────────────────────────────────────────────

server.tool(
    'query_memory',
    'Run DuckDB SQL. Use memory names as table names. Example: SELECT * FROM user_preferences WHERE key = \'theme\'',
    { sql: z.string().describe('DuckDB SQL query') },
    async ({ sql }) => {
        try {
            const result = await api('POST', '/query', { sql });
            if (result.rows.length === 0) return { content: [{ type: 'text', text: `Query returned 0 rows.\nSQL: ${sql}` }] };
            const header = result.columns.join(' | ');
            const sep = result.columns.map(c => '-'.repeat(Math.max(c.length, 3))).join('-+-');
            const rows = result.rows.map(r => result.columns.map(c => String(r[c] ?? '')).join(' | '));
            return { content: [{ type: 'text', text: `${result.rowCount} rows:\n\n${header}\n${sep}\n${rows.join('\n')}` }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Query error: ${err.message}` }], isError: true };
        }
    }
);

// ── store_document ───────────────────────────────────────────────────────────

server.tool(
    'store_document',
    'Store unstructured JSON in a document collection.',
    {
        collection: z.string().describe('Collection name'),
        data: z.object({}).passthrough().describe('JSON data'),
        id: z.string().optional().describe('Document ID (auto-generated if omitted)'),
    },
    async ({ collection, data, id }) => {
        try {
            const result = await api('POST', '/documents', { collection, data, id });
            return { content: [{ type: 'text', text: `✓ Stored in "${collection}" — ID: ${result.id}` }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── get_document ─────────────────────────────────────────────────────────────

server.tool(
    'get_document',
    'Retrieve a document by ID.',
    { id: z.string().describe('Document ID') },
    async ({ id }) => {
        try {
            const result = await api('GET', `/documents/_all/${encodeURIComponent(id)}`);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── flush_memory ─────────────────────────────────────────────────────────────

server.tool(
    'flush_memory',
    'Force flush buffered records to Parquet.',
    { name: z.string().optional().describe('Memory name (omit to flush all)') },
    async ({ name }) => {
        try {
            const path = name ? `/memories/${encodeURIComponent(name)}/flush` : '/flush';
            const result = await api('POST', path);
            return { content: [{ type: 'text', text: name ? `✓ Flushed "${name}": ${result.accepted || 0} records` : '✓ All flushed.' }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── delete_memory ────────────────────────────────────────────────────────────

server.tool(
    'delete_memory',
    'Delete a memory and all its data.',
    { name: z.string().describe('Memory name') },
    async ({ name }) => {
        try {
            await api('DELETE', `/memories/${encodeURIComponent(name)}`);
            return { content: [{ type: 'text', text: `✓ Memory "${name}" deleted.` }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Structured Memory MCP server started (stdio transport)');
    console.error(`API URL: ${API_URL}`);
}

main().catch(err => {
    console.error('MCP server failed to start:', err);
    process.exit(1);
});
