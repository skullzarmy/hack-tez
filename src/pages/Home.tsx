/** biome-ignore-all lint/a11y/useSemanticElements: <I said so> */
/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */

import { ArrowRight } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import EligibilityPanel from "../components/EligibilityPanel";
import HomeDashboard from "../components/HomeDashboard";
import ClaimHint from "../components/onboarding/ClaimHint";
import PendingCommitsPanel from "../components/PendingCommitsPanel";
import SubdomainSearch from "../components/SubdomainSearch";
import config from "../config/tezos";
import { useOnboarding } from "../context/OnboardingContext";
import { useTezos } from "../context/TezosContext";
import { formatDuration, useContractConfig } from "../hooks/useContractConfig";
import { usePageMeta } from "../hooks/usePageMeta";
import { useRegistrationCount } from "../hooks/useRegistrationCount";
import { useSubdomains } from "../hooks/useSubdomains";
import { loadPendingCommits } from "../lib/commits";
import type { SubdomainRecord } from "../lib/domains";

const CircuitBackground = lazy(() =>
	import("../components/CircuitBackground").then((m) => ({
		default: m.CircuitBackground,
	})),
);

export default function Home() {
	usePageMeta({
		title: "hack.tez — Claim Your Free Tezos Subdomain",
		description:
			"Claim your subdomain on hack.tez. For hackers, builders, artists, and tezonians. yourname.hack.tez — 1 claim per wallet. Just gas.",
		path: "/",
	});
	const { address, restoring, token, activeDomain } = useTezos();
	const contractConfig = useContractConfig();
	const waitDescription = formatDuration(contractConfig.minCommitAgeSec);
	const maxAgeDescription = formatDuration(contractConfig.maxCommitAgeSec);
	const [commitKey, setCommitKey] = useState(0);
	const [claimedSubdomain, setClaimedSubdomain] =
		useState<SubdomainRecord | null>(null);
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

	const {
		subdomains,
		loading: subdomainsLoading,
		refresh: refreshSubdomains,
	} = useSubdomains(address);
	const { count: registrationCount, loading: regLoading } =
		useRegistrationCount(address);

	// Real on-chain subdomain takes priority over the just-claimed one
	const displaySubdomain: SubdomainRecord | null =
		subdomains[0] ?? claimedSubdomain;

	const hasSubdomain = !!displaySubdomain;
	const isStatusLoading = address ? subdomainsLoading || regLoading : false;
	const hasUsedAllClaims =
		!subdomainsLoading &&
		!regLoading &&
		registrationCount >= contractConfig.maxPerWallet &&
		!hasSubdomain;

	// biome-ignore lint/correctness/useExhaustiveDependencies: commitKey is an intentional manual invalidation trigger
	const hasActivePending = useMemo(() => {
		if (!address) return false;
		const now = Date.now();
		return loadPendingCommits().some(
			(c) =>
				c.targetAddress === address &&
				now - c.commitTime < contractConfig.maxCommitAgeSec * 1000,
		);
	}, [address, commitKey, contractConfig.maxCommitAgeSec]);

	const { step: onboardingStep } = useOnboarding();

	// Show the dashboard when we know the user has domains. Three paths:
	//   1. JWT is valid (activeDomain seeded synchronously from localStorage)
	//   2. Wallet session is being restored (show loading shell)
	//   3. Wallet connected + subdomains confirmed on-chain (JWT not required)
	// This ensures users are never locked out of domain management when
	// their JWT expires but their wallet session persists.
	const showDashboard =
		!!(activeDomain && token) || // JWT proves they have a domain
		restoring || // session still loading
		(!!address && (hasSubdomain || isStatusLoading || hasUsedAllClaims));

	// While wallet is connected and we're still loading subdomains, show the
	// dashboard shell instead of flashing the landing page.
	const dashboardLoading = restoring || (!!address && isStatusLoading);

	if (showDashboard) {
		return (
			<HomeDashboard
				subdomains={subdomains}
				loading={dashboardLoading}
				refresh={refreshSubdomains}
			/>
		);
	}

	return (
		<>
			{contractConfig.registryTampered && (
				<div role="alert" className="registry-tamper-banner">
					⚠ WARNING: The on-chain name registry has been changed to an
					unexpected address. Registrations may not create real TED domains. Do
					not register until this is resolved.
				</div>
			)}
			{/* ── HERO ─────────────────────────────────────────────── */}
			<section
				className="hero scanlines"
				aria-label={`*.hack.${config.tld} — Tezos Subdomain Registry`}
			>
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
						<span
							className="hero-star glitch-star"
							data-text="*"
							aria-hidden="true"
						>
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
							<span className="manifesto-line">
								For those who build what should exist.
							</span>
							<span className="manifesto-line">
								For those who break what can be broken.
							</span>
							<span className="manifesto-line">
								For those who create without permission.
							</span>
							<span className="manifesto-line">For Tezos.</span>
						</p>
					</div>

					<p className="hero-cta-label">Claim your name. Only gas.</p>

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

					{!hasSubdomain &&
						!hasUsedAllClaims &&
						!hasActivePending &&
						!isStatusLoading && (
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
						<h2
							id="how-it-works-title"
							className="section-title"
							style={{ marginBottom: "2rem" }}
						>
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

			{/* ── FEATURES ─────────────────────────────────────────── */}
			<section
				className="section features-section"
				aria-labelledby="features-title"
			>
				<div className="container">
					<p className="section-label" aria-hidden="true">
						Platform
					</p>
					<h2
						id="features-title"
						className="section-title"
						style={{ marginBottom: "2rem" }}
					>
						What you get
					</h2>
					<div className="features-grid" role="list">
						{/* Profile Pages */}
						<div className="feature-card" role="listitem">
							<span className="feature-eyebrow">// 01 — Identity</span>
							<h3 className="feature-title">Profile Pages</h3>
							<p className="feature-body">
								Your name is your URL. <strong>hacktez.com/u/yourname</strong>{" "}
								is your public hacker card — bio, skills, projects, social
								links, and a shareable share image you can generate right in the
								browser. On-chain. Always yours.
							</p>
							<span className="feature-unlock">// domain required</span>
							<a href="/u/skllz" className="feature-link">
								see an example <ArrowRight size={11} aria-hidden="true" />
							</a>
						</div>

						{/* Hackcade */}
						<div className="feature-card" role="listitem">
							<span className="feature-eyebrow">// 02 — Arcade</span>
							<h3 className="feature-title">Hackcade</h3>
							<p className="feature-body">
								A growing browser arcade built by and for the community. Play
								anything without a wallet. Claim your hack.tez name and your
								scores hit the leaderboard. Build something and submit it.
							</p>
							<span className="feature-unlock">
								// domain unlocks: leaderboard + game submissions
							</span>
							<a href="/arcade" className="feature-link">
								enter the arcade <ArrowRight size={11} aria-hidden="true" />
							</a>
						</div>

						{/* Wiki */}
						<div className="feature-card" role="listitem">
							<span className="feature-eyebrow">// 03 — Knowledge</span>
							<h3 className="feature-title">Wiki</h3>
							<p className="feature-body">
								Community-maintained knowledge, open to read for anyone. With
								your hack.tez name you can author pages, edit entries, and leave
								your mark on the collective documentation.
							</p>
							<span className="feature-unlock">
								// domain unlocks: authoring + editing
							</span>
							<a href="/wiki" className="feature-link">
								read the wiki <ArrowRight size={11} aria-hidden="true" />
							</a>
						</div>

						{/* Bluesky */}
						<div className="feature-card" role="listitem">
							<span className="feature-eyebrow">// 04 — Social</span>
							<h3 className="feature-title">Bluesky Identity</h3>
							<p className="feature-body">
								Your hack.tez domain is a valid Bluesky handle. Link it in your
								profile settings and your Tezos identity becomes your social
								identity — one name across the open web.
							</p>
							<span className="feature-unlock">// domain required</span>
							<a
								href="https://bsky.app/profile/hacktez.com"
								target="_blank"
								rel="noopener noreferrer"
								className="feature-link"
							>
								explore bsky.app <ArrowRight size={11} aria-hidden="true" />
							</a>
						</div>

						{/* HackChat */}
						<div className="feature-card" role="listitem">
							<span className="feature-eyebrow">// 05 — Community</span>
							<h3 className="feature-title">HackChat</h3>
							<p className="feature-body">
								Member-only community chat. Connect with other builders on
								hack.tez — share what you're working on, find collaborators, ask
								questions. Your domain is your key.
							</p>
							<span className="feature-unlock">// domain required</span>
							<a href="/chat" className="feature-link">
								open hackchat <ArrowRight size={11} aria-hidden="true" />
							</a>
						</div>

						{/* Beta Access */}
						<div className="feature-card" role="listitem">
							<span className="feature-eyebrow">// 06 — Early Access</span>
							<h3 className="feature-title">Beta Access</h3>
							<p className="feature-body">
								Be the FO to our FA. The hack.tez community is the first call
								for beta testers on upcoming FAFOlab projects — help us find out
								what breaks, what sticks, and what gets built next.
							</p>
							<span className="feature-unlock">// domain required</span>
							<a
								href="https://fafolab.xyz"
								target="_blank"
								rel="noopener noreferrer"
								className="feature-link"
							>
								see what's cooking <ArrowRight size={11} aria-hidden="true" />
							</a>
						</div>
					</div>
				</div>
			</section>

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
							hack.tez is a thinktank, a cabal, and a secret society — the kind
							with a neon sign out front, doors propped open, and a full bar.
						</strong>
					</p>
					<p className="section-body" style={{ marginBottom: "1rem" }}>
						The name you claim is a real on-chain record. It resolves. It
						routes. Contracts can query it. But the name is just the keycard.
					</p>
					<p className="section-body" style={{ marginBottom: "1rem" }}>
						Builders, breakers, artists, and degens — working in public,
						on-chain, together. The arcade. The wiki. The chat. The beta
						programs. One name unlocks all of it.
					</p>
					<p className="section-body">
						You pay gas (~0.02 ꜩ). That's it. 1 claim per wallet.
					</p>
					<p className="section-body" style={{ marginTop: "2rem" }}>
						FAFOlab retains ownership of the main hack.tez domain and provides
						this service with no warranty or guarantee.
					</p>
					<p className="section-body" style={{ marginTop: "2rem" }}>
						The future is not promised. We're building it anyway.
					</p>
					<p className="section-body" style={{ marginTop: "2rem" }}>
						Everything you see here is free, open, unlicensed, and in our{" "}
						<a
							href="https://github.com/skullzarmy/hack-tez/"
							target="_blank"
							rel="noopener noreferrer"
						>
							monorepo
						</a>
						. Feel free to take anything that helps. Throw us a #tezosCRP
						nomination at{" "}
						<a
							href="https://tezoscommons.org/rewards/"
							target="_blank"
							rel="noopener noreferrer"
						>
							Tezos Commons
						</a>{" "}
						to say thanks.
					</p>
					<p
						className="section-body"
						style={{
							marginTop: "3rem",
							fontSize: "1.4rem",
							fontWeight: 900,
							letterSpacing: "-0.01em",
						}}
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
							style={{
								fontSize: "0.8rem",
								letterSpacing: "0.1em",
								display: "inline-flex",
								alignItems: "center",
								gap: "0.35em",
							}}
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
