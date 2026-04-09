/**
 * API Client — dashboard ↔ API communication
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_KEY = import.meta.env.VITE_API_KEY || '';

const SESSION_KEY = 'structured_session';

export function getSession() {
    return localStorage.getItem(SESSION_KEY);
}

export function setSession(token) {
    localStorage.setItem(SESSION_KEY, token);
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

async function request(method, path, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };

    if (API_KEY) {
        opts.headers['Authorization'] = `Bearer ${API_KEY}`;
    }

    const session = getSession();
    if (session) {
        opts.headers['X-Session-Token'] = session;
    }

    if (body) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_URL}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || `API error (${res.status})`);
    }

    return data;
}

export const api = {
    // Health
    health: () => request('GET', '/health'),

    // Auth
    authStatus: () => request('GET', '/auth/status'),
    login: (password) => request('POST', '/auth/login', { password }),
    me: () => request('GET', '/auth/me'),
    logout: () => request('POST', '/auth/logout'),

    // Memories
    listMemories: () => request('GET', '/memories'),
    getMemory: (name) => request('GET', `/memories/${encodeURIComponent(name)}`),
    createMemory: (body) => request('POST', '/memories', body),
    updateMemory: (name, body) => request('PUT', `/memories/${encodeURIComponent(name)}`, body),
    deleteMemory: (name) => request('DELETE', `/memories/${encodeURIComponent(name)}`),

    // Write
    writeData: (name, data) => request('POST', `/memories/${encodeURIComponent(name)}/write`, { data }),
    flushMemory: (name) => request('POST', `/memories/${encodeURIComponent(name)}/flush`),
    flushAll: () => request('POST', '/flush'),

    // Query
    query: (sql) => request('POST', '/query', { sql }),
    preview: (name, limit = 10) => request('GET', `/memories/${encodeURIComponent(name)}/preview?limit=${limit}`),

    // Files
    listFiles: (name) => request('GET', `/memories/${encodeURIComponent(name)}/files`),
    getFileUrl: (path) => `${API_URL}/files/${path}`,

    // Documents
    listDocCollections: () => request('GET', '/documents/collections'),
    listDocuments: (collection) => request('GET', `/documents/${encodeURIComponent(collection)}`),
    createDocument: (body) => request('POST', '/documents', body),
    deleteDocument: (collection, id) => request('DELETE', `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`),

    // Status
    status: () => request('GET', '/status'),

    // API Key management
    getApiKey: () => request('GET', '/settings/api-key'),
    rotateApiKey: () => request('POST', '/settings/rotate-key'),
};
