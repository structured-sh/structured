import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../api.js';

export function LoginPage({ onLogin }) {
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
            <div style={{ width: 340, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: 32, boxShadow: 'var(--glass-shadow)' }}>
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
