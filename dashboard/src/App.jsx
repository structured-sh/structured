import { useState, useEffect } from 'react';
import { Database, Table, Search, FileText, Settings, Brain, Plus, Play, Trash2, Eye, Download, X, ChevronRight, HardDrive, BarChart3, Layers, Cable, Copy, Check, Terminal, ExternalLink, Zap, RefreshCw, LogOut, Lock } from 'lucide-react';
import { api, getSession, setSession, clearSession } from './api.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
    const [page, setPage] = useState('memories');
    const [connected, setConnected] = useState(false);
    const [authEnabled, setAuthEnabled] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        // Check if auth is enabled, then validate existing session
        api.authStatus()
            .then(({ auth_enabled }) => {
                setAuthEnabled(auth_enabled);
                if (!auth_enabled) {
                    setAuthenticated(true);
                    setAuthLoading(false);
                    return;
                }
                const token = getSession();
                if (!token) { setAuthLoading(false); return; }
                return api.me()
                    .then(() => { setAuthenticated(true); setAuthLoading(false); })
                    .catch(() => { clearSession(); setAuthLoading(false); });
            })
            .catch(() => {
                // If API unreachable, still show app (will show errors inline)
                setAuthLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!authenticated) return;
        api.health().then(() => setConnected(true)).catch(() => setConnected(false));
        const interval = setInterval(() => {
            api.health().then(() => setConnected(true)).catch(() => setConnected(false));
        }, 15000);
        return () => clearInterval(interval);
    }, [authenticated]);

    const handleLogin = (token) => {
        setSession(token);
        setAuthenticated(true);
    };

    const handleLogout = () => {
        clearSession();
        setAuthenticated(false);
    };

    if (authLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Loading...
            </div>
        );
    }

    if (authEnabled && !authenticated) {
        return <LoginPage onLogin={handleLogin} />;
    }

    return (
        <div className="app-layout">
            <Sidebar page={page} setPage={setPage} connected={connected} onLogout={authEnabled ? handleLogout : null} />
            <main className="main-content">
                {page === 'memories' && <MemoriesPage />}
                {page === 'query' && <QueryPage />}
                {page === 'files' && <FilesPage />}
                {page === 'documents' && <DocumentsPage />}
                {page === 'connect' && <ConnectPage />}
            </main>
        </div>
    );
}

// ── Login Page ────────────────────────────────────────────────────────────────

function LoginPage({ onLogin }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { token } = await api.login(password);
            onLogin(token);
        } catch (err) {
            setError(err.message || 'Invalid password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: 'var(--bg-primary)',
        }}>
            <div style={
                { width: 340, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: 32, boxShadow: 'var(--glass-shadow)' }
            }>
                <div style={{ marginBottom: 28, textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, background: 'var(--accent-dim)', border: '1px solid rgba(42,125,111,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                        <Lock size={18} style={{ color: 'var(--accent-primary)' }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Structured Memory</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Enter your dashboard password to continue</div>
                </div>

                <form onSubmit={submit}>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            id="dashboard-password"
                            className="form-input"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Dashboard password"
                            autoFocus
                        />
                    </div>
                    {error && <div style={{ color: 'var(--error)', fontSize: 11, marginBottom: 14 }}>{error}</div>}
                    <button id="login-submit" className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>

                <div style={{ marginTop: 20, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center' }}>
                    Set <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>DASHBOARD_PASSWORD</code> in <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>docker-compose.yml</code>
                </div>
            </div>
        </div>
    );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ page, setPage, connected, onLogout }) {
    const dataLinks = [
        { id: 'memories', icon: Brain, label: 'Memories' },
        { id: 'query', icon: Search, label: 'Query Console' },
        { id: 'files', icon: HardDrive, label: 'Files' },
        { id: 'documents', icon: FileText, label: 'Store' },
    ];

    const systemLinks = [
        { id: 'connect', icon: Cable, label: 'Connect' },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <h1><span>■</span> structured</h1>
                <p>memory for AI</p>
            </div>
            <nav className="sidebar-nav">
                <div className="nav-section">Data</div>
                {dataLinks.map(l => (
                    <button
                        key={l.id}
                        className={`nav-link ${page === l.id ? 'active' : ''}`}
                        onClick={() => setPage(l.id)}
                    >
                        <l.icon /> {l.label}
                    </button>
                ))}
                <div className="nav-section" style={{ marginTop: 12 }}>System</div>
                {systemLinks.map(l => (
                    <button
                        key={l.id}
                        className={`nav-link ${page === l.id ? 'active' : ''}`}
                        onClick={() => setPage(l.id)}
                    >
                        <l.icon /> {l.label}
                    </button>
                ))}
            </nav>
            {onLogout && (
                <button
                    onClick={onLogout}
                    className="nav-link"
                    style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--glass-border)', marginTop: 'auto' }}
                >
                    <LogOut size={14} /> Sign out
                </button>
            )}
            <div className="connection-status">
                <div className={`connection-dot ${connected ? '' : 'offline'}`} />
                {connected ? 'API connected' : 'API offline'}
            </div>
        </aside>
    );
}

// ── Memories Page ────────────────────────────────────────────────────────────

function MemoriesPage() {
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [selected, setSelected] = useState(null);

    const load = () => {
        setLoading(true);
        api.listMemories()
            .then(r => setMemories(r.memories || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    return (
        <>
            <div className="page-header">
                <h2>Memories</h2>
                <p>Structured data schemas — define, write, and query</p>
            </div>
            <div className="page-content">
                {/* Stats */}
                <div className="stats-row">
                    <div className="stat-card">
                        <div className="stat-card-label">Total Memories</div>
                        <div className="stat-card-value">{memories.length}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-label">Total Records</div>
                        <div className="stat-card-value">{formatNumber(memories.reduce((s, m) => s + (m.event_count || 0), 0))}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-label">Storage</div>
                        <div className="stat-card-value">{formatBytes(memories.reduce((s, m) => s + (m.bytes_stored || 0), 0))}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-label">Parquet Files</div>
                        <div className="stat-card-value">{memories.reduce((s, m) => s + (m.file_count || 0), 0)}</div>
                    </div>
                </div>

                {/* Actions */}
                <div className="action-bar">
                    <div className="action-bar-left" />
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        <Plus /> New Memory
                    </button>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="card-grid">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="card" style={{ height: 180 }}>
                                <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }} />
                                <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 20 }} />
                                <div className="skeleton" style={{ height: 30, width: '100%' }} />
                            </div>
                        ))}
                    </div>
                ) : memories.length === 0 ? (
                    <div className="empty-state">
                        <Brain />
                        <h3>No memories yet</h3>
                        <p>Create your first structured memory to start storing data as Parquet files.</p>
                        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                            <Plus /> Create Memory
                        </button>
                    </div>
                ) : (
                    <div className="card-grid">
                        {memories.map(m => (
                            <MemoryCard key={m.name} memory={m} onClick={() => setSelected(m)} />
                        ))}
                    </div>
                )}
            </div>

            {showCreate && <CreateMemoryModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
            {selected && <MemoryDetailModal memory={selected} onClose={() => setSelected(null)} onDeleted={() => { setSelected(null); load(); }} />}
        </>
    );
}

// ── Memory Card ──────────────────────────────────────────────────────────────

function MemoryCard({ memory, onClick }) {
    const fields = typeof memory.fields === 'string' ? JSON.parse(memory.fields) : memory.fields;

    return (
        <div className="card memory-card" onClick={onClick}>
            <div className="memory-card-header">
                <span className="memory-card-name">{memory.name}</span>
                <span className="memory-card-mode">{memory.schema_mode}</span>
            </div>
            <div className="memory-card-desc">{memory.description || 'No description'}</div>
            <div className="memory-card-fields">
                {fields.slice(0, 6).map(f => (
                    <span key={f.name} className="field-tag">
                        {f.name}<span className="field-type">:{f.type}</span>
                    </span>
                ))}
                {fields.length > 6 && <span className="field-tag">+{fields.length - 6}</span>}
            </div>
            <div className="memory-card-stats">
                <div className="memory-stat">
                    <span className="memory-stat-value">{formatNumber(memory.event_count)}</span>
                    <span className="memory-stat-label">Records</span>
                </div>
                <div className="memory-stat">
                    <span className="memory-stat-value">{formatBytes(memory.bytes_stored)}</span>
                    <span className="memory-stat-label">Storage</span>
                </div>
                <div className="memory-stat">
                    <span className="memory-stat-value">{memory.file_count}</span>
                    <span className="memory-stat-label">Files</span>
                </div>
            </div>
        </div>
    );
}

// ── Create Memory Modal ──────────────────────────────────────────────────────

function CreateMemoryModal({ onClose, onCreated }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [schemaMode, setSchemaMode] = useState('flex');
    const [fields, setFields] = useState([{ name: '', type: 'string' }]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const addField = () => setFields([...fields, { name: '', type: 'string' }]);
    const removeField = (i) => setFields(fields.filter((_, idx) => idx !== i));
    const updateField = (i, key, val) => {
        const next = [...fields];
        next[i] = { ...next[i], [key]: val };
        setFields(next);
    };

    const submit = async () => {
        setError('');
        const validFields = fields.filter(f => f.name.trim());
        if (!name.trim()) return setError('Name is required');
        if (validFields.length === 0) return setError('At least one field is required');

        setSaving(true);
        try {
            await api.createMemory({ name: name.trim(), fields: validFields, description: description.trim() || undefined, schema_mode: schemaMode });
            onCreated();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const types = ['string', 'int32', 'int64', 'float32', 'float64', 'boolean', 'timestamp'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Create Memory</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body">
                    {error && <div style={{ color: 'var(--error)', marginBottom: 16, fontSize: 12 }}>{error}</div>}

                    <div className="form-group">
                        <label className="form-label">Name</label>
                        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="user_preferences" />
                        <div className="form-hint">Alphanumeric, underscores, dashes</div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Description</label>
                        <input className="form-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="What this memory stores..." />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Schema Mode</label>
                        <select className="form-select" value={schemaMode} onChange={e => setSchemaMode(e.target.value)}>
                            <option value="flex">Flex — accept all fields</option>
                            <option value="evolve">Evolve — detect drift</option>
                            <option value="strict">Strict — reject mismatches</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Fields</label>
                        {fields.map((f, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                <input
                                    className="form-input"
                                    value={f.name}
                                    onChange={e => updateField(i, 'name', e.target.value)}
                                    placeholder="field_name"
                                    style={{ flex: 1 }}
                                />
                                <select
                                    className="form-select"
                                    value={f.type}
                                    onChange={e => updateField(i, 'type', e.target.value)}
                                    style={{ width: 130 }}
                                >
                                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                {fields.length > 1 && (
                                    <button className="btn btn-danger" onClick={() => removeField(i)} style={{ padding: '8px 10px' }}>
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                        <button className="btn btn-secondary" onClick={addField} style={{ marginTop: 4 }}>
                            <Plus size={14} /> Add Field
                        </button>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={submit} disabled={saving}>
                        {saving ? 'Creating...' : 'Create Memory'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Memory Detail Modal ──────────────────────────────────────────────────────

function MemoryDetailModal({ memory, onClose, onDeleted }) {
    const [preview, setPreview] = useState(null);
    const [files, setFiles] = useState([]);
    const [tab, setTab] = useState('schema');

    const fields = typeof memory.fields === 'string' ? JSON.parse(memory.fields) : memory.fields;

    useEffect(() => {
        api.preview(memory.name, 20).then(setPreview).catch(() => {});
        api.listFiles(memory.name).then(r => setFiles(r.files || [])).catch(() => {});
    }, [memory.name]);

    const handleDelete = async () => {
        if (!confirm(`Delete memory "${memory.name}" and all its data?`)) return;
        try {
            await api.deleteMemory(memory.name);
            onDeleted();
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
                <div className="modal-header">
                    <h3>{memory.name}</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body">
                    <div className="tab-nav">
                        {['schema', 'preview', 'files'].map(t => (
                            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>

                    {tab === 'schema' && (
                        <>
                            <div className="stats-row" style={{ marginBottom: 20 }}>
                                <div className="stat-card">
                                    <div className="stat-card-label">Records</div>
                                    <div className="stat-card-value">{formatNumber(memory.event_count)}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-card-label">Storage</div>
                                    <div className="stat-card-value">{formatBytes(memory.bytes_stored)}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-card-label">Mode</div>
                                    <div className="stat-card-value" style={{ fontSize: 16 }}>{memory.schema_mode}</div>
                                </div>
                            </div>
                            <div className="results-table-wrapper">
                                <table className="results-table">
                                    <thead><tr><th>Field</th><th>Type</th></tr></thead>
                                    <tbody>
                                        {fields.map(f => (
                                            <tr key={f.name}>
                                                <td>{f.name}</td>
                                                <td><span className="badge badge-success">{f.type}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {tab === 'preview' && (
                        preview && preview.sample && preview.sample.length > 0 ? (
                            <>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                                    Showing {preview.sample.length} of {preview.totalRows} rows
                                </div>
                                <div className="results-table-wrapper">
                                    <table className="results-table">
                                        <thead><tr>{Object.keys(preview.sample[0]).map(k => <th key={k}>{k}</th>)}</tr></thead>
                                        <tbody>
                                            {preview.sample.map((row, i) => (
                                                <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <div className="empty-state" style={{ padding: 40 }}>
                                <Table />
                                <p>No data yet. Write records to see a preview.</p>
                            </div>
                        )
                    )}

                    {tab === 'files' && (
                        files.length > 0 ? (
                            <div className="results-table-wrapper">
                                <table className="results-table">
                                    <thead><tr><th>File</th><th>Size</th><th>Created</th><th></th></tr></thead>
                                    <tbody>
                                        {files.map(f => (
                                            <tr key={f.path}>
                                                <td>{f.path.split('/').pop()}</td>
                                                <td>{formatBytes(f.size)}</td>
                                                <td>{new Date(f.uploaded_at).toLocaleString()}</td>
                                                <td>
                                                    <a href={api.getFileUrl(f.path)} download className="btn btn-secondary" style={{ padding: '4px 8px' }}>
                                                        <Download size={12} />
                                                    </a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 40 }}>
                                <HardDrive />
                                <p>No Parquet files yet.</p>
                            </div>
                        )
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-danger" onClick={handleDelete}>
                        <Trash2 size={14} /> Delete
                    </button>
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

// ── Query Page ───────────────────────────────────────────────────────────────

function QueryPage() {
    const [sql, setSql] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const run = async () => {
        if (!sql.trim()) return;
        setError('');
        setResult(null);
        setLoading(true);
        try {
            const r = await api.query(sql);
            setResult(r);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            run();
        }
    };

    return (
        <>
            <div className="page-header">
                <h2>Query Console</h2>
                <p>Run DuckDB SQL against your memories — use memory names as table names</p>
            </div>
            <div className="page-content">
                <div className="query-editor">
                    <div className="query-editor-header">
                        <span>DuckDB SQL</span>
                        <button className="btn btn-primary" onClick={run} disabled={loading}>
                            <Play size={14} /> {loading ? 'Running...' : 'Run'} <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>⌘↵</span>
                        </button>
                    </div>
                    <textarea
                        className="query-input"
                        value={sql}
                        onChange={e => setSql(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="SELECT * FROM user_preferences LIMIT 10"
                        spellCheck={false}
                    />
                </div>

                {error && (
                    <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--error)', fontSize: 12 }}>
                        {error}
                    </div>
                )}

                {result && (
                    <div className="animate-fade-in" style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                            {result.rowCount} rows · {result.columns.length} columns
                        </div>
                        {result.rows.length > 0 ? (
                            <div className="results-table-wrapper">
                                <table className="results-table">
                                    <thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                                    <tbody>
                                        {result.rows.slice(0, 100).map((row, i) => (
                                            <tr key={i}>{result.columns.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Query returned 0 rows.</div>
                        )}
                    </div>
                )}

                {!result && !error && (
                    <div className="empty-state" style={{ marginTop: 40 }}>
                        <Search />
                        <h3>Run a query</h3>
                        <p>Use memory names as table names. DuckDB reads directly from Parquet files on disk.</p>
                    </div>
                )}
            </div>
        </>
    );
}

// ── Files Page ───────────────────────────────────────────────────────────────

function FilesPage() {
    const [memories, setMemories] = useState([]);
    const [selected, setSelected] = useState(null);
    const [files, setFiles] = useState([]);

    useEffect(() => {
        api.listMemories().then(r => setMemories(r.memories || [])).catch(console.error);
    }, []);

    useEffect(() => {
        if (selected) {
            api.listFiles(selected).then(r => setFiles(r.files || [])).catch(() => setFiles([]));
        }
    }, [selected]);

    return (
        <>
            <div className="page-header">
                <h2>Files</h2>
                <p>Browse and download raw Parquet files from your memories</p>
            </div>
            <div className="page-content">
                <div style={{ display: 'flex', gap: 20 }}>
                    {/* Memory list */}
                    <div style={{ width: 220, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                            Memories
                        </div>
                        {memories.map(m => (
                            <button
                                key={m.name}
                                className={`nav-link ${selected === m.name ? 'active' : ''}`}
                                onClick={() => setSelected(m.name)}
                                style={{ borderRadius: 8 }}
                            >
                                <Layers size={14} /> {m.name}
                                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{m.file_count}</span>
                            </button>
                        ))}
                        {memories.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: 12 }}>No memories</div>
                        )}
                    </div>

                    {/* File list */}
                    <div style={{ flex: 1 }}>
                        {selected ? (
                            files.length > 0 ? (
                                <div className="results-table-wrapper">
                                    <table className="results-table">
                                        <thead><tr><th>File</th><th>Size</th><th>Created</th><th>Download</th></tr></thead>
                                        <tbody>
                                            {files.map(f => (
                                                <tr key={f.path}>
                                                    <td style={{ fontWeight: 500 }}>{f.path}</td>
                                                    <td>{formatBytes(f.size)}</td>
                                                    <td>{new Date(f.uploaded_at).toLocaleString()}</td>
                                                    <td>
                                                        <a href={api.getFileUrl(f.path)} download className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>
                                                            <Download size={12} /> .parquet
                                                        </a>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <HardDrive />
                                    <h3>No files yet</h3>
                                    <p>Write data to "{selected}" to generate Parquet files.</p>
                                </div>
                            )
                        ) : (
                            <div className="empty-state">
                                <HardDrive />
                                <h3>Select a memory</h3>
                                <p>Choose a memory from the left to browse its Parquet files.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Documents Page ───────────────────────────────────────────────────────────

function DocumentsPage() {
    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState(null);
    const [docs, setDocs] = useState([]);

    useEffect(() => {
        api.listDocCollections().then(r => setCollections(r.collections || [])).catch(console.error);
    }, []);

    useEffect(() => {
        if (selected) {
            api.listDocuments(selected).then(r => setDocs(r.documents || [])).catch(() => setDocs([]));
        }
    }, [selected]);

    return (
        <>
            <div className="page-header">
                <h2>Store</h2>
                <p>Key-value JSON store — configs, templates, and references. Use Memories for queryable analytics data.</p>
            </div>
            <div className="page-content">
                <div style={{ display: 'flex', gap: 20 }}>
                    <div style={{ width: 220, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                            Collections
                        </div>
                        {collections.map(c => (
                            <button
                                key={c.collection}
                                className={`nav-link ${selected === c.collection ? 'active' : ''}`}
                                onClick={() => setSelected(c.collection)}
                                style={{ borderRadius: 8 }}
                            >
                                <FileText size={14} /> {c.collection}
                                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{c.doc_count}</span>
                            </button>
                        ))}
                        {collections.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: 12 }}>Empty. Store a config or reference via API or MCP.</div>
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                        {selected && docs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {docs.map(d => (
                                    <div key={d.id} className="card" style={{ cursor: 'default' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>{d.id}</span>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(d.created_at).toLocaleString()}</span>
                                        </div>
                                        <pre style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                            {JSON.stringify(d.data, null, 2)}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        ) : selected ? (
                            <div className="empty-state">
                                <FileText />
                                <h3>No items</h3>
                                <p>Store configs or references in "{selected}" via API or MCP.</p>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <FileText />
                                <h3>Select a collection</h3>
                                <p>Choose a collection from the left to browse stored items.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Connect Page ─────────────────────────────────────────────────────────────

function CopyBlock({ label, value, language = 'json' }) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{ marginBottom: 20 }}>
            {label && <div className="form-label" style={{ marginBottom: 8 }}>{label}</div>}
            <div style={{ position: 'relative' }}>
                <pre style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 10,
                    padding: '16px 48px 16px 16px',
                    fontSize: 12,
                    color: 'var(--accent-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    lineHeight: 1.6,
                    overflow: 'auto',
                    maxHeight: 400,
                }}>
                    {value}
                </pre>
                <button
                    onClick={copy}
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: copied ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 6,
                        padding: '6px 8px',
                        cursor: 'pointer',
                        color: copied ? 'var(--accent-primary)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
            </div>
        </div>
    );
}

function ConnectPage() {
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

    const claudeRemoteConfig = JSON.stringify({
        mcpServers: {
            "structured": {
                command: "npx",
                args: ["-y", "@anthropic-ai/mcp-proxy", `${apiUrl}/mcp`]
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>

                    {/* Claude Desktop */}
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 8,
                                background: 'linear-gradient(135deg, #D4A574 0%, #C4956A 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 18, fontWeight: 700, color: '#fff',
                            }}>C</div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Claude Desktop</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>claude_desktop_config.json</div>
                            </div>
                        </div>
                        <CopyBlock
                            label="Add to your Claude Desktop config"
                            value={claudeConfig}
                        />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            File location:<br />
                            <span style={{ color: 'var(--text-secondary)' }}>macOS:</span> ~/Library/Application Support/Claude/claude_desktop_config.json<br />
                            <span style={{ color: 'var(--text-secondary)' }}>Windows:</span> %APPDATA%\Claude\claude_desktop_config.json
                        </div>
                    </div>

                    {/* Cursor */}
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 8,
                                background: 'linear-gradient(135deg, #00B4D8 0%, #0077B6 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 18, fontWeight: 700, color: '#fff',
                            }}>⌘</div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Cursor</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Settings → MCP Servers</div>
                            </div>
                        </div>
                        <CopyBlock
                            label="Add to Cursor MCP config"
                            value={cursorConfig}
                        />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            Go to <span style={{ color: 'var(--text-secondary)' }}>Cursor Settings → Features → MCP Servers</span><br />
                            Click "Add new MCP server" and paste the config above.
                        </div>
                    </div>

                    {/* Windsurf / Cline */}
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 8,
                                background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 18, fontWeight: 700, color: '#fff',
                            }}>W</div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Windsurf / Cline / Any MCP Client</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Standard MCP stdio transport</div>
                            </div>
                        </div>
                        <CopyBlock
                            label="Docker command (stdio transport)"
                            value={`docker exec -i structured-opensource-mcp-1 node index.js`}
                        />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            Any MCP client that supports stdio transport can connect.<br />
                            Point it to the Docker container running the MCP server.
                        </div>
                    </div>

                    {/* REST API */}
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 8,
                                background: 'linear-gradient(135deg, var(--accent-primary) 0%, #059669 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Terminal size={18} style={{ color: '#fff' }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>REST API</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Direct HTTP access</div>
                            </div>
                        </div>
                        <CopyBlock
                            label="Quick start with curl"
                            value={curlTest}
                            language="bash"
                        />
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
