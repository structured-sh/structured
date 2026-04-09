import { useState, useEffect } from 'react';
import { Zap, RefreshCw, Terminal } from 'lucide-react';
import { api } from '../api.js';
import { CopyBlock } from '../components/CopyBlock.jsx';

export function ConnectPage() {
    const [connected, setConnected] = useState(null);
    const [health, setHealth] = useState(null);
    const [keyInfo, setKeyInfo] = useState(null);
    const [newKey, setNewKey] = useState(null);
    const [rotating, setRotating] = useState(false);

    useEffect(() => {
        api.health()
            .then(h => { setConnected(true); setHealth(h); })
            .catch(() => setConnected(false));
        api.getApiKey().then(setKeyInfo).catch(() => {});
    }, []);

    const handleRotate = async () => {
        if (!confirm('Rotate API key? The current key will stop working immediately.')) return;
        setRotating(true);
        try {
            const result = await api.rotateApiKey();
            setNewKey(result.key);
            setKeyInfo({ masked: result.masked, source: 'db' });
        } catch (err) {
            alert(err.message);
        } finally {
            setRotating(false);
        }
    };

    const apiUrl = window.location.hostname === 'localhost'
        ? 'http://localhost:3001'
        : `${window.location.protocol}//${window.location.hostname}:3001`;

    const claudeConfig = JSON.stringify({
        mcpServers: {
            "structured": {
                command: "docker",
                args: ["exec", "-i", "structured-opensource-mcp-1", "node", "index.js"]
            }
        }
    }, null, 2);

    const cursorConfig = JSON.stringify({
        "structured": {
            command: "docker",
            args: ["exec", "-i", "structured-opensource-mcp-1", "node", "index.js"]
        }
    }, null, 2);

    const curlTest = `# Health check
curl ${apiUrl}/health

# Create a memory
curl -X POST ${apiUrl}/memories \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "my_notes",
    "fields": [
      {"name": "title", "type": "string"},
      {"name": "content", "type": "string"},
      {"name": "priority", "type": "int32"}
    ]
  }'

# Write data
curl -X POST ${apiUrl}/memories/my_notes/write \\
  -H "Content-Type: application/json" \\
  -d '{"data": [{"title": "Hello", "content": "World", "priority": 1}]}'

# Flush to Parquet
curl -X POST ${apiUrl}/memories/my_notes/flush

# Query with DuckDB
curl -X POST ${apiUrl}/query \\
  -H "Content-Type: application/json" \\
  -d '{"sql": "SELECT * FROM my_notes"}'`;

    const statusDot = (label) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: connected ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }} />
            {connected ? label : 'offline'}
        </div>
    );

    return (
        <>
            <div className="page-header">
                <h2>Connect</h2>
                <p>Connect your AI tools to Structured Memory</p>
            </div>
            <div className="page-content">
                {/* Connection Status */}
                <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px' }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: connected ? 'rgba(34, 197, 94, 0.15)' : connected === false ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Zap size={20} style={{ color: connected ? 'var(--success)' : connected === false ? 'var(--error)' : 'var(--text-muted)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {connected ? 'API Connected' : connected === false ? 'API Offline' : 'Checking...'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {health ? `${apiUrl} · v${health.version}` : apiUrl}
                        </div>
                    </div>
                    <div className={`badge ${connected ? 'badge-success' : connected === false ? 'badge-error' : ''}`}>
                        {connected ? 'ONLINE' : connected === false ? 'OFFLINE' : '...'}
                    </div>
                </div>

                {/* API Key */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>API Key</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {keyInfo ? `Source: ${keyInfo.source}` : 'Loading...'}
                            </div>
                        </div>
                        <button className="btn btn-secondary" onClick={handleRotate} disabled={rotating}>
                            <RefreshCw size={13} /> {rotating ? 'Rotating...' : 'Rotate Key'}
                        </button>
                    </div>

                    {newKey ? (
                        <div style={{
                            padding: '12px 16px',
                            background: 'var(--accent-dim)',
                            border: '1px solid rgba(42,125,111,0.3)',
                            borderRadius: 5,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                        }}>
                            <div style={{ fontSize: 10, color: 'var(--accent-primary)', marginBottom: 6, fontWeight: 600 }}>
                                ✓ NEW KEY — copy now, it won't be shown again
                            </div>
                            <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{newKey}</div>
                        </div>
                    ) : (
                        <div style={{
                            padding: '10px 16px',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: 5,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            letterSpacing: '0.05em',
                        }}>
                            {keyInfo?.masked || '─────────────'}
                        </div>
                    )}
                </div>

                {/* MCP Clients */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>

                    {/* Claude Desktop */}
                    <div className="card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #D4A574 0%, #C4956A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>C</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>Claude Desktop</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>claude_desktop_config.json</div>
                            </div>
                            {statusDot('API ready')}
                        </div>
                        <CopyBlock label="claude_desktop_config.json" value={claudeConfig} />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>
                            macOS: <span style={{ color: 'var(--text-secondary)' }}>~/Library/Application Support/Claude/</span><br />
                            Windows: <span style={{ color: 'var(--text-secondary)' }}>%APPDATA%\Claude\</span>
                        </div>
                    </div>

                    {/* Cursor */}
                    <div className="card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #00B4D8 0%, #0077B6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>⌘</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>Cursor</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Settings → MCP Servers</div>
                            </div>
                            {statusDot('API ready')}
                        </div>
                        <CopyBlock label=".cursor/mcp.json" value={cursorConfig} />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>
                            Settings → Features → MCP Servers → Add new MCP server
                        </div>
                    </div>

                    {/* Windsurf / Cline */}
                    <div className="card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>W</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>Windsurf / Cline / Any</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>stdio transport</div>
                            </div>
                            {statusDot('API ready')}
                        </div>
                        <CopyBlock label="docker exec command" value={`docker exec -i structured-opensource-mcp-1 node index.js`} />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>
                            Any MCP client with stdio transport — point to the MCP container.
                        </div>
                    </div>

                    {/* REST API */}
                    <div className="card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, var(--accent-primary) 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Terminal size={14} style={{ color: '#fff' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>REST API</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Direct HTTP access</div>
                            </div>
                            {statusDot('live')}
                        </div>
                        <CopyBlock label="curl quick start" value={curlTest} />
                    </div>
                </div>

                {/* Available MCP Tools */}
                <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Available MCP Tools</h3>
                    <div className="results-table-wrapper">
                        <table className="results-table">
                            <thead>
                                <tr><th>Tool</th><th>Description</th><th>Example Prompt</th></tr>
                            </thead>
                            <tbody>
                                {[
                                    ['create_memory', 'Define a structured memory with typed schema', '"Create a memory for tracking user feedback with fields: user_id, rating, comment"'],
                                    ['list_memories', 'Show all memories with stats', '"What memories do I have?"'],
                                    ['describe_memory', 'Get schema, stats, and sample data', '"Show me the schema for user_feedback"'],
                                    ['write_memory', 'Write records to a memory', '"Save this feedback: user_id=123, rating=5, comment=great"'],
                                    ['query_memory', 'Run DuckDB SQL queries', '"What\'s the average rating across all feedback?"'],
                                    ['store_document', 'Store unstructured JSON', '"Remember this meeting note for later"'],
                                    ['get_document', 'Retrieve a document by ID', '"Get the document with ID abc-123"'],
                                    ['flush_memory', 'Force-write buffered data to Parquet', '"Flush all pending data to disk"'],
                                    ['delete_memory', 'Remove a memory and its data', '"Delete the test_data memory"'],
                                ].map(([tool, desc, example]) => (
                                    <tr key={tool}>
                                        <td><span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{tool}</span></td>
                                        <td>{desc}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{example}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
}
