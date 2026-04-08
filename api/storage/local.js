/**
 * Local Filesystem Storage Adapter
 * Drop-in replacement for S3Client interface — stores files on local disk.
 * Same API as enrich.sh S3Client for easy cloud migration later.
 */

import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

export class LocalStorage {
    /**
     * @param {string} basePath - Root directory for storage (e.g., ./data/parquet)
     */
    constructor(basePath) {
        this.basePath = resolve(basePath);
    }

    /**
     * Write a file.
     * @param {string} key - File path relative to basePath
     * @param {Uint8Array|Buffer|string} body - File content
     * @param {Object} [options] - { customMetadata }
     */
    async put(key, body, options = {}) {
        const fullPath = join(this.basePath, key);
        const dir = dirname(fullPath);

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, body);

        // Store metadata as a sidecar .meta.json file
        if (options.customMetadata && Object.keys(options.customMetadata).length > 0) {
            const metaPath = fullPath + '.meta.json';
            await fs.writeFile(metaPath, JSON.stringify(options.customMetadata, null, 2));
        }
    }

    /**
     * Read a file.
     * @param {string} key
     * @returns {Promise<{ body: Buffer, metadata: Object } | null>}
     */
    async get(key) {
        const fullPath = join(this.basePath, key);

        try {
            const body = await fs.readFile(fullPath);
            let metadata = {};
            const metaPath = fullPath + '.meta.json';
            try {
                const metaRaw = await fs.readFile(metaPath, 'utf-8');
                metadata = JSON.parse(metaRaw);
            } catch {
                // No metadata file — that's fine
            }
            return { body, metadata };
        } catch (err) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    }

    /**
     * List files by prefix.
     * @param {{ prefix?: string }} [options]
     * @returns {Promise<{ objects: Array<{ key: string, size: number, uploaded: Date }> }>}
     */
    async list({ prefix = '' } = {}) {
        const searchDir = join(this.basePath, prefix);
        const objects = [];

        try {
            await this._walkDir(searchDir, this.basePath, objects);
        } catch (err) {
            if (err.code === 'ENOENT') return { objects: [] };
            throw err;
        }

        // Filter by prefix and exclude metadata sidecar files
        const filtered = objects
            .filter(o => o.key.startsWith(prefix) && !o.key.endsWith('.meta.json'))
            .sort((a, b) => b.uploaded - a.uploaded);

        return { objects: filtered };
    }

    /**
     * Delete a file.
     * @param {string} key
     */
    async delete(key) {
        const fullPath = join(this.basePath, key);
        try {
            await fs.unlink(fullPath);
            // Also remove metadata sidecar
            try { await fs.unlink(fullPath + '.meta.json'); } catch { }
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    }

    /**
     * Recursively walk a directory.
     * @private
     */
    async _walkDir(dir, basePath, results) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await this._walkDir(fullPath, basePath, results);
            } else if (entry.isFile()) {
                const stat = await fs.stat(fullPath);
                const key = fullPath.slice(basePath.length + 1); // relative path
                results.push({
                    key,
                    size: stat.size,
                    uploaded: stat.mtime,
                });
            }
        }
    }
}
