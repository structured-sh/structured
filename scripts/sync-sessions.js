#!/usr/bin/env node
/**
 * Sync Antigravity coding sessions → Structured Memory
 * 
 * Scans ~/.gemini/antigravity/brain/ for conversation artifacts
 * (walkthroughs, implementation plans, tasks) and writes them
 * to the "coding_sessions" memory.
 *
 * Usage:
 *   node scripts/sync-sessions.js              # sync all conversations
 *   node scripts/sync-sessions.js --recent 5   # sync 5 most recent
 *   node scripts/sync-sessions.js --id <uuid>  # sync specific conversation
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

const BRAIN_DIR = join(process.env.HOME, '.gemini/antigravity/brain');
const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'sk_structured_dev';
const MEMORY_NAME = 'coding_sessions';

// ── API helper ───────────────────────────────────────────────────────────────

async function api(method, path, body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_URL}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API error (${res.status})`);
    return data;
}

// ── Artifact types to sync ───────────────────────────────────────────────────

const ARTIFACT_FILES = [
    { file: 'walkthrough.md', type: 'walkthrough' },
    { file: 'implementation_plan.md', type: 'implementation_plan' },
    { file: 'task.md', type: 'task' },
];

// ── Token estimation (~4 chars per token, standard approximation) ────────────

function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
}

// ── Model detection heuristics ───────────────────────────────────────────────
// Scans artifact content for patterns that hint at which model was used.

function detectModel(content) {
    const lower = content.toLowerCase();

    // Look for explicit model mentions in walkthroughs/plans
    if (/claude\s*opus/i.test(content))  return 'claude-opus';
    if (/claude\s*sonnet/i.test(content)) return 'claude-sonnet';
    if (/claude\s*haiku/i.test(content))  return 'claude-haiku';
    if (/gemini\s*(2|pro|flash|ultra)/i.test(content)) return 'gemini';
    if (/gpt-?4/i.test(content))          return 'gpt-4';

    // Antigravity is the agent name for this system
    if (lower.includes('antigravity'))     return 'gemini';

    return 'unknown';
}

// ── Parse a conversation directory ───────────────────────────────────────────

async function parseConversation(conversationId) {
    const dir = join(BRAIN_DIR, conversationId);
    const records = [];

    for (const { file, type } of ARTIFACT_FILES) {
        const filePath = join(dir, file);
        const metaPath = join(dir, `${file}.metadata.json`);

        try {
            const content = await readFile(filePath, 'utf-8');
            if (!content.trim()) continue;

            // Try to read metadata for summary + timestamp
            let summary = '';
            let timestamp = new Date().toISOString();
            try {
                const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
                summary = meta.summary || '';
                timestamp = meta.updatedAt || timestamp;
            } catch {}

            // Extract title from first H1 heading
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : `${type} — ${conversationId.slice(0, 8)}`;

            const cappedContent = content.slice(0, 8000);
            records.push({
                conversation_id: conversationId,
                title,
                artifact_type: type,
                summary,
                content: cappedContent,
                model: detectModel(content),
                token_estimate: estimateTokens(content),
                timestamp,
            });
        } catch {
            // File doesn't exist, skip
        }
    }

    return records;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    let conversationIds = [];

    // Parse CLI args
    const idIdx = args.indexOf('--id');
    const recentIdx = args.indexOf('--recent');

    if (idIdx !== -1 && args[idIdx + 1]) {
        conversationIds = [args[idIdx + 1]];
    } else {
        // Get all conversation directories
        const entries = await readdir(BRAIN_DIR, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

        // Sort by modification time (most recent first)
        const withStats = await Promise.all(
            dirs.map(async d => {
                const s = await stat(join(BRAIN_DIR, d.name));
                return { name: d.name, mtime: s.mtime };
            })
        );
        withStats.sort((a, b) => b.mtime - a.mtime);

        const limit = recentIdx !== -1 ? parseInt(args[recentIdx + 1]) || 10 : withStats.length;
        conversationIds = withStats.slice(0, limit).map(d => d.name);
    }

    console.log(`\n📡 Syncing ${conversationIds.length} conversations → Structured Memory\n`);

    // Check if memory exists, create if not
    try {
        await api('GET', `/memories/${MEMORY_NAME}`);
    } catch {
        console.log('Creating "coding_sessions" memory...');
        await api('POST', '/memories', {
            name: MEMORY_NAME,
            description: 'Logs from AI coding sessions — conversations, decisions, insights, and artifacts with token estimates and model info',
            fields: [
                { name: 'conversation_id', type: 'string' },
                { name: 'title', type: 'string' },
                { name: 'artifact_type', type: 'string' },
                { name: 'summary', type: 'string' },
                { name: 'content', type: 'string' },
                { name: 'model', type: 'string' },
                { name: 'token_estimate', type: 'int32' },
                { name: 'timestamp', type: 'timestamp' },
            ],
            schema_mode: 'flex',
        });
    }

    let totalRecords = 0;
    let totalConversations = 0;

    for (const id of conversationIds) {
        const records = await parseConversation(id);
        if (records.length === 0) continue;

        try {
            const result = await api('POST', `/memories/${MEMORY_NAME}/write`, { data: records });
            totalRecords += result.accepted;
            totalConversations++;
            const totalTokens = records.reduce((s, r) => s + r.token_estimate, 0);
            const models = [...new Set(records.map(r => r.model))];
            console.log(`  ✓ ${id.slice(0, 8)}… — ${records.length} artifacts, ~${totalTokens.toLocaleString()} tokens [${models.join(', ')}]`);
        } catch (err) {
            console.error(`  ✗ ${id.slice(0, 8)}… — ${err.message}`);
        }
    }

    // Flush to parquet
    try {
        await api('POST', `/memories/${MEMORY_NAME}/flush`);
    } catch {}

    console.log(`\n✅ Done — ${totalRecords} records from ${totalConversations} conversations synced.\n`);

    // Show a sample query
    console.log('Try querying:');
    console.log(`  curl -s -X POST http://localhost:3001/query \\`);
    console.log(`    -H "Authorization: Bearer ${API_KEY}" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"sql": "SELECT conversation_id, title, artifact_type FROM coding_sessions ORDER BY timestamp DESC LIMIT 10"}'\n`);
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
