-- =============================================================================
-- Structured Memory — SQLite Schema
-- =============================================================================
-- Single-user, local-first structured memory for AI agents.
-- =============================================================================

-- Memories (structured data with typed fields)
-- Each memory defines a schema and stores data as Parquet files on disk.
CREATE TABLE IF NOT EXISTS memories (
    name TEXT PRIMARY KEY,                     -- e.g., "user_preferences", "chat_history"
    fields TEXT NOT NULL,                      -- JSON: [{ "name": "key", "type": "string" }]
    schema_mode TEXT DEFAULT 'flex',           -- flex | evolve | strict
    description TEXT,                          -- Human-readable description
    event_count INTEGER DEFAULT 0,            -- Total records written
    bytes_stored INTEGER DEFAULT 0,           -- Total Parquet bytes on disk
    file_count INTEGER DEFAULT 0,             -- Total Parquet files
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents (unstructured memory — key/value JSON store)
-- For when AI needs to store arbitrary data without a schema.
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,                       -- User-provided or auto-generated ID
    collection TEXT NOT NULL,                  -- Logical grouping: "notes", "context", etc.
    data TEXT NOT NULL,                        -- JSON blob
    metadata TEXT,                             -- Optional JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);

-- Usage tracking (daily aggregates per memory)
CREATE TABLE IF NOT EXISTS usage (
    memory_name TEXT NOT NULL,
    date TEXT NOT NULL,                        -- YYYY-MM-DD (UTC)
    event_count INTEGER DEFAULT 0,
    bytes_stored INTEGER DEFAULT 0,
    file_count INTEGER DEFAULT 0,
    PRIMARY KEY (memory_name, date)
);

-- Settings (key/value config store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
