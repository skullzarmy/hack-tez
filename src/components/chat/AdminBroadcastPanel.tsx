import { useState, useEffect, useCallback } from "react";
import { Megaphone, Send, Loader2, ExternalLink, Clock, CheckCircle2, XCircle } from "lucide-react";
import { hackchatUrl, siteUrl } from "../../config/tezos";
import { useTezos } from "../../context/TezosContext";
import { signMessage, buildAuthChallenge } from "../../lib/signing";
import { authedFetch } from "../../lib/authedFetch";

interface Broadcast {
    id: number;
    title: string;
    body: string;
    url: string | null;
    adminDomain: string;
    sentCount: number;
    failedCount: number;
    createdAt: string;
}

interface AdminBroadcastPanelProps {
    token: string;
    onClose: () => void;
}

export default function AdminBroadcastPanel({ token: _token, onClose }: AdminBroadcastPanelProps) {
    const { client, address } = useTezos();
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [url, setUrl] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ sent: number; failed: number } | null>(null);
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    // Load broadcast history
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await authedFetch(`${hackchatUrl}/admin/broadcasts?limit=20`);
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    setBroadcasts(data.broadcasts ?? []);
                }
            } catch { /* ignore */ }
            if (!cancelled) setLoadingHistory(false);
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    const handleSend = useCallback(async () => {
        if (!title.trim() || !body.trim() || !client || !address) return;
        setError(null);
        setSuccess(null);
        setSending(true);

        try {
            // Build a SIWE-style challenge that includes the broadcast intent so the
            // signature is bound to THIS broadcast (not just to "I am admin").
            const host = new URL(siteUrl).host;
            const network = (await import("../../config/tezos")).default.name === "mainnet" ? "mainnet" : "ghostnet";
            const { message } = buildAuthChallenge({
                address,
                domain: host,
                uri: siteUrl,
                network,
                statement: `Send admin broadcast: "${title.trim()}"`,
            });
            const { signature, publicKey } = await signMessage(client, message);

            const res = await authedFetch(`${hackchatUrl}/admin/broadcast`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    body: body.trim(),
                    url: url.trim() || undefined,
                    message,
                    signature,
                    publicKey,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: "Broadcast failed" }));
                throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`);
            }

            const result = await res.json() as { sent: number; failed: number };
            setSuccess(result);
            setTitle("");
            setBody("");
            setUrl("");

            // Refresh history
            const histRes = await authedFetch(`${hackchatUrl}/admin/broadcasts?limit=20`);
            if (histRes.ok) {
                const data = await histRes.json();
                setBroadcasts(data.broadcasts ?? []);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Broadcast failed");
        } finally {
            setSending(false);
        }
    }, [title, body, url, client, address]);

    const monoFont = "var(--font-mono)";
    const panelStyle: React.CSSProperties = {
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
    };
    const cardStyle: React.CSSProperties = {
        background: "var(--bg-2, #1a1a2e)",
        border: "1px solid var(--border, #333)",
        borderRadius: "12px",
        width: "min(480px, 90vw)",
        maxHeight: "85vh",
        overflow: "auto",
        padding: "24px",
        fontFamily: monoFont,
    };
    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "8px 12px",
        background: "var(--bg-3, #111)",
        border: "1px solid var(--border, #333)",
        borderRadius: "6px",
        color: "var(--fg, #eee)",
        fontFamily: monoFont,
        fontSize: "13px",
        outline: "none",
    };
    const labelStyle: React.CSSProperties = {
        display: "block",
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.12em",
        color: "var(--fg-2, #aaa)",
        marginBottom: "4px",
        fontFamily: monoFont,
    };

    return (
        <div style={panelStyle} onClick={onClose}>
            <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                    <Megaphone size={18} style={{ color: "var(--accent)" }} />
                    <span
                        style={{
                            fontSize: "14px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.15em",
                            color: "var(--fg, #eee)",
                        }}
                    >
                        Admin Broadcast
                    </span>
                </div>

                {/* Compose form */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                    <div>
                        <label style={labelStyle}>Title *</label>
                        <input
                            style={inputStyle}
                            value={title}
                            onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                            placeholder="Announcement title"
                            maxLength={100}
                            disabled={sending}
                        />
                        <span style={{ fontSize: "10px", color: "var(--fg-3, #666)", float: "right", marginTop: "2px" }}>
                            {title.length}/100
                        </span>
                    </div>

                    <div>
                        <label style={labelStyle}>Message *</label>
                        <textarea
                            style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
                            value={body}
                            onChange={(e) => setBody(e.target.value.slice(0, 500))}
                            placeholder="Broadcast message body"
                            maxLength={500}
                            disabled={sending}
                        />
                        <span style={{ fontSize: "10px", color: "var(--fg-3, #666)", float: "right", marginTop: "2px" }}>
                            {body.length}/500
                        </span>
                    </div>

                    <div>
                        <label style={labelStyle}>Link (optional)</label>
                        <input
                            style={inputStyle}
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://..."
                            type="url"
                            disabled={sending}
                        />
                    </div>
                </div>

                {/* Status messages */}
                {error && (
                    <div
                        style={{
                            padding: "8px 12px",
                            background: "rgba(255,0,60,0.1)",
                            border: "1px solid rgba(255,0,60,0.3)",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "#ff4d6a",
                            marginBottom: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}
                    >
                        <XCircle size={14} />
                        {error}
                    </div>
                )}

                {success && (
                    <div
                        style={{
                            padding: "8px 12px",
                            background: "var(--accent-bg)",
                            border: "1px solid var(--accent)",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "var(--accent)",
                            marginBottom: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}
                    >
                        <CheckCircle2 size={14} />
                        Sent to {success.sent} subscriber{success.sent !== 1 ? "s" : ""}
                        {success.failed > 0 && ` (${success.failed} failed)`}
                    </div>
                )}

                {/* Send button */}
                <button
                    onClick={() => void handleSend()}
                    disabled={!title.trim() || !body.trim() || sending || !client}
                    style={{
                        width: "100%",
                        padding: "10px",
                        background: !title.trim() || !body.trim() || sending
                            ? "var(--bg-3, #222)"
                            : "var(--accent)",
                        color: !title.trim() || !body.trim() || sending
                            ? "var(--fg-3, #666)"
                            : "var(--bg, #0a0a1a)",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 700,
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        cursor: !title.trim() || !body.trim() || sending ? "not-allowed" : "pointer",
                        fontFamily: monoFont,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                    }}
                >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {sending ? "Signing & Sending…" : "Send Broadcast"}
                </button>

                {/* Broadcast history */}
                <div style={{ marginTop: "24px", borderTop: "1px solid var(--border, #333)", paddingTop: "16px" }}>
                    <div
                        style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.12em",
                            color: "var(--fg-2, #aaa)",
                            marginBottom: "12px",
                        }}
                    >
                        Broadcast History
                    </div>

                    {loadingHistory ? (
                        <div style={{ textAlign: "center", padding: "16px", color: "var(--fg-3, #666)" }}>
                            <Loader2 size={16} className="animate-spin" style={{ display: "inline" }} />
                        </div>
                    ) : broadcasts.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "16px", color: "var(--fg-3, #666)", fontSize: "12px" }}>
                            No broadcasts sent yet.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {broadcasts.map((b) => (
                                <div
                                    key={b.id}
                                    style={{
                                        padding: "10px 12px",
                                        background: "var(--bg-3, #111)",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-subtle, #222)",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--fg, #eee)" }}>
                                            {b.title}
                                        </span>
                                        <span style={{ fontSize: "10px", color: "var(--fg-3, #666)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "3px" }}>
                                            <Clock size={10} />
                                            {new Date(`${b.createdAt}Z`).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--fg-2, #aaa)", marginTop: "4px" }}>
                                        {b.body}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", fontSize: "10px", color: "var(--fg-3, #666)" }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                            <CheckCircle2 size={10} style={{ color: "var(--accent)" }} />
                                            {b.sentCount} sent
                                        </span>
                                        {b.failedCount > 0 && (
                                            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                                <XCircle size={10} style={{ color: "#ff4d6a" }} />
                                                {b.failedCount} failed
                                            </span>
                                        )}
                                        {b.url && (
                                            <a
                                                href={b.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ display: "flex", alignItems: "center", gap: "2px", color: "var(--accent)" }}
                                            >
                                                <ExternalLink size={10} />
                                                link
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
