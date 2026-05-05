/**
 * Sandbox — local-only hackcade game preview.
 *
 * Drop a zip in, get a working iframe with mocked identity. Nothing leaves
 * the browser. This is the same engine used by the Submit "Preview" button.
 *
 * Approach:
 *   1. unzip in-browser via fflate
 *   2. for each non-html asset → URL.createObjectURL(blob) keyed by relative path
 *   3. rewrite index.html: src/href to blob URLs, also any "./hackcade-sdk.js"
 *      reference points at our canonical SDK (loaded as ?raw at build time)
 *   4. iframe srcdoc = rewritten html. sandbox="allow-scripts" only.
 *   5. mock identity panel + event log + lifecycle controls.
 *
 * Limitations (acceptable for a preview tool):
 *   - dynamic `import("./foo.js")` from inside game code is NOT rewritten;
 *     only HTML-level src/href and `import "./x"` strings inside ESM scripts
 *     loaded via `<script type="module" src=…>` (those get rewritten when we
 *     read them as text and convert to blob URLs).
 *   - same-origin XHR/fetch into the bundle is NOT supported; ship assets as
 *     direct asset references.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import sdkSource from "../../../hackcade/sdk/hackcade-sdk.js?raw";
import FilePicker from "./FilePicker";

const MIME: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    js: "text/javascript",
    mjs: "text/javascript",
    css: "text/css",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    txt: "text/plain",
    map: "application/json",
};

function mimeFor(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return MIME[ext] || "application/octet-stream";
}

function normalizePath(p: string): string {
    return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

interface SandboxProps {
    initialZip?: File | null;
    compact?: boolean;
}

interface MockIdentity {
    isGuest: boolean;
    label: string;
    domain: string;
    address: string;
}

interface LogEntry {
    ts: number;
    dir: "in" | "out";
    type: string;
    payload: unknown;
}

const DEFAULT_IDENTITY: MockIdentity = {
    isGuest: false,
    label: "sandbox",
    domain: "sandbox.hack.tez",
    address: "tz1Sandbox",
};

export default function Sandbox({ initialZip = null, compact = false }: SandboxProps) {
    const [zip, setZip] = useState<File | null>(initialZip);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [srcDoc, setSrcDoc] = useState<string | null>(null);
    const [identity, setIdentity] = useState<MockIdentity>(DEFAULT_IDENTITY);
    const [score, setScore] = useState<number | null>(null);
    const [finalScore, setFinalScore] = useState<{ score: number; durationMs?: number } | null>(null);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [reloadKey, setReloadKey] = useState(0);
    const blobUrlsRef = useRef<string[]>([]);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const identityRef = useRef(identity);
    useEffect(() => {
        identityRef.current = identity;
    }, [identity]);

    const cleanupBlobs = useCallback(() => {
        for (const u of blobUrlsRef.current) {
            try {
                URL.revokeObjectURL(u);
            } catch {
                /* ignore */
            }
        }
        blobUrlsRef.current = [];
    }, []);

    useEffect(() => () => cleanupBlobs(), [cleanupBlobs]);

    // Sync initialZip prop changes (when reused from Submit modal).
    useEffect(() => {
        if (initialZip && initialZip !== zip) setZip(initialZip);
    }, [initialZip, zip]);

    const buildPlayerForInit = useCallback((id: MockIdentity) => {
        if (id.isGuest) {
            return {
                domain: "",
                label: "guest",
                address: "",
                avatarUrl: "",
                hackatarUrl: "",
            };
        }
        const hackatarUrl = `/api/v1/hackatar/${encodeURIComponent(id.label)}?static=1`;
        return {
            domain: id.domain,
            label: id.label,
            address: id.address,
            avatarUrl: hackatarUrl,
            hackatarUrl,
        };
    }, []);

    const pushLog = useCallback((entry: LogEntry) => {
        setLog((l) => {
            const next = [...l, entry];
            if (next.length > 200) next.splice(0, next.length - 200);
            return next;
        });
    }, []);

    // Listen to messages from the iframe.
    useEffect(() => {
        function onMessage(ev: MessageEvent) {
            const iframe = iframeRef.current;
            if (!iframe || ev.source !== iframe.contentWindow) return;
            const data = ev.data;
            if (!data || typeof data !== "object" || typeof (data as { type?: unknown }).type !== "string") return;
            const type = (data as { type: string }).type;
            if (!type.startsWith("hackcade:")) return;
            pushLog({ ts: Date.now(), dir: "in", type, payload: data });

            if (type === "hackcade:ready") {
                // Reply with init carrying mocked identity.
                const player = buildPlayerForInit(identityRef.current);
                const sessionId = `sandbox-${Math.random().toString(36).slice(2, 10)}`;
                const initMsg = { type: "hackcade:init", player, sessionId };
                iframe.contentWindow?.postMessage(initMsg, "*");
                pushLog({ ts: Date.now(), dir: "out", type: "hackcade:init", payload: initMsg });
            } else if (type === "hackcade:score") {
                const s = Number((data as { score?: unknown }).score);
                if (Number.isFinite(s)) setScore(s);
            } else if (type === "hackcade:gameover") {
                const s = Number((data as { score?: unknown }).score) || 0;
                const durationMs =
                    Number((data as { durationMs?: unknown }).durationMs) ||
                    Number((data as { durationSeconds?: unknown }).durationSeconds) * 1000 ||
                    undefined;
                setFinalScore({ score: s, durationMs });
            }
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [buildPlayerForInit, pushLog]);

    const buildSrcDoc = useCallback(
        async (file: File) => {
            cleanupBlobs();
            setError(null);
            setSrcDoc(null);
            setScore(null);
            setFinalScore(null);
            setLog([]);
            setBusy(true);
            try {
                const buf = new Uint8Array(await file.arrayBuffer());
                const entries = unzipSync(buf);

                // Build path → blob URL map (excluding the html we're going to inline).
                const pathToBlobUrl = new Map<string, string>();
                let indexHtmlPath: string | null = null;
                let indexHtmlBytes: Uint8Array | null = null;

                for (const [rawPath, bytes] of Object.entries(entries)) {
                    const path = normalizePath(rawPath);
                    if (!path || path.endsWith("/")) continue;
                    if (!indexHtmlPath && /(^|\/)index\.html?$/i.test(path)) {
                        indexHtmlPath = path;
                        indexHtmlBytes = bytes;
                        continue;
                    }
                }

                if (!indexHtmlPath || !indexHtmlBytes) {
                    throw new Error("No index.html found at the zip root.");
                }

                const indexDir = indexHtmlPath.includes("/")
                    ? indexHtmlPath.slice(0, indexHtmlPath.lastIndexOf("/") + 1)
                    : "";

                // Inject canonical SDK as a blob (overrides any user-bundled copy).
                const sdkBlob = new Blob([sdkSource], { type: "text/javascript" });
                const sdkUrl = URL.createObjectURL(sdkBlob);
                blobUrlsRef.current.push(sdkUrl);
                pathToBlobUrl.set(`${indexDir}hackcade-sdk.js`, sdkUrl);
                pathToBlobUrl.set("hackcade-sdk.js", sdkUrl);

                // Pre-create blob URLs for every other asset. ESM modules get
                // their relative imports rewritten too, so they need a second pass.
                const textAssets = new Map<string, { bytes: Uint8Array; isModule: boolean }>();

                for (const [rawPath, bytes] of Object.entries(entries)) {
                    const path = normalizePath(rawPath);
                    if (!path || path.endsWith("/")) continue;
                    if (path === indexHtmlPath) continue;
                    if (pathToBlobUrl.has(path)) continue;
                    const ext = path.split(".").pop()?.toLowerCase() ?? "";
                    if (ext === "js" || ext === "mjs") {
                        // Defer until after we know all blob URLs.
                        textAssets.set(path, { bytes, isModule: true });
                    } else if (ext === "css") {
                        textAssets.set(path, { bytes, isModule: false });
                    } else {
                        const blob = new Blob([bytes as BlobPart], { type: mimeFor(path) });
                        const url = URL.createObjectURL(blob);
                        blobUrlsRef.current.push(url);
                        pathToBlobUrl.set(path, url);
                    }
                }

                // Now create text-asset URLs with rewritten refs (best-effort).
                // Two passes: first allocate placeholder URLs by inserting bytes,
                // then we replace below. But order matters because JS may reference
                // other JS. Do it in a stable order: rewrite each text file using
                // the union of (binary blobs + other text files' future URLs).
                // To make all paths resolvable, we eagerly create blobs for text
                // files and then re-write them in a second pass via revoke+recreate.
                const textBlobUrls = new Map<string, string>();
                for (const [path, info] of textAssets) {
                    const text = strFromU8(info.bytes);
                    const blob = new Blob([text], {
                        type: info.isModule ? "text/javascript" : mimeFor(path),
                    });
                    const url = URL.createObjectURL(blob);
                    blobUrlsRef.current.push(url);
                    textBlobUrls.set(path, url);
                    pathToBlobUrl.set(path, url);
                }

                // Second pass: rewrite ESM imports inside JS files. Since blob
                // URLs are immutable, we revoke and recreate.
                for (const [path, info] of textAssets) {
                    if (!info.isModule) continue;
                    const original = strFromU8(info.bytes);
                    const rewritten = rewriteImports(original, path, pathToBlobUrl);
                    if (rewritten === original) continue;
                    const oldUrl = textBlobUrls.get(path);
                    if (oldUrl) {
                        try {
                            URL.revokeObjectURL(oldUrl);
                        } catch {
                            /* ignore */
                        }
                        const idx = blobUrlsRef.current.indexOf(oldUrl);
                        if (idx >= 0) blobUrlsRef.current.splice(idx, 1);
                    }
                    const newBlob = new Blob([rewritten], { type: "text/javascript" });
                    const newUrl = URL.createObjectURL(newBlob);
                    blobUrlsRef.current.push(newUrl);
                    pathToBlobUrl.set(path, newUrl);
                }

                // Rewrite index.html: src/href, plus inline module imports.
                let html = strFromU8(indexHtmlBytes);
                html = rewriteHtml(html, indexDir, pathToBlobUrl);

                // Ensure SDK script is present (matches server-side behavior).
                if (!/hackcade-sdk\.js/i.test(html) && !html.includes(sdkUrl)) {
                    const tag = `<script type="module" src="${sdkUrl}"></script>`;
                    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${tag}\n</head>`);
                    else if (/<body[^>]*>/i.test(html)) html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${tag}`);
                    else html = `${tag}\n${html}`;
                }

                setSrcDoc(html);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load zip");
            } finally {
                setBusy(false);
            }
        },
        [cleanupBlobs]
    );

    useEffect(() => {
        if (zip) void buildSrcDoc(zip);
        else {
            cleanupBlobs();
            setSrcDoc(null);
        }
    }, [zip, buildSrcDoc, cleanupBlobs, reloadKey]);

    function postLifecycle(type: "start" | "pause" | "resume") {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        const msg = { type: `hackcade:${type}` };
        win.postMessage(msg, "*");
        pushLog({ ts: Date.now(), dir: "out", type: msg.type, payload: msg });
    }

    function reload() {
        setScore(null);
        setFinalScore(null);
        setLog([]);
        setReloadKey((k) => k + 1);
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!compact && (
                <div style={panel}>
                    <h2 style={{ margin: 0, color: "#fff", fontSize: 16 }}>Local sandbox</h2>
                    <p style={{ fontSize: 12, opacity: 0.75, margin: "6px 0 10px" }}>
                        Drop a hackcade game zip below. It runs entirely in your browser — nothing is uploaded. Use this
                        to iterate on your build before submitting.
                    </p>
                    <FilePicker file={zip} onChange={setZip} maxBytes={5 * 1024 * 1024} />
                </div>
            )}

            {compact && (
                <div style={{ ...panel, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                        style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: "#7eff9f",
                            boxShadow: "0 0 8px #7eff9f",
                        }}
                    />
                    <span style={{ fontSize: 12, opacity: 0.85 }}>
                        Local preview · nothing uploaded · {zip?.name ?? "no file"}
                    </span>
                </div>
            )}

            {error && <div style={errBox}>{error}</div>}

            {busy && (
                <div style={{ ...panel, fontSize: 12, opacity: 0.8 }}>
                    Unzipping & rewriting asset URLs…
                </div>
            )}

            {srcDoc && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: compact ? "1fr" : "minmax(0, 1fr) 280px",
                        gap: 12,
                    }}
                >
                    <div>
                        <iframe
                            key={reloadKey}
                            ref={iframeRef}
                            title="Hackcade sandbox preview"
                            srcDoc={srcDoc}
                            sandbox="allow-scripts"
                            style={{
                                width: "100%",
                                aspectRatio: "9 / 16",
                                maxHeight: compact ? 520 : 640,
                                background: "#000",
                                border: "1px solid rgba(0,255,170,0.4)",
                                borderRadius: 6,
                                display: "block",
                            }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <button type="button" style={btn} onClick={reload}>
                                Reload
                            </button>
                            <button type="button" style={btn} onClick={() => postLifecycle("start")}>
                                Send start
                            </button>
                            <button type="button" style={btn} onClick={() => postLifecycle("pause")}>
                                Send pause
                            </button>
                            <button type="button" style={btn} onClick={() => postLifecycle("resume")}>
                                Send resume
                            </button>
                            <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, opacity: 0.85 }}>
                                Score:{" "}
                                <strong style={{ color: "#fff" }}>
                                    {score ?? finalScore?.score ?? "—"}
                                </strong>
                                {finalScore && (
                                    <span style={{ marginLeft: 8, color: "#7eff9f" }}>final</span>
                                )}
                            </span>
                        </div>
                    </div>

                    <SidePanel
                        identity={identity}
                        onIdentityChange={setIdentity}
                        log={log}
                        onClear={() => setLog([])}
                    />
                </div>
            )}
        </div>
    );
}

function rewriteImports(source: string, path: string, blobMap: Map<string, string>): string {
    // Best-effort: rewrite static `import … from "./x"` and `import "./x"` and
    // `export … from "./x"`. Resolve relative to the JS file's path.
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    const re = /(import\s+(?:[^'"`;]+\s+from\s+)?|export\s+[^'"`;]+\s+from\s+|import\s*\(\s*)(['"])([^'"]+)(['"])/g;
    return source.replace(re, (full, prefix, q1, spec, q2) => {
        if (!spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("/")) return full;
        const resolved = resolveRelative(spec.startsWith("/") ? spec.slice(1) : dir + spec);
        const url = blobMap.get(resolved);
        return url ? `${prefix}${q1}${url}${q2}` : full;
    });
}

function rewriteHtml(html: string, indexDir: string, blobMap: Map<string, string>): string {
    return html.replace(
        /\b(src|href)\s*=\s*(['"])([^'"]+)(['"])/gi,
        (full, attr, q1, val: string, q2) => {
            if (/^(?:[a-z]+:|\/\/|data:|blob:|#)/i.test(val)) return full;
            const path = resolveRelative(indexDir + val.replace(/^\.?\//, ""));
            const url = blobMap.get(path);
            return url ? `${attr}=${q1}${url}${q2}` : full;
        }
    );
}

function resolveRelative(p: string): string {
    const parts = p.split("/").filter(Boolean);
    const out: string[] = [];
    for (const seg of parts) {
        if (seg === "..") out.pop();
        else if (seg !== ".") out.push(seg);
    }
    return out.join("/");
}

function SidePanel({
    identity,
    onIdentityChange,
    log,
    onClear,
}: {
    identity: MockIdentity;
    onIdentityChange: (id: MockIdentity) => void;
    log: LogEntry[];
    onClear: () => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={panel}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.85, marginBottom: 8 }}>
                    MOCK IDENTITY
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 8 }}>
                    <input
                        type="checkbox"
                        checked={identity.isGuest}
                        onChange={(e) => onIdentityChange({ ...identity, isGuest: e.target.checked })}
                    />
                    <span>Connect as guest</span>
                </label>
                <Field label="Label">
                    <input
                        style={inp}
                        disabled={identity.isGuest}
                        value={identity.label}
                        onChange={(e) =>
                            onIdentityChange({
                                ...identity,
                                label: e.target.value,
                                domain: e.target.value ? `${e.target.value}.hack.tez` : "",
                            })
                        }
                    />
                </Field>
                <Field label="Address">
                    <input
                        style={inp}
                        disabled={identity.isGuest}
                        value={identity.address}
                        onChange={(e) => onIdentityChange({ ...identity, address: e.target.value })}
                    />
                </Field>
                <p style={{ fontSize: 11, opacity: 0.6, margin: "8px 0 0" }}>
                    Identity is sent on the next reload via the standard <code>hackcade:init</code> message.
                </p>
            </div>

            <div style={panel}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                    }}
                >
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.85 }}>EVENT LOG</span>
                    <button type="button" style={btnSm} onClick={onClear}>
                        Clear
                    </button>
                </div>
                <div
                    style={{
                        maxHeight: 260,
                        overflow: "auto",
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(0,255,170,0.15)",
                        borderRadius: 4,
                        padding: 6,
                        fontSize: 11,
                        fontFamily: "ui-monospace,monospace",
                    }}
                >
                    {!log.length && <div style={{ opacity: 0.5 }}>No messages yet…</div>}
                    {log.map((e, i) => (
                        <div
                            key={i}
                            style={{
                                padding: "4px 0",
                                borderBottom: i < log.length - 1 ? "1px solid rgba(0,255,170,0.08)" : "none",
                            }}
                        >
                            <span
                                style={{
                                    color: e.dir === "in" ? "#7eff9f" : "#ffe66d",
                                    fontWeight: 700,
                                    marginRight: 6,
                                }}
                            >
                                {e.dir === "in" ? "←" : "→"}
                            </span>
                            <span style={{ color: "#aafff0" }}>{e.type}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, marginBottom: 6 }}>
            <span style={{ opacity: 0.8 }}>{label}</span>
            {children}
        </label>
    );
}

const panel: React.CSSProperties = {
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(0,255,170,0.25)",
    borderRadius: 8,
    padding: 14,
    color: "#aafff0",
    fontFamily: "ui-monospace,monospace",
};

const errBox: React.CSSProperties = {
    padding: "8px 10px",
    border: "1px solid rgba(255,107,107,0.4)",
    borderRadius: 4,
    color: "#ff8a8a",
    fontSize: 12,
    background: "rgba(255,107,107,0.08)",
    fontFamily: "ui-monospace,monospace",
};

const inp: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(0,255,170,0.3)",
    borderRadius: 4,
    padding: "6px 8px",
    color: "#fff",
    fontFamily: "ui-monospace,monospace",
    fontSize: 12,
};

const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.5)",
    color: "#aafff0",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
    fontSize: 12,
};

const btnSm: React.CSSProperties = {
    ...btn,
    padding: "2px 8px",
    fontSize: 11,
};
