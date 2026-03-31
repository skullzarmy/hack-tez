export default function Policies() {
    return (
        <div className="container" style={{ maxWidth: "680px", paddingBlock: "4rem 6rem" }}>
            <p className="section-label" style={{ marginBottom: "2rem" }}>
                policies
            </p>

            <h1
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "clamp(2rem, 6vw, 3.5rem)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    lineHeight: 1.1,
                    marginBottom: "3rem",
                    color: "var(--fg)",
                }}
            >
                Plain english.
                <br />
                No bullshit.
            </h1>

            <div
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    lineHeight: 2,
                    color: "var(--fg-2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2rem",
                }}
            >
                {/* What this is */}
                <section>
                    <h2
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.62rem",
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--fg-3)",
                            marginBottom: "0.75rem",
                        }}
                    >
                        What this is
                    </h2>
                    <p>
                        hack.tez is a free subdomain registrar on the Tezos blockchain. When you register a name, you
                        get a real{" "}
                        <a
                            href="https://tezos.domains"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg)" }}
                        >
                            Tezos Domains
                        </a>{" "}
                        record — an NFT you actually own, that you can set addresses on, redirect to a website, or
                        transfer to someone else. We don't hold it. The chain does.
                    </p>
                    <p>
                        We tend the infrastructure. We do not own the namespace in any way that matters. But we do
                        maintain the registrar contract, and that comes with responsibilities — and powers — we take
                        seriously.
                    </p>
                </section>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                {/* One name per wallet */}
                <section>
                    <h2
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.62rem",
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--fg-3)",
                            marginBottom: "0.75rem",
                        }}
                    >
                        One name per wallet
                    </h2>
                    <p>
                        Each wallet can claim one subdomain. That's by design. This isn't a namespace for squatting or
                        reselling. It's a place to be findable — one identity, one signal, one home on the chain.
                    </p>
                    <p>
                        Because these are NFTs, you can transfer your name to another wallet if you want. But you can't
                        use the same wallet to claim a second one. If you need an exception, contact us — we have admin
                        tools for edge cases and won't be weird about it.
                    </p>
                </section>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                {/* What we will remove */}
                <section>
                    <h2
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.62rem",
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--fg-3)",
                            marginBottom: "0.75rem",
                        }}
                    >
                        What we will remove
                    </h2>
                    <p style={{ color: "var(--fg)", fontWeight: 700 }}>
                        We have god-like admin powers over this registrar, and we will use them.
                    </p>
                    <p>
                        We will revoke subdomains used for hate speech, slurs, harassment, threats, or anything else
                        that exists to dehumanize people. We're not going to enumerate every edge case here. You know
                        what it is. We know what it is. Don't make us make a lesson of you.
                    </p>
                    <p>
                        We will also remove names that impersonate real people, projects, or protocols in ways designed
                        to deceive — phishing setups, fake official accounts, that kind of thing. The namespace is for
                        identity, not fraud.
                    </p>
                    <p>
                        Beyond that, we try to stay out of it. We're not content police. We're not going to revoke your
                        name because we disagree with you politically or think your project is weird. The threshold for
                        removal is real harm, not discomfort.
                    </p>
                </section>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                {/* Commit-reveal and timing */}
                <section>
                    <h2
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.62rem",
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--fg-3)",
                            marginBottom: "0.75rem",
                        }}
                    >
                        The registration process
                    </h2>
                    <p>
                        Registration uses a two-step commit-reveal process to prevent front-running. You submit a hash
                        first (commit), wait a minimum delay, then reveal your chosen name (register). Both transactions
                        cost only the Tezos network fee — there's no charge from us.
                    </p>
                    <p>
                        If your commit expires before you complete the second step, you'll need to start over. The
                        current timing parameters are visible at{" "}
                        <code style={{ color: "var(--fg)", fontSize: "0.8rem" }}>/api/v1/config</code>. They can change
                        — we'll announce significant changes before they take effect.
                    </p>
                </section>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                {/* No warranties */}
                <section>
                    <h2
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.62rem",
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--fg-3)",
                            marginBottom: "0.75rem",
                        }}
                    >
                        No warranties
                    </h2>
                    <p>
                        This service is provided as-is. The code is unlicensed and open. The contract lives on-chain and
                        we can't roll back transactions. If you do something irreversible, it's irreversible.
                    </p>
                    <p>
                        We intend to keep this running indefinitely, but we can't promise uptime, continuity, or that
                        the service will never change. We won't disappear quietly — if something major changes, you'll
                        hear about it.
                    </p>
                </section>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                {/* The short version */}
                <section>
                    <p style={{ color: "var(--fg)", fontWeight: 700, fontSize: "1rem", lineHeight: 1.8 }}>
                        Be here to build, to connect, to create.
                        <br />
                        Don't be here to harm, deceive, or dominate.
                        <br />
                        We're watching, and we do care.
                    </p>
                </section>
            </div>
        </div>
    );
}
