import { useState } from 'react';
import { Search, Play } from 'lucide-react';
import { api } from '../api.js';

export function QueryPage() {
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
