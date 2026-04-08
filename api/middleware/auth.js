/**
 * Auth Middleware
 * Simple API key validation for single-user OSS deployment.
 */

import { unauthorized } from '../utils/response.js';

/**
 * Validate Bearer token against configured API key.
 * @param {Request} request
 * @param {string} apiKey - Expected API key from env
 * @returns {{ ok: boolean, response?: Response }}
 */
export function authMiddleware(request, apiKey) {
    // Skip auth if no API key is configured (dev mode)
    if (!apiKey) return { ok: true };

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
