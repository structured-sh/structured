/**
 * Auth Service — Dashboard Login
 * ─────────────────────────────────────────────────────────────
 * Users set DASHBOARD_PASSWORD in docker-compose.yml or .env.
 * No setup screens. No DB storage. Stateless HMAC session tokens.
 *
 * Separation of concerns:
 *   API_KEY          → machine auth (MCP, scripts, analytics)
 *   DASHBOARD_PASSWORD → human auth (dashboard UI login)
 */

import { createHmac } from 'node:crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SEP = '.';

/**
 * Check if dashboard auth is enabled (password is configured).
 */
export function isDashboardAuthEnabled(password) {
    return !!password;
}

/**
 * Login: verify password, return a stateless HMAC session token.
 * Token format: base64(timestamp) . hmac(password, timestamp)
 */
export function login(inputPassword, configPassword) {
    if (!configPassword) {
        // Auth disabled — return a dummy token
        return { token: 'no-auth', expires_at: null };
    }
    if (inputPassword !== configPassword) {
        throw new Error('Invalid password');
    }
    return { token: generateToken(configPassword), expires_at: tokenExpiry() };
}

/**
 * Validate a session token against the configured password.
 */
export function validateSession(token, configPassword) {
    if (!configPassword) return true;     // Auth disabled
    if (!token) return false;
    if (token === 'no-auth') return false;

    try {
        const [tsB64, mac] = token.split(SEP);
        if (!tsB64 || !mac) return false;

        const ts = parseInt(Buffer.from(tsB64, 'base64').toString(), 10);
        if (isNaN(ts)) return false;
        if (Date.now() - ts > SESSION_TTL_MS) return false;

        const expected = hmac(configPassword, String(ts));
        // Constant-time compare
        if (expected.length !== mac.length) return false;
        let diff = 0;
        for (let i = 0; i < expected.length; i++) {
            diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
        }
        return diff === 0;
    } catch {
        return false;
    }
}

function generateToken(password) {
    const ts = String(Date.now());
    const tsB64 = Buffer.from(ts).toString('base64');
    const mac = hmac(password, ts);
    return `${tsB64}${SEP}${mac}`;
}

function hmac(secret, data) {
    return createHmac('sha256', secret).update(data).digest('hex');
}

function tokenExpiry() {
    return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}
