/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
export default function Manifesto() {
    return (
        <div className="container" style={{ paddingBlock: "4rem 6rem" }}>
            <header style={{ marginBottom: "3rem" }}>
                <h1
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "clamp(1.4rem, 4vw, 2rem)",
                        letterSpacing: "-0.02em",
                        marginBottom: "0.5rem",
                    }}
                >
                    // MANIFESTO
                </h1>
                <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem" }}>
                    HEN mattered because nobody asked permission.
                </p>
            </header>

            <div
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "0.85rem",
                    lineHeight: 2,
                    color: "var(--fg-2)",
                    fontWeight: 700,
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                }}
            >
                <p>
                    The builders who came to Tezos weren't chasing a floor. They were here because something about this
                    chain felt like theirs. They shipped things with no business model on a Tuesday at 2am because the
                    idea would not leave them alone. When HEN went dark they didn't leave. They forked it and kept
                    going.
                </p>

                <p style={{ color: "var(--fg)", fontWeight: 700 }}>That wasn't sentiment. That was identity.</p>

                <p>
                    That person is still here. Still building in the margins, still looking for the others, still
                    convinced the thing they're making needs to exist even if they can't explain why.
                </p>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

                <p style={{ color: "var(--ok)", fontWeight: 700, letterSpacing: "0.06em" }}>
                    hack.tez is a name for the place where we find each other.
                </p>

                <p style={{ color: "var(--fg)", fontSize: "1rem", fontWeight: 700 }}>Claim yours.</p>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

                <p style={{ color: "var(--fg-3)", fontSize: "0.75rem", letterSpacing: "0.1em", marginTop: "1rem" }}>
                    Unlicensed. Unowned. Unafraid.
                </p>
            </div>
        </div>
    );
}
