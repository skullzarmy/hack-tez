/**
 * Hackcade game zip validator + extractor.
 *
 * Responsibilities:
 *   - Bound zip size + entry count + per-file size + uncompressed-total size
 *     (defends against zip bombs).
 *   - Validate every file extension against an allowlist.
 *   - Require an `index.html` at the bundle root.
 *   - Auto-inject the SDK script tag into index.html if missing.
 *   - Return an array of { path, bytes } ready for Pinata directory pinning.
 */
import { unzipSync, strFromU8 } from "fflate";

export const MAX_ZIP_BYTES = 5 * 1024 * 1024;          // 5 MB compressed (Netlify Functions cap is 6 MB body)
export const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25 MB total uncompressed (anti-bomb)
export const MAX_ENTRY_COUNT = 200;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;          // 4 MB per file

export const ALLOWED_EXTENSIONS = new Set<string>([
    "html", "htm", "js", "mjs", "css", "json",
    "png", "jpg", "jpeg", "gif", "webp", "svg",
    "wav", "mp3", "ogg",
    "woff", "woff2", "ttf",
    "txt", "map",
]);

export interface ExtractedFile {
    /** Path relative to bundle root, e.g. "index.html" or "assets/sprite.png". */
    path: string;
    /** File contents. */
    bytes: Uint8Array;
}

export interface ValidationError {
    code:
        | "ZIP_TOO_LARGE"
        | "ZIP_DECODE_FAILED"
        | "TOO_MANY_FILES"
        | "FILE_TOO_LARGE"
        | "UNCOMPRESSED_TOO_LARGE"
        | "DISALLOWED_EXTENSION"
        | "MISSING_INDEX_HTML"
        | "PATH_TRAVERSAL"
        | "EMPTY_ZIP";
    message: string;
}

export type ValidationResult =
    | { ok: true; files: ExtractedFile[]; injectedSdk: boolean }
    | { ok: false; error: ValidationError };

const SDK_TAG = '<script src="hackcade-sdk.js"></script>';

function ext(path: string): string {
    const i = path.lastIndexOf(".");
    return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

function isUnsafePath(p: string): boolean {
    if (p.startsWith("/") || p.startsWith("\\")) return true;
    if (p.includes("..")) return true;
    if (/^[a-zA-Z]:/.test(p)) return true; // windows drive letters
    return false;
}

function injectSdkScript(html: string): { html: string; injected: boolean } {
    // Already references an sdk script (any form)
    if (/hackcade-sdk\.js/i.test(html)) return { html, injected: false };

    // Prefer to inject just before </head>; fall back to </body>; finally prepend.
    const headClose = html.match(/<\/head\s*>/i);
    if (headClose && typeof headClose.index === "number") {
        return {
            html: html.slice(0, headClose.index) + `    ${SDK_TAG}\n` + html.slice(headClose.index),
            injected: true,
        };
    }
    const bodyClose = html.match(/<\/body\s*>/i);
    if (bodyClose && typeof bodyClose.index === "number") {
        return {
            html: html.slice(0, bodyClose.index) + `    ${SDK_TAG}\n` + html.slice(bodyClose.index),
            injected: true,
        };
    }
    return { html: SDK_TAG + "\n" + html, injected: true };
}

/**
 * Validate + extract a Hackcade game zip.
 *
 * @param zipBytes  raw zip file contents
 * @param sdkBytes  bytes of hackcade-sdk.js to bundle alongside (always written;
 *                  overrides any user-supplied copy to lock in the canonical SDK)
 */
export function validateAndExtractGameZip(zipBytes: Uint8Array, sdkBytes: Uint8Array): ValidationResult {
    if (zipBytes.byteLength > MAX_ZIP_BYTES) {
        return { ok: false, error: { code: "ZIP_TOO_LARGE", message: `Zip exceeds ${MAX_ZIP_BYTES} bytes` } };
    }

    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(zipBytes);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "decode failed";
        return { ok: false, error: { code: "ZIP_DECODE_FAILED", message: msg } };
    }

    const rawPaths = Object.keys(entries);
    if (rawPaths.length === 0) {
        return { ok: false, error: { code: "EMPTY_ZIP", message: "Zip contains no files" } };
    }

    // If everything is nested under a single top-level directory, strip it so
    // index.html lands at the root. (`my-game/index.html` → `index.html`.)
    let prefix = "";
    const topSegs = new Set<string>();
    for (const p of rawPaths) {
        const seg = p.split("/")[0];
        topSegs.add(seg);
    }
    if (topSegs.size === 1) {
        const only = [...topSegs][0];
        // Only strip if this one top-seg is a directory (some entry contains a slash after it).
        const isDir = rawPaths.some((p) => p.startsWith(only + "/"));
        if (isDir) prefix = only + "/";
    }

    const files: ExtractedFile[] = [];
    let uncompressed = 0;
    let fileCount = 0;
    for (const rawPath of rawPaths) {
        // fflate represents directories as zero-byte entries ending in "/"
        if (rawPath.endsWith("/")) continue;
        const data = entries[rawPath];
        if (!data) continue;

        let path = rawPath;
        if (prefix && path.startsWith(prefix)) path = path.slice(prefix.length);
        if (!path) continue;

        // Skip macOS resource forks and metadata noise.
        if (path.startsWith("__MACOSX/") || path.endsWith(".DS_Store") || path.split("/").pop()?.startsWith("._")) {
            continue;
        }

        if (isUnsafePath(path)) {
            return { ok: false, error: { code: "PATH_TRAVERSAL", message: `Unsafe path: ${rawPath}` } };
        }

        if (data.byteLength > MAX_FILE_BYTES) {
            return { ok: false, error: { code: "FILE_TOO_LARGE", message: `${path} exceeds ${MAX_FILE_BYTES} bytes` } };
        }

        const fileExt = ext(path);
        if (!fileExt || !ALLOWED_EXTENSIONS.has(fileExt)) {
            return {
                ok: false,
                error: { code: "DISALLOWED_EXTENSION", message: `Disallowed file: ${path}` },
            };
        }

        uncompressed += data.byteLength;
        if (uncompressed > MAX_UNCOMPRESSED_BYTES) {
            return {
                ok: false,
                error: { code: "UNCOMPRESSED_TOO_LARGE", message: `Total uncompressed size exceeds ${MAX_UNCOMPRESSED_BYTES} bytes` },
            };
        }

        fileCount += 1;
        if (fileCount > MAX_ENTRY_COUNT) {
            return { ok: false, error: { code: "TOO_MANY_FILES", message: `Too many files (max ${MAX_ENTRY_COUNT})` } };
        }

        files.push({ path, bytes: data });
    }

    const indexEntry = files.find((f) => f.path === "index.html");
    if (!indexEntry) {
        return { ok: false, error: { code: "MISSING_INDEX_HTML", message: "Zip must contain index.html at root" } };
    }

    // Inject SDK script tag if missing.
    let injectedSdk = false;
    try {
        const html = strFromU8(indexEntry.bytes);
        const { html: nextHtml, injected } = injectSdkScript(html);
        if (injected) {
            indexEntry.bytes = new TextEncoder().encode(nextHtml);
            injectedSdk = true;
        }
    } catch {
        // index.html was non-utf8 — leave it alone, SDK still gets written below.
    }

    // Always write/override the canonical SDK file so submitters can't ship a
    // tampered SDK that fakes the player object or session id.
    const existingSdkIdx = files.findIndex((f) => f.path === "hackcade-sdk.js");
    if (existingSdkIdx >= 0) {
        files[existingSdkIdx] = { path: "hackcade-sdk.js", bytes: sdkBytes };
    } else {
        files.push({ path: "hackcade-sdk.js", bytes: sdkBytes });
    }

    return { ok: true, files, injectedSdk };
}
