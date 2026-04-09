/**
 * Auth Middleware
 * Accepts either:
 *   Authorization: Bearer <api_key>   → machine auth (MCP, scripts)
 *   X-Session-Token: <token>          → dashboard human auth (password login)
 */

import { unauthorized } from '../utils/response.js';
import { validateSession } from '../services/auth.js';

/**
 * Validate Bearer token against configured API key.
 * @param {Request} request
 * @param {string} apiKey - Expected API key from env
 * @returns {{ ok: boolean, response?: Response }}
 */
export function authMiddleware(request, apiKey, dashboardPassword) {
    // Skip auth entirely if no API key is configured (dev mode)
    if (!apiKey) return { ok: true };

    // Accept a valid dashboard session token as an alternative to API key
    const sessionToken = request.headers.get('X-Session-Token');
    if (sessionToken && validateSession(sessionToken, dashboardPassword)) {
        return { ok: true };
    }

    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
        return { ok: false, response: unauthorized('Missing Authorization header. Use: Bearer <api_key>') };
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return { ok: false, response: unauthorized('Invalid format. Use: Bearer <api_key>') };
    }

    if (parts[1] !== apiKey) {
        return { ok: false, response: unauthorized('Invalid API key') };
    }

    return { ok: true };
}
