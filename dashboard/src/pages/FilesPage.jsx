import { useState, useEffect } from 'react';
import { HardDrive, Layers, Download } from 'lucide-react';
import { api } from '../api.js';
import { formatBytes } from '../utils/format.js';

export function FilesPage() {
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
