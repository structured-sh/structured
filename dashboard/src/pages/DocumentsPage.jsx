import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../api.js';

export function DocumentsPage() {
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
