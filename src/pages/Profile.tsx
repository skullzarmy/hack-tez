/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */

import {
	SiBluesky,
	SiDiscord,
	SiFarcaster,
	SiGithub,
	SiInstagram,
	SiMastodon,
	SiTelegram,
	SiTwitch,
	SiX,
	SiYoutube,
} from "@icons-pack/react-simple-icons";
import { ArrowLeft, Globe } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Hackatar } from "../components/Hackatar";
import {
	ProfileEditFormBody,
	useProfileEdit,
} from "../components/ProfileEditForm";
import { ProfileShareStudio } from "../components/ProfileShareStudio";
import { ProjectCard } from "../components/ProjectCard";
import { TipJar } from "../components/TipJar";
import config from "../config/tezos";
import { useTezos } from "../context/TezosContext";
import { useBlueskyHandle } from "../hooks/useBlueskyHandle";
import { usePageMeta } from "../hooks/usePageMeta";
import { useTedContracts } from "../hooks/useTedContracts";
import type { DomainRecord } from "../lib/domains";
import { getDomainRecord } from "../lib/domains";
import { safeHref, truncateAddress } from "../lib/profileDisplay";
import type { BuilderStatus, HackProfile } from "../types/profile";
import { tipJarIsLive } from "../types/profile";

// ── Helpers ──────────────────────────────────────────────────────────

function resolveAvatarUrl(
	profile: HackProfile,
	gravatar: string | null,
	label: string,
): { type: "image"; url: string } | { type: "hackatar"; label: string } {
	if (profile.picture) {
		if (
			profile.picture.startsWith("ipfs://") ||
			profile.picture.startsWith("https://")
		) {
			return {
				type: "image",
				url: `/api/v1/avatar/${encodeURIComponent(label)}`,
			};
		}
	}
	if (gravatar) {
		return {
			type: "image",
			url: `/api/v1/avatar/${encodeURIComponent(label)}`,
		};
	}
	// Server resolves label → opHash → deterministic hackatar
	return { type: "hackatar", label };
}

// ── Social link helpers ──────────────────────────────────────────────

function mastodonUrl(handle: string): string | null {
	const cleaned = handle.replace(/^@/, "");
	const at = cleaned.indexOf("@");
	if (at < 0) return null;
	const user = cleaned.slice(0, at);
	const instance = cleaned.slice(at + 1);
	if (!user || !instance) return null;
	return `https://${instance}/@${user}`;
}

/** Each entry maps a HackProfile field directly to its display config. */
const SOCIAL_PLATFORMS: Array<{
	field: keyof HackProfile;
	label: string;
	icon: React.ReactNode;
	buildUrl: (handle: string) => string | null;
}> = [
	{ field: "github",    label: "GitHub",    icon: <SiGithub size={14} />,    buildUrl: (h) => `https://github.com/${h}` },
	{ field: "twitter",   label: "X / Twitter", icon: <SiX size={14} />,       buildUrl: (h) => `https://x.com/${h}` },
	{ field: "bluesky",   label: "Bluesky",   icon: <SiBluesky size={14} />,   buildUrl: (h) => `https://bsky.app/profile/${h}` },
	{ field: "mastodon",  label: "Mastodon",  icon: <SiMastodon size={14} />,  buildUrl: mastodonUrl },
	{ field: "farcaster", label: "Farcaster", icon: <SiFarcaster size={14} />, buildUrl: (h) => `https://warpcast.com/${h}` },
	{ field: "telegram",  label: "Telegram",  icon: <SiTelegram size={14} />,  buildUrl: (h) => `https://t.me/${h}` },
	{ field: "discord",   label: "Discord",   icon: <SiDiscord size={14} />,   buildUrl: () => null },
	{ field: "instagram", label: "Instagram", icon: <SiInstagram size={14} />, buildUrl: (h) => `https://instagram.com/${h}` },
	{ field: "youtube",   label: "YouTube",   icon: <SiYoutube size={14} />,   buildUrl: (h) => `https://youtube.com/@${h.replace(/^@/, "")}` },
	{ field: "twitch",    label: "Twitch",    icon: <SiTwitch size={14} />,    buildUrl: (h) => `https://twitch.tv/${h}` },
	{ field: "website",   label: "Website",   icon: <Globe size={14} />,        buildUrl: safeHref },
];

const STATUS_STYLES: Record<
	BuilderStatus,
	{ bg: string; color: string; label: string }
> = {
	building: { bg: "var(--info-bg)", color: "var(--info)", label: "Building" },
	"open-to-collab": {
		bg: "var(--ok-bg)",
		color: "var(--ok)",
		label: "Open to Collab",
	},
	available: { bg: "var(--warn-bg)", color: "var(--warn)", label: "Available" },
	hiring: { bg: "var(--purple-bg)", color: "var(--purple)", label: "Hiring" },
};

// ── Sub-components ───────────────────────────────────────────────────

function CopyableAddress({ address }: { address: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(address).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [address]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			title={`Copy full address: ${address}`}
			style={{
				background: "none",
				border: "none",
				padding: 0,
				color: "var(--fg-3)",
				fontFamily: "var(--font-mono)",
				fontSize: "0.75rem",
				cursor: "pointer",
				letterSpacing: "0.04em",
				display: "inline-flex",
				alignItems: "center",
				gap: "0.4rem",
			}}
		>
			{truncateAddress(address)}
			<span style={{ fontSize: "0.65rem", opacity: 0.5 }}>
				{copied ? "✓" : "⧉"}
			</span>
		</button>
	);
}

function CopyableDomain({ name }: { name: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(name).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [name]);

	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "0.5rem",
			}}
		>
			<span
				aria-hidden="true"
				style={{
					color: "var(--fg-3)",
					fontSize: "1.1rem",
					opacity: 0.35,
					fontFamily: "var(--font-mono)",
				}}
			>
				&gt;
			</span>
			<h1
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: "1.3rem",
					letterSpacing: "-0.01em",
					color: "var(--ok)",
					margin: 0,
					fontWeight: 700,
				}}
			>
				{name}
			</h1>
			<button
				type="button"
				onClick={handleCopy}
				title={`Copy: ${name}`}
				aria-label={`Copy domain name ${name}`}
				style={{
					background: "none",
					border: "none",
					padding: 0,
					cursor: "pointer",
					fontSize: "0.65rem",
					color: "var(--fg-3)",
					opacity: 0.4,
				}}
			>
				{copied ? "✓" : "⧉"}
			</button>
		</div>
	);
}

function SkillChip({ skill }: { skill: string }) {
	return (
		<span
			style={{
				background: "rgba(148,163,184,0.1)",
				color: "var(--fg-2)",
				border: "1px solid var(--border)",
				padding: "0.2rem 0.55rem",
				borderRadius: "9999px",
				fontSize: "0.7rem",
				letterSpacing: "0.02em",
				whiteSpace: "nowrap",
			}}
		>
			{skill}
		</span>
	);
}

function LinkIcon({
	href,
	label,
	icon,
}: {
	href: string;
	label: string;
	icon: React.ReactNode;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			title={label}
			aria-label={label}
			style={{
				color: "var(--fg-2)",
				textDecoration: "none",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				minWidth: "2rem",
				minHeight: "2rem",
				padding: "0.4rem",
				border: "1px solid var(--border)",
				borderRadius: "6px",
				transition: "border-color 0.15s",
			}}
		>
			{icon}
		</a>
	);
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function ProfileSkeleton() {
	const pulse: React.CSSProperties = {
		background: "var(--border)",
		borderRadius: "4px",
		animation: "profile-pulse 1.2s ease-in-out infinite",
	};
	return (
		<div
			className="container"
			style={{ paddingBlock: "3rem 5rem", maxWidth: "680px" }}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1rem",
				}}
			>
				<div style={{ ...pulse, width: 96, height: 96, borderRadius: "50%" }} />
				<div style={{ ...pulse, width: 200, height: 24 }} />
				<div style={{ ...pulse, width: 140, height: 18 }} />
			</div>
			<div
				style={{
					marginTop: "2rem",
					display: "flex",
					flexDirection: "column",
					gap: "0.8rem",
				}}
			>
				<div style={{ ...pulse, width: "100%", height: 14 }} />
				<div style={{ ...pulse, width: "80%", height: 14 }} />
				<div style={{ ...pulse, width: "60%", height: 14 }} />
			</div>
			<style>{`@keyframes profile-pulse { 0%,100% { opacity:0.4 } 50% { opacity:0.8 } }`}</style>
		</div>
	);
}

// ── Main Component ───────────────────────────────────────────────────

export default function Profile() {
	const { subdomain } = useParams<{ subdomain: string }>();
	const { address: walletAddress } = useTezos();
	const tedContracts = useTedContracts();
	const [record, setRecord] = useState<DomainRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const hasLoaded = useRef(false);

	const label = subdomain ?? "";
	const fullName = `${label}.hack.${config.tld}`;

	const profileForMeta = record?.profile ?? null;
	const metaDisplayName =
		profileForMeta?.nickname || profileForMeta?.name || fullName;
	const bio = profileForMeta?.bio?.trim();
	const metaDescription = bio
		? bio.length > 200
			? `${bio.slice(0, 197)}…`
			: bio
		: `${metaDisplayName} on hack.tez — a free Tezos subdomain. View profile, links, and on-chain identity.`;
	usePageMeta({
		title: `${metaDisplayName} (${fullName}) — hack.tez`,
		description: metaDescription,
		path: `/u/${label}`,
		image: `/api/v1/share-card/${label}`,
	});

	const handleRefresh = useCallback(() => {
		setRefreshKey((k) => k + 1);
	}, []);

	const editState = useProfileEdit(label, fullName, record, handleRefresh);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional manual refetch trigger
	useEffect(() => {
		if (!label) {
			setNotFound(true);
			setLoading(false);
			return;
		}
		let cancelled = false;
		if (!hasLoaded.current) setLoading(true);
		setNotFound(false);

		getDomainRecord(fullName)
			.then((result) => {
				if (cancelled) return;
				if (result === null) {
					setNotFound(true);
				} else {
					setRecord(result);
					hasLoaded.current = true;
				}
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) {
					setNotFound(true);
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [label, fullName, refreshKey]);

	// Hooks must run on every render — call before any early returns.
	// The hook handles undefined input (returns null), so passing the
	// pre-load value of profile.bluesky is safe.
	const bskyDisplayHandle = useBlueskyHandle(record?.profile.bluesky);

	// ── Loading State ────────────────────────────────────────────────
	if (loading) return <ProfileSkeleton />;

	// ── 404 State ────────────────────────────────────────────────────
	if (notFound || !record) {
		return (
			<div
				className="container"
				style={{
					paddingBlock: "4rem 5rem",
					maxWidth: "680px",
					textAlign: "center",
				}}
			>
				<h1
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "clamp(1.4rem, 4vw, 2rem)",
						letterSpacing: "-0.02em",
						marginBottom: "1rem",
					}}
				>
					// 404
				</h1>
				<p
					style={{
						color: "var(--fg-muted)",
						fontSize: "0.9rem",
						marginBottom: "1.5rem",
					}}
				>
					<strong>{fullName}</strong> is not registered.
				</p>
				<a
					href="/"
					style={{
						color: "var(--ok)",
						textDecoration: "none",
						fontSize: "0.8rem",
						letterSpacing: "0.1em",
						display: "inline-flex",
						alignItems: "center",
						gap: "0.35em",
					}}
				>
					<ArrowLeft size={14} aria-hidden="true" /> claim a name
				</a>
			</div>
		);
	}

	const { profile, owner, gravatar } = record;
	const isOwner = walletAddress !== null && walletAddress === owner;

	// Tips default to the domain's resolution address, falling back to its owner.
	const tipRecipient = profile.tips?.payTo || record.address || owner;

	const hasProfileData = !!(
		profile.bio ||
		profile.status ||
		profile.skills?.length ||
		profile.projects?.length ||
		profile.location ||
		tipJarIsLive(profile.tips) ||
		SOCIAL_PLATFORMS.some((p) => !!profile[p.field])
	);

	const avatar = resolveAvatarUrl(profile, gravatar, label);
	const displayName = profile.name || profile.nickname || label;

	const hasLinks = SOCIAL_PLATFORMS.some((p) => !!profile[p.field]);

	return (
		<>
			<div
				className="container"
				style={{ paddingBlock: "3rem 5rem", maxWidth: "680px" }}
			>
				{/* ── Header ──────────────────────────────────────────── */}
				<header
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "0.75rem",
						marginBottom: "2rem",
					}}
				>
					{avatar.type === "image" ? (
						<img
							src={avatar.url}
							alt={`${displayName} avatar`}
							style={{
								width: 96,
								height: 96,
								borderRadius: "50%",
								objectFit: "cover",
								border: "2px solid var(--border)",
							}}
						/>
					) : (
						<Hackatar label={avatar.label} size={96} animated />
					)}

					<CopyableDomain name={fullName} />

					{displayName !== label && (
						<span
							style={{
								fontFamily: "var(--font)",
								fontSize: "0.8rem",
								color: "var(--fg-3)",
								letterSpacing: "0.02em",
								marginTop: "-0.25rem",
							}}
						>
							{displayName}
						</span>
					)}

					<CopyableAddress address={owner} />

					{profile.status && (
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "0.7rem",
								color: STATUS_STYLES[profile.status].color,
								letterSpacing: "0.02em",
								opacity: 0.8,
							}}
						>
							{"// "}
							{STATUS_STYLES[profile.status].label.toLowerCase()}
						</span>
					)}

					{isOwner && !editState.editing && tedContracts?.updateRecord && (
						<button
							type="button"
							onClick={() => editState.enterEditMode(profile)}
							style={{
								marginTop: "0.25rem",
								fontSize: "0.7rem",
								color: "var(--fg-3)",
								textDecoration: "none",
								border: "1px solid var(--border)",
								borderRadius: "4px",
								padding: "0.25rem 0.75rem",
								letterSpacing: "0.06em",
								textTransform: "uppercase",
								background: "none",
								cursor: "pointer",
								fontFamily: "var(--font)",
							}}
						>
							Edit profile
						</button>
					)}

					{editState.editing && (
						<span
							style={{
								marginTop: "0.25rem",
								fontSize: "0.65rem",
								color: "var(--ok)",
								letterSpacing: "0.1em",
								textTransform: "uppercase",
								fontWeight: 700,
							}}
						>
							● Editing
						</span>
					)}

					{editState.submitSuccess && (
						<div
							style={{
								marginTop: "0.25rem",
								background: "rgba(34,197,94,0.1)",
								border: "1px solid rgba(34,197,94,0.25)",
								borderRadius: "6px",
								padding: "0.4rem 0.8rem",
								fontSize: "0.75rem",
								color: "var(--ok)",
							}}
						>
							Profile saved successfully!
						</div>
					)}
				</header>

				{/* ── Edit Mode ───────────────────────────────────────── */}
				{editState.editing && <ProfileEditFormBody state={editState} />}

				{/* ── View Mode ───────────────────────────────────────── */}
				{!editState.editing && (
					<>
						{isOwner && (
							<ProfileShareStudio
								label={label}
								fullName={fullName}
								displayName={displayName}
								avatarUrl={avatar.type === "image" ? avatar.url : null}
								bio={profile.bio}
								status={profile.status}
							/>
						)}

						{/* ── Empty Profile ──────────────────────────────── */}
						{!hasProfileData && (
							<div style={{ textAlign: "center", padding: "2rem 0" }}>
								<p style={{ color: "var(--fg-3)", fontSize: "0.85rem" }}>
									This hacker hasn't set up their profile yet.
								</p>
							</div>
						)}

						{/* ── Bio ────────────────────────────────────────── */}
						{profile.bio && (
							<section style={{ marginBottom: "1.5rem" }}>
								<p
									style={{
										color: "var(--fg)",
										fontSize: "0.9rem",
										lineHeight: 1.6,
									}}
								>
									{profile.bio}
								</p>
							</section>
						)}

						{/* ── Location ───────────────────────────────────── */}
						{profile.location && (
							<div
								style={{
									marginBottom: "1.25rem",
									display: "flex",
									alignItems: "center",
									gap: "0.4rem",
								}}
							>
								<span style={{ fontSize: "0.85rem" }} aria-hidden="true">
									◉
								</span>
								<span style={{ color: "var(--fg-2)", fontSize: "0.8rem" }}>
									{profile.location}
								</span>
							</div>
						)}

						{/* ── Links ──────────────────────────────────────── */}
						{hasLinks && (
							<div
								style={{
									display: "flex",
									gap: "0.5rem",
									flexWrap: "wrap",
									marginBottom: "1.5rem",
								}}
							>
								{SOCIAL_PLATFORMS.filter((p) => !!profile[p.field]).map((p) => {
									const handle = profile[p.field] as string;
									const href = p.buildUrl(handle);
									const displayValue =
										p.field === "bluesky" && bskyDisplayHandle
											? `@${bskyDisplayHandle}`
											: handle;
									const lbl = `${p.label}: ${displayValue}`;
									if (!href) {
										return (
											<span
												key={p.field}
												role="img"
												title={lbl}
												aria-label={lbl}
												style={{
													color: "var(--fg-2)",
													display: "inline-flex",
													alignItems: "center",
													justifyContent: "center",
													minWidth: "2rem",
													minHeight: "2rem",
													padding: "0.4rem",
													border: "1px solid var(--border)",
													borderRadius: "6px",
												}}
											>
												{p.icon}
											</span>
										);
									}
									return (
										<LinkIcon
											key={p.field}
											href={href}
											label={lbl}
											icon={p.icon}
										/>
									);
								})}
							</div>
						)}

						{/* ── Tip Jar ────────────────────────────────────── */}
						<TipJar
							jar={profile.tips}
							recipient={tipRecipient}
							isSelf={isOwner}
							info={{
								label,
								fullName,
								displayName,
								twitter: profile.twitter,
								bluesky: profile.bluesky,
							}}
						/>

						{/* ── Skills ─────────────────────────────────────── */}
						{profile.skills && profile.skills.length > 0 && (
							<section style={{ marginBottom: "1.5rem" }}>
								<h2
									style={{
										fontFamily: "var(--font-mono)",
										fontSize: "0.75rem",
										color: "var(--fg-3)",
										letterSpacing: "0.1em",
										textTransform: "uppercase",
										marginBottom: "0.6rem",
									}}
								>
									Skills
								</h2>
								<div
									style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}
								>
									{profile.skills.map((skill) => (
										<SkillChip key={skill} skill={skill} />
									))}
								</div>
							</section>
						)}

						{/* ── Projects ───────────────────────────────────── */}
						{profile.projects && profile.projects.length > 0 && (
							<section>
								<h2
									style={{
										fontFamily: "var(--font-mono)",
										fontSize: "0.75rem",
										color: "var(--fg-3)",
										letterSpacing: "0.1em",
										textTransform: "uppercase",
										marginBottom: "0.6rem",
									}}
								>
									Projects
								</h2>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "0.75rem",
									}}
								>
									{profile.projects.map((project) => (
										<ProjectCard
											key={project.name}
											project={project}
											ownerLabel={label}
										/>
									))}
								</div>
							</section>
						)}
					</>
				)}
			</div>

			{/* ── Save Status Toast ─────────────────────────────────── */}
			{editState.saveStatus && (
				<div
					style={{
						position: "fixed",
						bottom: "1.5rem",
						left: 0,
						right: 0,
						display: "flex",
						justifyContent: "center",
						zIndex: 100,
						pointerEvents: "none",
						animation: "toast-in 0.25s ease forwards",
					}}
				>
					<div
						style={{
							pointerEvents: "auto",
							background: "var(--bg-2)",
							border: "1px solid var(--ok)",
							borderRadius: "8px",
							padding: "0.75rem 1.5rem",
							fontSize: "0.85rem",
							fontFamily: "var(--font)",
							fontWeight: 600,
							color: "var(--fg)",
							backdropFilter: "blur(8px)",
							WebkitBackdropFilter: "blur(8px)",
							display: "flex",
							alignItems: "center",
							gap: "0.6rem",
							boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
						}}
					>
						<span
							style={{
								display: "inline-block",
								width: "8px",
								height: "8px",
								borderRadius: "50%",
								background: "var(--ok)",
								animation: "pulse 1.5s ease-in-out infinite",
							}}
						/>
						{editState.saveStatus}
					</div>
				</div>
			)}
		</>
	);
}
