import { Brain, Search, HardDrive, FileText, Cable, LogOut } from 'lucide-react';

export function Sidebar({ page, setPage, connected, onLogout }) {
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
