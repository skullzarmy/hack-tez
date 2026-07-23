/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { usePageMeta } from "../hooks/usePageMeta";

export default function Policies() {
    usePageMeta({
        title: "Policies — hack.tez",
        description:
            "Privacy policy and terms for hack.tez. Plain english. No bullshit. We don't sell your data because there's no data to sell.",
        path: "/policies",
    });
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
                    // POLICIES
                </h1>
                <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem" }}>Plain english. No bullshit.</p>
            </header>

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
                        record you actually own, that you can set addresses on or transfer to someone else. We don't
                        hold it. The chain does.
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
                        Claims and limits
                    </h2>
                    <p>
                        Each wallet can currently claim one subdomain. That's by design. This isn't a namespace for
                        squatting or reselling. It's a place to create a findable identity for yourself or your project.
                        We want to keep it that way.
                    </p>
                    <p>
                        Because these are NFTs, you can transfer your name to another wallet if you want. But you can't
                        use the same wallet to claim a second one. If you need an exception, contact us, we have admin
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
                        to deceive; phishing setups, fake official accounts, that kind of thing. The namespace is for
                        identity, not nefarious schemes.
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
                        cost only the Tezos network fee. There's no charge from us.
                    </p>
                    <p>
                        If your commit expires before you complete the second step, you'll need to start over. The
                        current timing parameters are visible at{" "}
                        <code style={{ color: "var(--fg)", fontSize: "0.8rem" }}>/api/v1/config</code>. They can change
                        but we'll announce significant changes before they take effect.
                    </p>
                </section>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                {/* Profile content */}
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
                        Profile content
                    </h2>
                    <p>
                        Profile data (bios, links, skills, project descriptions, avatars) falls under the same
                        moderation policy as subdomain names. We'll remove content that exists to harm, harass, or
                        deceive. Same threshold, same approach.
                    </p>
                    <p>
                        A few things to know: IPFS-pinned images are permanent. If we remove a profile's reference to an
                        IPFS avatar or logo, the underlying content still exists on the network. We can't delete it
                        because nobody can. We can only remove the TED record pointing to it.
                    </p>
                    <p>
                        Status, skills, and linked accounts (GitHub, X) are self-reported and unverified. We don't check
                        that a GitHub username actually belongs to the wallet owner, or that someone claiming
                        "available" is actually available. Treat profile data as claims, not facts.
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
                        the service will never change. We won't disappear quietly and if something major changes, you'll
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
