import { useState, useEffect } from 'react';
import { api, getSession, setSession, clearSession } from './api.js';
import { LoginPage } from './components/LoginPage.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { MemoriesPage } from './pages/MemoriesPage.jsx';
import { QueryPage } from './pages/QueryPage.jsx';
import { FilesPage } from './pages/FilesPage.jsx';
import { DocumentsPage } from './pages/DocumentsPage.jsx';
import { ConnectPage } from './pages/ConnectPage.jsx';

export default function App() {
    const [page, setPage] = useState('memories');
    const [connected, setConnected] = useState(false);
    const [authEnabled, setAuthEnabled] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
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
            .catch(() => setAuthLoading(false));
    }, []);

    useEffect(() => {
        if (!authenticated) return;
        api.health().then(() => setConnected(true)).catch(() => setConnected(false));
        const interval = setInterval(() => {
            api.health().then(() => setConnected(true)).catch(() => setConnected(false));
        }, 15000);

        const onExpired = () => { clearSession(); setAuthenticated(false); };
        window.addEventListener('auth:expired', onExpired);

        return () => {
            clearInterval(interval);
            window.removeEventListener('auth:expired', onExpired);
        };
    }, [authenticated]);

    const handleLogin = (token) => { setSession(token); setAuthenticated(true); };
    const handleLogout = () => { clearSession(); setAuthenticated(false); };

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
