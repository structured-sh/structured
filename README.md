<p align="center">
  <strong>■ structured</strong><br>
  <sub>schema-native memory for AI agents</sub>
</p>

<p align="center">
  <a href="https://structured.sh">structured.sh</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#connect-to-claude--cursor">Connect to Claude</a> ·
  <a href="#mcp-tools">MCP Tools</a> ·
  <a href="#api-reference">API Reference</a> ·
  <a href="DEPLOY.md">Deploy</a>
</p>

---

Define schemas. Write structured data. Query with SQL. All as Parquet files you own.

```
docker compose up
```

## What is this?

Structured gives AI agents (and humans) persistent, queryable memory:

1. **Define a memory** — name + typed schema (like a table)
2. **Write records** — buffered and auto-flushed to Parquet files
3. **Query with SQL** — DuckDB runs directly against the Parquet files
4. **Own your data** — everything is local files on disk, no vendor lock-in

Works with Claude Desktop, Cursor, Windsurf, Cline, or any MCP-compatible client.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                 docker compose up                     │
│                                                       │
│  ┌──────────┐    ┌──────────────┐    ┌────────────┐  │
│  │Dashboard │    │   REST API   │    │ MCP Server │  │
│  │  :3000   │───▶│    :3001     │◀───│   stdio    │  │
│  │          │    │              │    │            │  │
│  │Vite+React│    │ Hono + WASM  │    │  9 tools   │  │
│  └──────────┘    │              │    └────────────┘  │
│                  │ SQLite  (sql.js)                   │
│                  │ DuckDB  (wasm)                     │
│                  │ Parquet (tiny-parquet)              │
│                  └──────┬───────┘                     │
│                         │                             │
│                    ./data/                             │
│                  ├── structured.db    ← metadata       │
│                  └── parquet/         ← your data      │
│                      ├── user_prefs/                   │
│                      │   └── 2026/04/09/...parquet    │
│                      └── campaign_data/                │
│                          └── 2026/04/09/...parquet    │
└──────────────────────────────────────────────────────┘
```

**Zero native dependencies.** Everything runs in WASM — no C++ builds, no platform issues.

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/structured-sh/structured.git
cd structured
```

Edit `docker-compose.yml` and set your credentials:

```yaml
environment:
  - API_KEY=your-secret-api-key        # Used by MCP clients & scripts
  - DASHBOARD_PASSWORD=your-password   # Protects the dashboard UI
```

> **Two separate credentials:**
> - `API_KEY` — machine auth for MCP clients, scripts, and analytics ingestion
> - `DASHBOARD_PASSWORD` — human auth for the web dashboard. Leave unset to disable login (local-only use).

### 2. Start the stack

```bash
docker compose up -d
```

| Service     | URL                    |
|-------------|------------------------|
| Dashboard   | http://localhost:3000  |
| API         | http://localhost:3001  |
| MCP         | stdio (auto-connected) |

### 3. Create a memory

```bash
curl -X POST http://localhost:3001/memories \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user_preferences",
    "fields": [
      { "name": "key", "type": "string" },
      { "name": "value", "type": "string" },
      { "name": "priority", "type": "int32" }
    ],
    "description": "User preference settings"
  }'
```

### 4. Write data

```bash
curl -X POST http://localhost:3001/memories/user_preferences/write \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      { "key": "theme", "value": "dark", "priority": 1 },
      { "key": "language", "value": "en", "priority": 2 }
    ]
  }'
```

### 5. Query with SQL

```bash
curl -X POST http://localhost:3001/query \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{ "sql": "SELECT * FROM user_preferences ORDER BY priority" }'
```

Memory names work as table names — DuckDB resolves them to Parquet files automatically.

### 6. Access raw files

```bash
# Files on disk
ls ./data/parquet/user_preferences/

# DuckDB CLI
duckdb -c "SELECT * FROM read_parquet('./data/parquet/user_preferences/**/*.parquet')"

# Python
import duckdb
duckdb.sql("SELECT * FROM './data/parquet/user_preferences/**/*.parquet'").show()
```

## Connect to Claude / Cursor

### Local (Docker)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "structured": {
      "command": "docker",
      "args": ["exec", "-i", "structured-mcp", "node", "index.js"]
    }
  }
}
```

For **Cursor**, add to Settings → Features → MCP Servers:

```json
{
  "structured": {
    "command": "docker",
    "args": ["exec", "-i", "structured-mcp", "node", "index.js"]
  }
}
```

### Cloud (structured.sh)

> Coming soon — hosted version at [structured.sh](https://structured.sh)

```json
{
  "mcpServers": {
    "structured": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-proxy", "https://mcp.structured.sh"]
    }
  }
}
```

## MCP Tools

Once connected, just talk naturally. The AI picks the right tool.

| Tool | What to say |
|------|-------------|
| `create_memory` | *"Create a memory for tracking daily sales with fields: date, revenue, units"* |
| `list_memories` | *"What memories do I have?"* |
| `describe_memory` | *"Show me the schema for daily_sales"* |
| `write_memory` | *"Save today's sales: date=2026-04-09, revenue=1250.50, units=42"* |
| `query_memory` | *"What's the total revenue this month?"* |
| `store_document` | *"Remember this config for later"* |
| `get_document` | *"Get the document abc-123"* |
| `flush_memory` | *"Flush all pending data to disk"* |
| `delete_memory` | *"Delete the test_data memory"* |

## Ingesting Data from Your Apps

Use the templates in `templates/` to send events from external systems:

| Template | Use case |
|----------|----------|
| `templates/ingest-app-analytics.js` | Mobile/web app events (installs, actions, purchases) |
| `templates/ingest-webhook.js` | Stripe, GitHub, Shopify webhooks |
| `templates/query-report.js` | Generate SQL reports → terminal, Markdown, or Slack |

```js
// Example: track an install from your iOS app
import { track } from './templates/ingest-app-analytics.js';
await track('install', 'user_abc', { platform: 'ios', app_version: '1.0.0' });
```

Then query across all your events:

```sql
SELECT event, COUNT(*) as n, COUNT(DISTINCT user_id) as users
FROM app_events
WHERE timestamp > now() - INTERVAL '30 days'
GROUP BY event ORDER BY n DESC
```

## Dead Letter Queue

Records rejected by `strict` or `evolve` schema modes are **not dropped** — they're automatically written to `_dlq_{memory_name}` for inspection:

```sql
-- See what was rejected and why
SELECT _reason, _payload, _rejected_at
FROM _dlq_app_events
ORDER BY _rejected_at DESC
LIMIT 20
```

## API Key Rotation

Rotate your API key at any time from the dashboard **Connect** page without restarting:

1. Go to **Connect** → **API Key** section
2. Click **Rotate Key**
3. Copy the new key (shown once)
4. Update your MCP config and any scripts

The old key is invalidated immediately.

## API Reference

### Auth (Dashboard)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/status` | Check if dashboard auth is enabled |
| `POST` | `/auth/login` | Login with `{ password }`, returns session token |
| `GET` | `/auth/me` | Validate current session (`X-Session-Token` header) |
| `POST` | `/auth/logout` | Logout (client discards token) |

### Memories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/memories` | List all memories |
| `POST` | `/memories` | Create a memory |
| `GET` | `/memories/:name` | Get memory details |
| `PUT` | `/memories/:name` | Update memory |
| `DELETE` | `/memories/:name` | Delete memory |
| `POST` | `/memories/:name/write` | Write records |
| `POST` | `/memories/:name/flush` | Flush to Parquet |
| `GET` | `/memories/:name/preview` | Preview data |
| `GET` | `/memories/:name/files` | List Parquet files |

### Query

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/query` | Execute DuckDB SQL |

### Store (Documents)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/documents` | Store a JSON document |
| `GET` | `/documents/collections` | List collections |
| `GET` | `/documents/:collection` | List documents |
| `DELETE` | `/documents/:collection/:id` | Delete document |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings/api-key` | Get masked current API key |
| `POST` | `/settings/rotate-key` | Generate new API key |

### Files

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/files/*` | Download raw Parquet file |

### MCP (SSE)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sse` | SSE stream for MCP clients |
| `POST` | `/messages` | JSON-RPC messages |

## Schema Modes

| Mode | Behavior |
|------|----------|
| `flex` | Accept all fields, no validation (default) |
| `evolve` | Accept all, detect and log schema drift |
| `strict` | Reject records with mismatched fields → DLQ |

## Field Types

| Type | Parquet Type | Notes |
|------|-------------|-------|
| `string` | BYTE_ARRAY (UTF-8) | Default |
| `int32` | INT32 | |
| `int64` | INT64 | |
| `float32` | FLOAT | |
| `float64` | DOUBLE | |
| `boolean` | BOOLEAN | |
| `timestamp` | INT64 (millis) | Unix ms, UTC |

## Stack

Only 7 npm packages. No native addons — everything runs in WASM or pure JS.

| Package | What it does |
|---|---|
| [`hono`](https://hono.dev) + `@hono/node-server` | HTTP router — fast, Web-standard API |
| [`@duckdb/duckdb-wasm`](https://github.com/duckdb/duckdb-wasm) | SQL query engine, runs fully in WASM |
| [`sql.js`](https://github.com/sql-js/sql.js) | SQLite in WASM — stores schema metadata |
| [`tiny-parquet`](https://npmjs.com/package/tiny-parquet) | Pure-JS Parquet writer, zero native deps |
| [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/sdk) | MCP server/tool registration |
| [`zod`](https://zod.dev) | Schema validation for API inputs |

**Runtime:** Node.js ≥ 20

Because everything runs in WASM, there are no C++ builds, no `node-gyp`, no platform-specific binaries. The Docker image works on any architecture Docker supports.

## Development

```bash
# Local dev (no Docker)
cd api && npm install && node index.js
cd dashboard && npm install && npm run dev

# Full stack
docker compose up --build
```

## License

Apache 2.0

---

<p align="center">
  <sub>Built with <a href="https://npmjs.com/package/tiny-parquet">tiny-parquet</a> · Powered by <a href="https://duckdb.org">DuckDB</a> · <a href="https://structured.sh">structured.sh</a></sub>
</p>
