/**
 * Response Utilities
 * Standard response helpers for consistent API responses.
 * Adapted from enrich.sh
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
    'Access-Control-Max-Age': '86400',
};

const COMMON_HEADERS = {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
};

/** Return a JSON response */
export function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: COMMON_HEADERS,
    });
}

/** Return an error response */
export function error(message, status = 400) {
    return json({ error: message }, status);
}

/** Return a success response */
export function success(data = null, status = 200) {
    if (data === null) return json({ ok: true }, status);
    return json(data, status);
}

/** Handle CORS preflight */
export function cors() {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

/** Return 404 Not Found */
export function notFound(message = 'Not Found') {
    return error(message, 404);
}

/** Return 401 Unauthorized */
export function unauthorized(message = 'Unauthorized') {
    return error(message, 401);
}

/** Return 500 Internal Server Error */
export function serverError(message = 'Internal Server Error') {
    return error(message, 500);
}
