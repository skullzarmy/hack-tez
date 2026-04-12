/** biome-ignore-all lint/a11y/useSemanticElements: <I said so> */
/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useMemo, lazy, Suspense, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { useTezos } from "../context/TezosContext";
import { useOnboarding } from "../context/OnboardingContext";
import { useContractConfig, formatDuration } from "../hooks/useContractConfig";
import SubdomainSearch from "../components/SubdomainSearch";
import PendingCommitsPanel from "../components/PendingCommitsPanel";
import EligibilityPanel from "../components/EligibilityPanel";
import ClaimedView from "../components/ClaimedView";
import ClaimUsedView from "../components/ClaimUsedView";
import { loadPendingCommits } from "../lib/commits";
import { useSubdomains } from "../hooks/useSubdomains";
import { useRegistrationCount } from "../hooks/useRegistrationCount";
import type { SubdomainRecord } from "../lib/domains";
import config from "../config/tezos";
import ClaimHint from "../components/onboarding/ClaimHint";
import ProfileArrowHint from "../components/onboarding/ProfileArrowHint";

const CircuitBackground = lazy(() =>
    import("../components/CircuitBackground").then((m) => ({ default: m.CircuitBackground })),
);

export default function Home() {
    const { address } = useTezos();
    const contractConfig = useContractConfig();
    const waitDescription = formatDuration(contractConfig.minCommitAgeSec);
    const maxAgeDescription = formatDuration(contractConfig.maxCommitAgeSec);
    const [commitKey, setCommitKey] = useState(0);
    const [claimedSubdomain, setClaimedSubdomain] = useState<SubdomainRecord | null>(null);
    const [lastAddress, setLastAddress] = useState(address);
    // Defer canvas until browser is idle after initial paint so the hero h1
    // text — not the canvas — is the LCP element.
    const [canvasReady, setCanvasReady] = useState(false);
    useEffect(() => {
        if (typeof requestIdleCallback !== "undefined") {
            const id = requestIdleCallback(() => setCanvasReady(true));
            return () => cancelIdleCallback(id);
        }
        const id = setTimeout(() => setCanvasReady(true), 200);
        return () => clearTimeout(id);
    }, []);

    if (address !== lastAddress) {
        setLastAddress(address);
        setClaimedSubdomain(null);
    }

    const { subdomains, loading: subdomainsLoading } = useSubdomains(address);
    const { count: registrationCount, loading: regLoading } = useRegistrationCount(address);

    // Real on-chain subdomain takes priority over the just-claimed one
    const displaySubdomain: SubdomainRecord | null = subdomains[0] ?? claimedSubdomain;

    const hasSubdomain = !!displaySubdomain;
    const isStatusLoading = address ? subdomainsLoading || regLoading : false;
    const hasUsedAllClaims =
        !subdomainsLoading && !regLoading && registrationCount >= contractConfig.maxPerWallet && !hasSubdomain;

    // biome-ignore lint/correctness/useExhaustiveDependencies: commitKey is an intentional manual invalidation trigger
    const hasActivePending = useMemo(() => {
        if (!address) return false;
        const now = Date.now();
        return loadPendingCommits().some(
            (c) => c.targetAddress === address && now - c.commitTime < contractConfig.maxCommitAgeSec * 1000,
        );
    }, [address, commitKey, contractConfig.maxCommitAgeSec]);

    const { step: onboardingStep } = useOnboarding();

    return (
        <>
            {contractConfig.registryTampered && (
                <div role="alert" className="registry-tamper-banner">
                    ⚠ WARNING: The on-chain name registry has been changed to an unexpected address. Registrations may
                    not create real TED domains. Do not register until this is resolved.
                </div>
            )}
            {/* ── HERO ─────────────────────────────────────────────── */}
            <section className="hero scanlines" aria-label={`*.hack.${config.tld} — Tezos Subdomain Registry`}>
                <div className="video-bg-wrap" aria-hidden="true">
                    {canvasReady && (
                        <Suspense fallback={null}>
                            <CircuitBackground />
                        </Suspense>
                    )}
                    <div className="video-bg-overlay" />
                </div>

                <div className="hero-content container">
                    <span className="hero-eyebrow" aria-hidden="true">
                        Tezos <span className="eyebrow-sub">sub</span>domain Registry
                    </span>

                    <div className="hero-title-wrap" aria-hidden="true" id="hero-title">
                        <span className="hero-star glitch-star" data-text="*" aria-hidden="true">
                            *
                        </span>
                        <span className="hero-dot" aria-hidden="true">
                            .
                        </span>
                        <h1 className="hero-title glitch" data-text="HACK">
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
                            <span className="manifesto-line">For those who build what should exist.</span>
                            <span className="manifesto-line">For those who break what can be broken.</span>
                            <span className="manifesto-line">For those who create without permission.</span>
                            <span className="manifesto-line">For Tezos.</span>
                        </p>
                    </div>

                    <p className="hero-cta-label">Claim your name. Only gas.</p>

                    {address && hasSubdomain && <ClaimedView subdomain={displaySubdomain!} />}

                    <ProfileArrowHint />

                    {address && hasUsedAllClaims && !hasSubdomain && <ClaimUsedView />}

                    {address && !hasSubdomain && !hasUsedAllClaims && (
                        <PendingCommitsPanel
                            commitKey={commitKey}
                            onRelease={() => setCommitKey((k) => k + 1)}
                            onClaim={(subdomain) => {
                                setClaimedSubdomain(subdomain);
                                setCommitKey((k) => k + 1);
                            }}
                        />
                    )}

                    {!hasSubdomain && !hasUsedAllClaims && !hasActivePending && !isStatusLoading && (
                        <div className="search-wrap">
                            {onboardingStep === "claim" && <ClaimHint />}
                            <SubdomainSearch onCommit={() => setCommitKey((k) => k + 1)} />
                            {address && <EligibilityPanel />}
                        </div>
                    )}
                </div>

                {!hasSubdomain && !hasUsedAllClaims && (
                    <span className="hero-scroll-hint" aria-hidden="true">
                        How it works
                    </span>
                )}
            </section>

            {/* ── HOW IT WORKS ─────────────────────────────────────── */}
            {!hasSubdomain && !hasUsedAllClaims && (
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
                                {
                                    step: "Step 05",
                                    title: "Profile",
                                    desc: "Set up your hacker profile — add your bio, skills, and projects. Share it.",
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
            )}

            {/* ── MANIFESTO CLOSE ──────────────────────────────────── */}
            <section className="section" aria-label="About hack.tez">
                <div className="container" style={{ maxWidth: "680px" }}>
                    <h2
                        className="section-title"
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "clamp(1.4rem, 4vw, 2rem)",
                            letterSpacing: "-0.02em",
                            marginBottom: "1rem",
                        }}
                    >
                        // MORE THAN A NAME
                    </h2>
                    <p className="section-body" style={{ marginBottom: "1rem" }}>
                        <strong>
                            hack.tez is phase one. The name you claim is a real on-chain record. It resolves. It routes.
                            Contracts can query it.
                        </strong>
                    </p>
                    <p className="section-body" style={{ marginBottom: "1rem" }}>
                        Manage your record at{" "}
                        <a href="https://tezos.domains" target="_blank" rel="noopener noreferrer">
                            Tezos Domains
                        </a>
                        . Set an address, configure your record. It's yours.
                    </p>
                    <p className="section-body">You pay gas (~0.02 ꜩ). That's it. 1 claim per wallet.</p>
                    <p className="section-body" style={{ marginTop: "2rem" }}>
                        FAFOlab retains ownership of the main hack.tez domain and provides this service with no warranty
                        or guarantee.{" "}
                    </p>
                    <p className="section-body" style={{ marginTop: "2rem" }}>
                        {" "}
                        The future is not promised. We're building it anyway.
                    </p>
                    <p
                        className="section-body"
                        style={{ marginTop: "3rem", fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.01em" }}
                    >
                        <span className="manifesto-bold">/hack-the-future</span>
                        <span className="typing-cursor" aria-hidden="true">
                            _
                        </span>
                    </p>

                    <p className="section-body" style={{ marginTop: "3rem" }}>
                        <a
                            href="/manifesto"
                            className="footer-link"
                            style={{ fontSize: "0.8rem", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: "0.35em" }}
                        >
                            read the manifesto <ArrowRight size={14} aria-hidden="true" />
                        </a>
                    </p>

                    <style>
                        {`
                          .typing-cursor {
                            display: inline-block;
                            margin-left: 0.15rem;
                            animation: hacktez-blink 1s steps(1, end) infinite;
                          }

                          @keyframes hacktez-blink {
                            0%, 49% { opacity: 1; }
                            50%, 100% { opacity: 0; }
                          }
                        `}
                    </style>
                </div>
            </section>
        </>
    );
}
