import { useState, useMemo } from "react";
import { useTezos } from "../context/TezosContext";
import { useContractConfig, formatDuration } from "../hooks/useContractConfig";
import SubdomainSearch from "../components/SubdomainSearch";
import PendingCommitsPanel from "../components/PendingCommitsPanel";
import EligibilityPanel from "../components/EligibilityPanel";
import { loadPendingCommits } from "../lib/commits";
import config from "../config/tezos";

export default function Home() {
    const { address } = useTezos();
    const contractConfig = useContractConfig();
    const waitDescription = formatDuration(contractConfig.minCommitAgeSec);
    const maxAgeDescription = formatDuration(contractConfig.maxCommitAgeSec);
    const year = new Date().getFullYear();
    const yearDisplay = year > 2026 ? `2026–${year}` : "2026";
    const [commitKey, setCommitKey] = useState(0);

    const hasActivePending = useMemo(() => {
        if (!address) return false;
        const now = Date.now();
        return loadPendingCommits().some(
            (c) => c.targetAddress === address && now - c.commitTime < contractConfig.maxCommitAgeSec * 1000
        );
    }, [address, commitKey, contractConfig.maxCommitAgeSec]);

    return (
        <>
            {/* ── HERO ─────────────────────────────────────────────── */}
            <section className="hero scanlines" aria-labelledby="hero-title">
                <div className="video-bg-wrap" aria-hidden="true">
                    <div className="video-bg-overlay" />
                </div>

                <div className="hero-content container">
                    <span className="hero-eyebrow" aria-hidden="true">
                        Tezos <span className="eyebrow-sub">sub</span>domain Registry
                    </span>

                    <div className="hero-title-wrap" aria-label={`*.hack.${config.tld}`} id="hero-title">
                        <span className="hero-star glitch-star" data-text="*" aria-hidden="true">
                            *
                        </span>
                        <span className="hero-dot" aria-hidden="true">
                            .
                        </span>
                        <h1 className="hero-title glitch" data-text="HACK" aria-hidden="true">
                            HACK
                        </h1>
                        <span
                            className="hero-tld glitch-tld"
                            data-text={`.${config.tld.toUpperCase()}`}
                            aria-hidden="true"
                        >
                            .{config.tld.toUpperCase()}
                        </span>
                    </div>

                    <div className="hero-divider" aria-hidden="true" />

                    <div className="hero-manifesto" role="doc-subtitle">
                        <p>
                            <strong className="manifesto-bold">This is an invitation.</strong>
                            <span className="manifesto-line">For those who build what doesn't exist yet.</span>
                            <span className="manifesto-line">For those who break what should be broken.</span>
                            <span className="manifesto-line">For those who create without asking permission.</span>
                            <span className="manifesto-line">For tezonians who know what's possible on-chain.</span>
                        </p>
                    </div>

                    <p className="hero-cta-label" aria-label="Claim your name">
                        Claim your name — early access open now
                    </p>

                    {address && <PendingCommitsPanel commitKey={commitKey} onRelease={() => setCommitKey((k) => k + 1)} />}

                    {!hasActivePending && (
                        <div className="search-wrap">
                            <SubdomainSearch onCommit={() => setCommitKey((k) => k + 1)} />
                            {address && <EligibilityPanel />}
                        </div>
                    )}
                </div>

                <span className="hero-scroll-hint" aria-hidden="true">
                    How it works
                </span>
            </section>

            {/* ── HOW IT WORKS ─────────────────────────────────────── */}
            <section
                className="section how-it-works-section"
                aria-labelledby="how-it-works-title"
                style={{ background: "var(--bg-2)" }}
            >
                <div className="container">
                    <p className="section-label" aria-hidden="true">
                        Protocol
                    </p>
                    <h2 id="how-it-works-title" className="section-title" style={{ marginBottom: "2rem" }}>
                        How it works
                    </h2>
                    <div className="steps-grid" role="list">
                        {[
                            {
                                step: "Step 01",
                                title: "Connect",
                                desc: "Link your Tezos wallet. Your account must be revealed (at least one on-chain transaction) and at least 4 hours old.",
                            },
                            {
                                step: "Step 02",
                                title: "Search",
                                desc: "Find an available name. Lowercase letters, numbers, and hyphens only. 3–64 characters. One name per wallet.",
                            },
                            {
                                step: "Step 03",
                                title: "Publish",
                                desc: `Commit a hash of your name on-chain. This reserves your spot and prevents frontrunning. Only gas costs (~0.01 ꜩ).`,
                            },
                            {
                                step: "Step 04",
                                title: "Claim",
                                desc: `After the ${waitDescription} commitment window, return to finalize registration. Commitment expires after ${maxAgeDescription} — don't wait too long.`,
                            },
                        ].map((item) => (
                            <div key={item.step} className="step-card" role="listitem">
                                <span className="step-num" aria-hidden="true">
                                    {item.step}
                                </span>
                                <h3 className="step-title">{item.title}</h3>
                                <p className="step-body">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── MANIFESTO CLOSE ──────────────────────────────────── */}
            <section className="section" aria-label="About hack.tez">
                <div className="container" style={{ maxWidth: "680px" }}>
                    <p className="section-label" aria-hidden="true">
                        About
                    </p>
                    <h2 className="section-title" style={{ marginBottom: "1rem" }}>
                        Something bigger is coming.
                    </h2>
                    <p className="section-body" style={{ marginBottom: "1rem" }}>
                        hack.tez is phase one. An invitation. A name you claim before the revolution starts.
                    </p>
                    <p className="section-body" style={{ marginBottom: "1rem" }}>
                        Your subdomain lives fully on-chain — you own it, not a server, not a company. Subdomains are
                        functional tokens. They can be used as addresses, logins, profiles, and more. Manage at{" "}
                        <a href="https://tezos.domains" target="_blank" rel="noopener noreferrer">
                            Tezos Domains
                        </a>
                    </p>
                    <p className="section-body">You pay gas (~0.02 ꜩ). That's it. 1 claim per wallet.</p>
                </div>
            </section>

            {/* ── FOOTER ───────────────────────────────────────────── */}
            <footer className="footer">
                <div className="container footer-inner">
                    <span className="footer-copy">
                        <span className="footer-copy-symbol">&copy;</span>
                        <span>
                            copyright {yearDisplay} a{" "}
                            <a
                                href="https://fafolab.xyz"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="footer-link footer-fafolab"
                                aria-label="FAFOlab (opens in new tab)"
                            >
                                FAFO<del>lab</del>
                            </a>{" "}
                            joint
                        </span>
                    </span>
                </div>
            </footer>
        </>
    );
}
