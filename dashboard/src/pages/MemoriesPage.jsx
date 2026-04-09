import { useState, useEffect } from 'react';
import { Brain, Plus, X, Trash2, Download, Table, HardDrive } from 'lucide-react';
import { api } from '../api.js';
import { formatBytes, formatNumber } from '../utils/format.js';

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

export function MemoriesPage() {
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

                <div className="action-bar">
                    <div className="action-bar-left" />
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        <Plus /> New Memory
                    </button>
                </div>

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
