/**
 * Hackcade — game bundle storage via Netlify Blobs.
 *
 * Replaces the IPFS/Pinata pinning flow. Each game version is stored as a set
 * of individual blob entries under the prefix `<gameId>/v<version>/<path>`.
 * The matching `arcade-files.mts` function serves them at
 * `/arcade-files/<gameId>/v<version>/<path>`.
 */
import { getStore } from "@netlify/blobs";
import type { ExtractedFile } from "./arcade-zip.mts";

const STORE_NAME = "arcade-games";

export function arcadeBlobStore() {
    return getStore({ name: STORE_NAME, consistency: "strong" });
}

/** Build the storage key prefix for a (gameId, version) tuple. */
export function bundleKey(gameId: string, version: number | string): string {
    return `${gameId}/v${version}`;
}

export interface StoreBundleResult {
    key: string;
    fileCount: number;
    totalBytes: number;
}

/** Write all files under the given key prefix. Existing files at that prefix are deleted first. */
export async function storeGameBundle(
    gameId: string,
    version: number | string,
    files: ExtractedFile[],
): Promise<StoreBundleResult> {
    if (!files.length) throw new Error("No files to store");
    const key = bundleKey(gameId, version);
    const store = arcadeBlobStore();

    // Wipe any prior files under this prefix (e.g. zip swap on a pending submission).
    await deleteBundle(gameId, version).catch(() => {});

    let totalBytes = 0;
    for (const f of files) {
        const path = f.path.replace(/^\/+/, "");
        const blobKey = `${key}/${path}`;
        const contentType = guessContentType(path);
        await store.set(blobKey, new Uint8Array(f.bytes), {
            metadata: { contentType, path },
        });
        totalBytes += f.bytes.byteLength;
    }
    return { key, fileCount: files.length, totalBytes };
}

/** Delete every blob under the given (gameId, version). Safe to call when nothing exists. */
export async function deleteBundle(gameId: string, version: number | string): Promise<void> {
    const key = bundleKey(gameId, version);
    const store = arcadeBlobStore();
    const list = await store.list({ prefix: `${key}/` });
    for (const item of list.blobs) {
        await store.delete(item.key);
    }
}

/** Map file extension to a content-type. Falls back to application/octet-stream. */
export function guessContentType(path: string): string {
    const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = m ? m[1] : "";
    switch (ext) {
        case "html":
        case "htm":
            return "text/html; charset=utf-8";
        case "js":
        case "mjs":
            return "application/javascript; charset=utf-8";
        case "css":
            return "text/css; charset=utf-8";
        case "json":
            return "application/json; charset=utf-8";
        case "wasm":
            return "application/wasm";
        case "svg":
            return "image/svg+xml";
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        case "ico":
            return "image/x-icon";
        case "mp3":
            return "audio/mpeg";
        case "ogg":
            return "audio/ogg";
        case "wav":
            return "audio/wav";
        case "mp4":
            return "video/mp4";
        case "webm":
            return "video/webm";
        case "txt":
            return "text/plain; charset=utf-8";
        case "ttf":
            return "font/ttf";
        case "woff":
            return "font/woff";
        case "woff2":
            return "font/woff2";
        default:
            return "application/octet-stream";
    }
}
