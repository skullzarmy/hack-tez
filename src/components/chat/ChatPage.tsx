import { usePageMeta } from "../../hooks/usePageMeta";

const LOG_LINES = [
    "$ hackchat --status",
    "resolving infra... gone",
    "host has withdrawn support",
    "no fallback target configured",
];

export default function ChatPage() {
    usePageMeta({
        title: "hackchat — retired",
        description:
            "hackchat is offline. Our server host pulled support and we're rethinking how communication works on hack.tez.",
        path: "/chat",
    });

    return (
        <div
            className="flex flex-col items-center justify-center"
            style={{
                flex: "1 1 0",
                fontFamily: "var(--font)",
                padding: "clamp(1.5rem, 4vw, 3rem)",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "440px",
                    border: "1px solid var(--fg-2, rgba(255,255,255,0.2))",
                    borderRadius: "6px",
                    overflow: "hidden",
                    background: "var(--bg-2, rgba(255,255,255,0.02))",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.6rem 0.9rem",
                        borderBottom: "1px solid var(--fg-2, rgba(255,255,255,0.15))",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: "var(--fg-2, rgba(255,255,255,0.5))",
                        letterSpacing: "0.05em",
                    }}
                >
                    <span aria-hidden="true" style={{ display: "inline-flex", gap: "0.3rem" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", opacity: 0.35 }} />
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", opacity: 0.35 }} />
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", opacity: 0.35 }} />
                    </span>
                    hackchat
                </div>

                <div
                    style={{
                        padding: "1rem 1.1rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                        lineHeight: 1.9,
                        color: "var(--fg-2, rgba(255,255,255,0.6))",
                    }}
                >
                    {LOG_LINES.map((line) => (
                        <div key={line}>{line}</div>
                    ))}
                    <div style={{ color: "var(--err, #ff6b6b)" }}>
                        build failed: hackchat retired
                        <span aria-hidden="true" className="chat-retired-cursor">
                            &nbsp;
                        </span>
                    </div>
                </div>
            </div>

            <p
                className="text-xs text-center"
                style={{
                    maxWidth: "440px",
                    marginTop: "1.5rem",
                    color: "var(--fg-2, rgba(255,255,255,0.6))",
                    lineHeight: 1.7,
                }}
            >
                Our server host pulled support for hackchat's infrastructure with no
                notice. We're rethinking how communication works on hack.tez before
                bringing something back — no timeline yet.
            </p>

            <div style={{ display: "flex", gap: "1.25rem", marginTop: "1.25rem", flexWrap: "wrap", justifyContent: "center" }}>
                <a
                    href="https://bsky.app/profile/hacktez.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs"
                    style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                    Tell us what you'd want instead
                </a>
                <a
                    href="/"
                    className="text-xs"
                    style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                    Back home
                </a>
            </div>

            <style>{`
                .chat-retired-cursor {
                    display: inline-block;
                    width: 0.55em;
                    background: var(--err, #ff6b6b);
                    animation: chat-retired-blink 1.1s steps(1) infinite;
                }
                @keyframes chat-retired-blink {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .chat-retired-cursor { animation: none; }
                }
            `}</style>
        </div>
    );
}
