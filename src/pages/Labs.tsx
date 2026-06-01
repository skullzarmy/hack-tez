/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { labs, type LabStatus } from "../lib/labs";
import { useTezos } from "../context/TezosContext";
import ConnectWallet from "../components/ConnectWallet";
import { usePageMeta } from "../hooks/usePageMeta";

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
                fontSize: "0.6rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0.15em 0.5em",
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

function Header() {
    return (
        <header style={{ marginBottom: "2.5rem" }}>
            <h1
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "clamp(1.4rem, 4vw, 2rem)",
                    letterSpacing: "-0.02em",
                    marginBottom: "0.5rem",
                }}
            >
                // LABS
            </h1>
            <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem", maxWidth: "60ch" }}>
                fafolab experiments — early access for hack.tez members. Half-built, mostly working, all yours.
            </p>
        </header>
    );
}

function AccessGate() {
    const { connecting } = useTezos();
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
            }}
        >
            <Lock size={28} aria-hidden="true" style={{ color: "var(--fg-muted)" }} />
            <div>
                <p
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.9rem",
                        color: "var(--fg)",
                        marginBottom: "0.4rem",
                    }}
                >
                    // members only
                </p>
                <p style={{ color: "var(--fg-muted)", fontSize: "0.82rem", maxWidth: "44ch" }}>
                    Labs is gated to hack.tez members. Connect a wallet that owns a hack.tez subdomain to enter.
                </p>
            </div>
            <ConnectWallet />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--fg-muted)" }}>
                no subdomain?{" "}
                <Link to="/" style={{ color: "var(--fg)" }}>
                    claim one →
                </Link>
            </p>
            {connecting && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--fg-muted)" }}>
                    connecting…
                </p>
            )}
        </div>
    );
}

function LabCard({
    lab,
}: {
    lab: (typeof labs)[number];
}) {
    return (
        <Link to={`/labs/${lab.slug}`} style={{ textDecoration: "none" }}>
            <div
                style={{
                    border: "1px solid var(--border)",
                    padding: "1.25rem 1.5rem",
                    background: "var(--bg-card)",
                    transition: "border-color 0.15s, background 0.15s",
                }}
                className="lab-card"
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                    }}
                >
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontWeight: 600,
                            fontSize: "1rem",
                            color: "var(--fg)",
                        }}
                    >
                        {lab.title}
                    </span>
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.7rem",
                            color: "var(--fg-muted)",
                        }}
                    >
                        v{lab.version}
                    </span>
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.7rem",
                            color: "var(--fg-muted)",
                        }}
                    >
                        {lab.kind}
                    </span>
                    <span style={{ marginLeft: "auto" }}>
                        <StatusBadge status={lab.status} />
                    </span>
                </div>
                {lab.summary && (
                    <p
                        style={{
                            color: "var(--fg-muted)",
                            fontSize: "0.85rem",
                            marginTop: "0.5rem",
                            lineHeight: 1.5,
                        }}
                    >
                        {lab.summary}
                    </p>
                )}
                {(lab.browsers.length > 0 || lab.wallets.length > 0) && (
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.35rem",
                            marginTop: "0.75rem",
                        }}
                    >
                        {[...lab.browsers, ...lab.wallets].map((tag) => (
                            <span
                                key={tag}
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.65rem",
                                    padding: "0.15em 0.5em",
                                    border: "1px solid var(--border)",
                                    color: "var(--fg-muted)",
                                    background: "var(--bg)",
                                }}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </Link>
    );
}

export default function Labs() {
    const { domain, restoring } = useTezos();
    usePageMeta({
        title: "Labs — fafolab early access — hack.tez",
        description: "Early-access fafolab experiments for hack.tez members. Browser extensions, tools, things still warm from the oven.",
        path: "/labs",
    });

    return (
        <div className="container" style={{ paddingBlock: "3rem" }}>
            <Header />
            {restoring ? (
                <p style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)", fontSize: "0.8rem" }}>
                    // restoring session…
                </p>
            ) : !domain ? (
                <AccessGate />
            ) : labs.length === 0 ? (
                <p style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)", fontSize: "0.85rem" }}>
                    // nothing on the bench yet. check back soon.
                </p>
            ) : (
                <ul
                    style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                    }}
                >
                    {labs.map((lab) => (
                        <li key={lab.slug}>
                            <LabCard lab={lab} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
