/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, ExternalLink, Lock, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.min.css";
import { getLab, type LabStatus } from "../lib/labs";
import { useTezos } from "../context/TezosContext";
import { authedFetch } from "../lib/authedFetch";
import ConnectWallet from "../components/ConnectWallet";
import { usePageMeta } from "../hooks/usePageMeta";
import {
    AnimatedIcon,
    LazyDownloadIcon,
    useAnimatedIconTrigger,
} from "../components/icons/animated";

const STATUS_STYLE: Record<LabStatus, { color: string; bg: string; label: string }> = {
    alpha: { color: "var(--warn)", bg: "var(--warn-bg)", label: "alpha" },
    beta: { color: "var(--info)", bg: "var(--info-bg)", label: "beta" },
    production: { color: "var(--ok)", bg: "var(--ok-bg)", label: "production" },
};

function StatusBadge({ status }: { status: LabStatus }) {
    const s = STATUS_STYLE[status];
    return (
        <span
            style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0.18em 0.55em",
                color: s.color,
                background: s.bg,
                border: `1px solid ${s.color}`,
                whiteSpace: "nowrap",
            }}
        >
            {s.label}
        </span>
    );
}

function AccessGate() {
    return (
        <div
            style={{
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                padding: "2rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
                textAlign: "center",
                marginTop: "2rem",
            }}
        >
            <Lock size={28} aria-hidden="true" style={{ color: "var(--fg-muted)" }} />
            <p
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.9rem",
                    color: "var(--fg)",
                }}
            >
                // members only
            </p>
            <p style={{ color: "var(--fg-muted)", fontSize: "0.82rem", maxWidth: "44ch" }}>
                Connect a wallet that owns a hack.tez subdomain to view and install this experiment.
            </p>
            <ConnectWallet />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--fg-muted)" }}>
                no subdomain?{" "}
                <Link to="/" style={{ color: "var(--fg)" }}>
                    claim one →
                </Link>
            </p>
        </div>
    );
}

interface DownloadState {
    status: "idle" | "downloading" | "error";
    message?: string;
}

export default function LabDetail() {
    const { slug } = useParams<{ slug: string }>();
    const lab = slug ? getLab(slug) : undefined;
    const { domain, activeDomain, restoring } = useTezos();
    const downloadTrigger = useAnimatedIconTrigger();
    const identity = activeDomain ?? domain;
    const [dl, setDl] = useState<DownloadState>({ status: "idle" });

    usePageMeta(
        lab
            ? {
                  title: `${lab.title} v${lab.version} — Labs — hack.tez`,
                  description: lab.summary || `${lab.title} — early access fafolab experiment for hack.tez members.`,
                  path: `/labs/${lab.slug}`,
              }
            : null,
    );

    if (!lab) {
        return (
            <div className="container" style={{ paddingBlock: "3rem" }}>
                <p style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>
                    // 404 — experiment not found:{" "}
                    <span style={{ color: "var(--err, #ff6b6b)" }}>{slug ?? "unknown"}</span>
                </p>
                <Link
                    to="/labs"
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.875rem",
                        color: "var(--fg-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35em",
                    }}
                >
                    <ArrowLeft size={14} aria-hidden="true" /> back to labs
                </Link>
            </div>
        );
    }

    async function handleDownload() {
        if (!lab) return;
        setDl({ status: "downloading" });
        try {
            const res = await authedFetch("/api/labs/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: lab.slug, file: lab.file }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(text || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = lab.file;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setDl({ status: "idle" });
        } catch (err) {
            setDl({ status: "error", message: err instanceof Error ? err.message : "download failed" });
        }
    }

    const showContent = !restoring && !!domain;

    return (
        <div className="container" style={{ paddingBlock: "3rem", maxWidth: "780px" }}>
            <Link
                to="/labs"
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    color: "var(--fg-muted)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35em",
                    marginBottom: "1rem",
                }}
            >
                <ArrowLeft size={14} aria-hidden="true" /> labs
            </Link>

            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "1rem",
                    paddingBottom: "1.25rem",
                    borderBottom: "1px solid var(--border)",
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                            flexWrap: "wrap",
                            marginBottom: "0.4rem",
                        }}
                    >
                        <h1
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.2rem, 3.5vw, 1.75rem)",
                                letterSpacing: "-0.02em",
                                margin: 0,
                            }}
                        >
                            {lab.title}
                        </h1>
                        <StatusBadge status={lab.status} />
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.75rem",
                                color: "var(--fg-muted)",
                            }}
                        >
                            v{lab.version}
                        </span>
                    </div>
                    {lab.summary && (
                        <p style={{ color: "var(--fg-muted)", fontSize: "0.875rem", maxWidth: "60ch" }}>
                            {lab.summary}
                        </p>
                    )}
                </div>
            </div>

            {/* Metadata strip */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "1.25rem",
                    paddingBlock: "1rem",
                    borderBottom: "1px solid var(--border)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.72rem",
                    color: "var(--fg-muted)",
                }}
            >
                <span>
                    kind: <span style={{ color: "var(--fg)" }}>{lab.kind}</span>
                </span>
                {lab.updated && (
                    <span>
                        updated: <span style={{ color: "var(--fg)" }}>{lab.updated}</span>
                    </span>
                )}
                {lab.repo && (
                    <a
                        href={lab.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: "var(--fg-muted)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3em",
                            textDecoration: "none",
                        }}
                    >
                        repo <ExternalLink size={11} aria-hidden="true" />
                    </a>
                )}
                {lab.privacy && (
                    <a
                        href={lab.privacy}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: "var(--fg-muted)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3em",
                            textDecoration: "none",
                        }}
                    >
                        <ShieldCheck size={11} aria-hidden="true" /> privacy
                    </a>
                )}
            </div>

            {!showContent ? (
                restoring ? (
                    <p
                        style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--fg-muted)",
                            fontSize: "0.8rem",
                            marginTop: "2rem",
                        }}
                    >
                        // restoring session…
                    </p>
                ) : (
                    <AccessGate />
                )
            ) : (
                <>
                    {/* Download bar */}
                    <div
                        style={{
                            marginTop: "1.5rem",
                            padding: "1.25rem 1.5rem",
                            border: "1px solid var(--border)",
                            background: "var(--bg-card)",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "1rem",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <div>
                            <p
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.78rem",
                                    color: "var(--fg)",
                                    marginBottom: "0.2rem",
                                }}
                            >
                                {lab.file}
                            </p>
                            <p
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.68rem",
                                    color: "var(--fg-muted)",
                                }}
                            >
                                authed download — signed in as {identity}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={dl.status === "downloading" || !lab.file}
                            {...(dl.status === "downloading" ? {} : downloadTrigger.handlers)}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.82rem",
                                padding: "0.55rem 1.1rem",
                                border: "1px solid var(--fg)",
                                background: "var(--fg)",
                                color: "var(--bg)",
                                cursor: dl.status === "downloading" ? "wait" : "pointer",
                                opacity: !lab.file ? 0.5 : 1,
                            }}
                        >
                            <AnimatedIcon
                                ref={downloadTrigger.iconRef}
                                Lazy={LazyDownloadIcon}
                                fallback={<Download size={14} aria-hidden="true" />}
                                size={14}
                            />
                            {dl.status === "downloading" ? "downloading…" : "download zip"}
                        </button>
                    </div>
                    {dl.status === "error" && (
                        <p
                            role="alert"
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                color: "var(--err, #ff6b6b)",
                                marginTop: "0.6rem",
                            }}
                        >
                            // download failed: {dl.message}
                        </p>
                    )}

                    {/* Markdown body */}
                    <div className="prose prose-invert max-w-none skill-prose" style={{ marginTop: "2rem" }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {lab.raw}
                        </ReactMarkdown>
                    </div>
                </>
            )}
        </div>
    );
}
