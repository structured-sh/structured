import { useState } from 'react';
import { Copy, Check, ChevronRight } from 'lucide-react';

export function CopyBlock({ label, value, defaultExpanded = false }) {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(defaultExpanded);

    const copy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{ marginBottom: 12 }}>
            <button
                onClick={() => setExpanded(v => !v)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: expanded ? '8px 8px 0 0' : 8,
                    padding: '7px 10px',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    transition: 'border-radius 0.15s ease',
                    gap: 8,
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <ChevronRight size={11} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }} />
                    {label || 'Config'}
                </span>
                <button
                    onClick={copy}
                    style={{
                        background: copied ? 'var(--accent-dim)' : 'transparent',
                        border: 'none',
                        borderRadius: 4,
                        padding: '2px 6px',
                        cursor: 'pointer',
                        color: copied ? 'var(--accent-primary)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                    }}
                >
                    {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                </button>
            </button>

            {expanded && (
                <pre style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--glass-border)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '12px 14px',
                    fontSize: 11,
                    color: 'var(--accent-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    lineHeight: 1.6,
                    overflow: 'auto',
                    maxHeight: 280,
                    margin: 0,
                }}>
                    {value}
                </pre>
            )}
        </div>
    );
}
