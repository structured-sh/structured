<p align="center">
  <strong>■ structured</strong><br>
  <sub>schema-native memory for AI agents</sub>
</p>

<p align="center">
  <a href="https://structured.sh">structured.sh</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#connect-to-claude--cursor">Connect to Claude</a> ·
  <a href="#mcp-tools">MCP Tools</a> ·
  <a href="#api-reference">API Reference</a>
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

### 1. Start the stack

```bash
git clone https://github.com/user/structured-opensource.git
cd structured-opensource
docker compose up -d
```

| Service     | URL                   |
|-------------|-----------------------|
| Dashboard   | http://localhost:3000  |
| API         | http://localhost:3001  |
| MCP         | stdio (auto-connected)|

### 2. Create a memory

```bash
curl -X POST http://localhost:3001/memories \
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

### 3. Write data

```bash
curl -X POST http://localhost:3001/memories/user_preferences/write \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      { "key": "theme", "value": "dark", "priority": 1 },
      { "key": "language", "value": "en", "priority": 2 },
      { "key": "timezone", "value": "UTC+2", "priority": 3 }
    ]
  }'
```

### 4. Flush to Parquet

```bash
curl -X POST http://localhost:3001/memories/user_preferences/flush
```

### 5. Query with SQL

```bash
curl -X POST http://localhost:3001/query \
  -H "Content-Type: application/json" \
  -d '{ "sql": "SELECT * FROM user_preferences WHERE priority > 1" }'
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

### Local (self-hosted)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "structured": {
      "command": "node",
      "args": ["/path/to/structured-opensource/mcp/index.js"],
      "env": {
        "API_URL": "http://localhost:3001"
      }
    }
  }
}
```

For **Cursor**, add to Settings → Features → MCP Servers:

```json
{
  "structured": {
    "command": "node",
    "args": ["/path/to/structured-opensource/mcp/index.js"],
    "env": {
      "API_URL": "http://localhost:3001"
    }
  }
}
```

For **Docker** (production):

```json
{
  "mcpServers": {
    "structured": {
      "command": "docker",
      "args": ["exec", "-i", "structured-opensource-mcp-1", "node", "index.js"]
    }
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

### How to tell local vs cloud apart?

They're the same tool, same 9 commands. The only difference is where data lives:

| | Local | Cloud |
|---|---|---|
| **Data** | `./data/` on your machine | Cloudflare R2 |
| **Config** | `command: "node"` | `command: "npx"` with proxy |
| **Speed** | Instant (local disk) | Edge-fast (global CDN) |
| **Cost** | Free | Usage-based |

## MCP Tools

Once connected, just talk naturally. The AI picks the right tool.

| Tool | What to say |
|------|-------------|
| `create_memory` | *"Create a memory for tracking daily sales with fields: date, revenue, units"* |
| `list_memories` | *"What memories do I have?"* |
| `describe_memory` | *"Show me the schema for daily_sales"* |
| `write_memory` | *"Save today's sales: date=2026-04-09, revenue=1250.50, units=42"* |
| `query_memory` | *"What's the total revenue this month?"* |
| `store_document` | *"Remember this meeting note for later"* |
| `get_document` | *"Get the document abc-123"* |
| `flush_memory` | *"Flush all pending data to disk"* |
| `delete_memory` | *"Delete the test_data memory"* |

## API Reference

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

### Documents

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/documents` | Store a document |
| `GET` | `/documents/collections` | List collections |
| `GET` | `/documents/:collection` | List documents |
| `DELETE` | `/documents/:collection/:id` | Delete document |

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
| `strict` | Reject records with mismatched fields |

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

| Layer | Tech |
|-------|------|
| API | [Hono](https://hono.dev) |
| Metadata | [sql.js](https://github.com/sql-js/sql.js) (SQLite WASM) |
| Query | [@duckdb/duckdb-wasm](https://github.com/duckdb/duckdb-wasm) |
| Storage | [tiny-parquet](https://npmjs.com/package/tiny-parquet) |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) |
| Dashboard | Vite + React |

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
