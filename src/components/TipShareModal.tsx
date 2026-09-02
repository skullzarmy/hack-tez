/** biome-ignore-all lint/suspicious/noCommentText: <matches Profile> */

import { SiBluesky, SiX } from "@icons-pack/react-simple-icons";
import { Check, Copy, X as XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { opExplorerUrl } from "../lib/tips";
import type { SharePlatform, TipShareContext } from "../lib/tipShare";
import {
    buildTipShareText,
    openShareIntent,
    tipShareMention,
    tipShareUrl,
} from "../lib/tipShare";

const OVERLAY: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    zIndex: 200,
};

const PANEL: React.CSSProperties = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "1.5rem",
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    maxHeight: "90vh",
    overflowY: "auto",
};

const SHARE_BUTTON: React.CSSProperties = {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.45rem",
    background: "var(--fg)",
    color: "var(--bg)",
    border: "none",
    borderRadius: "6px",
    padding: "0.65rem 0.9rem",
    fontSize: "0.75rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    fontFamily: "var(--font)",
    cursor: "pointer",
};

const GHOST_BUTTON: React.CSSProperties = {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--fg-3)",
    cursor: "pointer",
    fontSize: "0.72rem",
    padding: "0.5rem 0.8rem",
    fontFamily: "var(--font)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.4rem",
};

/**
 * Post-tip celebration + share sheet.
 *
 * The composed text is editable before it goes out: intent URLs prefill the
 * composer, and people like to add their own words.
 */
export function TipShareModal({
    ctx,
    opHash,
    onClose,
}: {
    ctx: TipShareContext;
    opHash: string;
    onClose: () => void;
}) {
    const [platform, setPlatform] = useState<SharePlatform>("x");
    const [text, setText] = useState(() => buildTipShareText(ctx, "x"));
    const [edited, setEdited] = useState(false);
    const [copied, setCopied] = useState(false);

    // Swapping platform re-templates the post — unless the tipper wrote their own.
    function switchPlatform(next: SharePlatform) {
        setPlatform(next);
        if (!edited) setText(buildTipShareText(ctx, next));
    }

    // Escape closes, matching every other dialog people have used.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(t);
    }, [copied]);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(`${text}`);
            setCopied(true);
        } catch {
            // Clipboard can be blocked; the textarea is selectable as a fallback.
        }
    }

    const mention = tipShareMention(ctx, platform);
    const target = ctx.projectName ?? ctx.displayName;

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Escape closes this modal; the overlay click is a redundant mouse affordance
        <div
            style={OVERLAY}
            onClick={onClose}
            role="presentation"
        >
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: click here only stops propagation */}
            <div
                style={PANEL}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tip-share-title"
            >
                {/* ── Header ──────────────────────────────────── */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "1rem",
                    }}
                >
                    <div>
                        <h2
                            id="tip-share-title"
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "1rem",
                                color: "var(--ok)",
                                marginBottom: "0.3rem",
                            }}
                        >
                            Tip sent ⚡
                        </h2>
                        <p style={{ fontSize: "0.8rem", color: "var(--fg-2)" }}>
                            {ctx.amount} {ctx.unit} to {target}. Let them know?
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--fg-3)",
                            cursor: "pointer",
                            padding: "0.2rem",
                            lineHeight: 0,
                        }}
                    >
                        <XIcon size={18} aria-hidden="true" />
                    </button>
                </div>

                {/* ── Platform picker ─────────────────────────── */}
                <div style={{ display: "flex", gap: "0.4rem" }}>
                    {(
                        [
                            { id: "x" as const, label: "X", icon: <SiX size={13} /> },
                            {
                                id: "bsky" as const,
                                label: "Bluesky",
                                icon: <SiBluesky size={13} />,
                            },
                        ]
                    ).map((p) => {
                        const active = platform === p.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => switchPlatform(p.id)}
                                aria-pressed={active}
                                style={{
                                    ...GHOST_BUTTON,
                                    flex: 1,
                                    borderColor: active ? "var(--ok)" : "var(--border)",
                                    color: active ? "var(--ok)" : "var(--fg-3)",
                                    background: active ? "rgba(34,197,94,0.08)" : "none",
                                }}
                            >
                                {p.icon}
                                {p.label}
                            </button>
                        );
                    })}
                </div>

                {/* ── Composer ────────────────────────────────── */}
                <div>
                    <label
                        htmlFor="tip-share-text"
                        style={{
                            display: "block",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.62rem",
                            color: "var(--fg-3)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            marginBottom: "0.35rem",
                        }}
                    >
                        Your post
                    </label>
                    <textarea
                        id="tip-share-text"
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            setEdited(true);
                        }}
                        rows={6}
                        style={{
                            width: "100%",
                            background: "var(--bg-2)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "0.6rem 0.7rem",
                            color: "var(--fg)",
                            fontFamily: "var(--font)",
                            fontSize: "0.78rem",
                            lineHeight: 1.5,
                            resize: "vertical",
                            boxSizing: "border-box",
                        }}
                    />
                    <p
                        style={{
                            fontSize: "0.66rem",
                            color: "var(--fg-3)",
                            marginTop: "0.35rem",
                            lineHeight: 1.5,
                        }}
                    >
                        {mention.startsWith("@")
                            ? `Tagging ${mention} on ${platform === "x" ? "X" : "Bluesky"}.`
                            : `No ${platform === "x" ? "X" : "Bluesky"} handle on their profile — using their name.`}
                    </p>
                </div>

                {/* ── Actions ─────────────────────────────────── */}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                        type="button"
                        onClick={() => openShareIntent(text, platform)}
                        style={SHARE_BUTTON}
                    >
                        {platform === "x" ? (
                            <SiX size={13} />
                        ) : (
                            <SiBluesky size={13} />
                        )}
                        Post to {platform === "x" ? "X" : "Bluesky"}
                    </button>
                    <button type="button" onClick={handleCopy} style={GHOST_BUTTON}>
                        {copied ? (
                            <Check size={13} aria-hidden="true" />
                        ) : (
                            <Copy size={13} aria-hidden="true" />
                        )}
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>

                {/* ── Footer links ────────────────────────────── */}
                <div
                    style={{
                        display: "flex",
                        gap: "1rem",
                        flexWrap: "wrap",
                        fontSize: "0.7rem",
                        borderTop: "1px solid var(--border)",
                        paddingTop: "0.75rem",
                    }}
                >
                    <a
                        href={opExplorerUrl(opHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--fg-3)", textDecoration: "none" }}
                    >
                        View transaction ↗
                    </a>
                    <a
                        href={tipShareUrl(ctx)}
                        style={{
                            color: "var(--fg-3)",
                            textDecoration: "none",
                            marginLeft: "auto",
                        }}
                    >
                        {ctx.fullName}
                    </a>
                </div>
            </div>
        </div>
    );
}
