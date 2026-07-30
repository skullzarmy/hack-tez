/** biome-ignore-all lint/suspicious/noCommentText: <matches Profile> */

import { ArrowLeft, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Hackatar } from "../components/Hackatar";
import { TipJar } from "../components/TipJar";
import config from "../config/tezos";
import { useTezos } from "../context/TezosContext";
import { usePageMeta } from "../hooks/usePageMeta";
import type { DomainRecord } from "../lib/domains";
import { getDomainRecord } from "../lib/domains";
import {
	BADGE_STYLE,
	ENV_STYLES,
	PROJECT_STATUS_STYLES,
	projectLogoUrl,
	safeHref,
	truncateAddress,
} from "../lib/profileDisplay";
import type { ProjectEntry } from "../types/profile";
import { DEFAULT_PROJECT_TIP_TITLE, findProjectBySlug } from "../types/profile";

// ── Shared bits ──────────────────────────────────────────────────────

const SECTION_LABEL: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	color: "var(--fg-3)",
	letterSpacing: "0.1em",
	textTransform: "uppercase",
	marginBottom: "0.6rem",
};

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="container"
			style={{ paddingBlock: "3rem 5rem", maxWidth: "680px" }}
		>
			{children}
		</div>
	);
}

function NotFound({
	label,
	slug,
}: {
	label: string;
	slug: string;
}) {
	return (
		<Shell>
			<div style={{ textAlign: "center", paddingBlock: "3rem" }}>
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
					No project <strong>{slug}</strong> on {label}.hack.{config.tld}.
				</p>
				<Link
					to={`/u/${label}`}
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
					<ArrowLeft size={14} aria-hidden="true" /> back to profile
				</Link>
			</div>
		</Shell>
	);
}

function Skeleton() {
	return (
		<Shell>
			<div
				style={{
					height: "1.5rem",
					width: "40%",
					background: "var(--bg-2)",
					borderRadius: "4px",
					marginBottom: "1rem",
				}}
			/>
			<div
				style={{
					height: "4rem",
					background: "var(--bg-2)",
					borderRadius: "8px",
				}}
			/>
		</Shell>
	);
}

// ── Page ─────────────────────────────────────────────────────────────

export default function ProjectPage() {
	const { subdomain, project: slug } = useParams<{
		subdomain: string;
		project: string;
	}>();
	const { address: walletAddress } = useTezos();
	const [record, setRecord] = useState<DomainRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);
	const hasLoaded = useRef(false);

	const label = subdomain ?? "";
	const projectSlugParam = slug ?? "";
	const fullName = `${label}.hack.${config.tld}`;

	const project: ProjectEntry | null = findProjectBySlug(
		record?.profile.projects,
		projectSlugParam,
	);

	const ownerName =
		record?.profile.name || record?.profile.nickname || label;

	usePageMeta({
		title: project
			? `${project.name} by ${ownerName} — hack.tez`
			: `Project — ${fullName}`,
		description:
			project?.desc ??
			`A project by ${ownerName} on hack.tez.`,
		path: `/u/${label}/p/${projectSlugParam}`,
		image: `/api/v1/share-card/${label}`,
	});

	useEffect(() => {
		if (!label || !projectSlugParam) {
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
				if (cancelled) return;
				setNotFound(true);
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [label, projectSlugParam, fullName]);

	if (loading) return <Skeleton />;
	if (notFound || !record || !project) {
		return <NotFound label={label} slug={projectSlugParam} />;
	}

	const isOwner = walletAddress !== null && walletAddress === record.owner;
	// Project tips fall back to the domain's address, same as the profile jar.
	const tipRecipient =
		project.tips?.payTo || record.address || record.owner;

	const logoUrl = projectLogoUrl(project.logo);
	const websiteUrl = safeHref(project.url);
	const repoUrl = safeHref(project.repo);
	const envStyle = project.environment
		? (ENV_STYLES[project.environment] ?? ENV_STYLES.other)
		: null;
	const statusStyle = project.status
		? (PROJECT_STATUS_STYLES[project.status] ?? null)
		: null;

	return (
		<Shell>
			{/* ── Back to owner ───────────────────────────────────── */}
			<Link
				to={`/u/${label}`}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: "0.4rem",
					color: "var(--fg-3)",
					textDecoration: "none",
					fontSize: "0.75rem",
					marginBottom: "1.5rem",
				}}
			>
				<ArrowLeft size={14} aria-hidden="true" />
				{fullName}
			</Link>

			{/* ── Header ──────────────────────────────────────────── */}
			<header
				style={{
					display: "flex",
					alignItems: "center",
					gap: "1rem",
					marginBottom: "1.25rem",
				}}
			>
				{logoUrl && (
					<img
						src={logoUrl}
						alt={`${project.name} logo`}
						style={{
							width: 64,
							height: 64,
							borderRadius: "8px",
							objectFit: "cover",
							border: "1px solid var(--border)",
							flexShrink: 0,
						}}
					/>
				)}
				<div style={{ minWidth: 0 }}>
					<h1
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: "clamp(1.2rem, 4vw, 1.6rem)",
							letterSpacing: "-0.02em",
							color: "var(--fg)",
							marginBottom: "0.4rem",
						}}
					>
						{project.name}
					</h1>
					<div
						style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}
					>
						{statusStyle && project.status && (
							<span
								style={{
									...BADGE_STYLE,
									background: statusStyle.bg,
									color: statusStyle.color,
									textTransform: "uppercase",
								}}
							>
								{project.status}
							</span>
						)}
						{envStyle && project.environment && (
							<span
								style={{
									...BADGE_STYLE,
									background: envStyle.bg,
									color: envStyle.color,
								}}
							>
								{project.environment}
							</span>
						)}
					</div>
				</div>
			</header>

			{/* ── Description ─────────────────────────────────────── */}
			<p
				style={{
					color: "var(--fg)",
					fontSize: "0.9rem",
					lineHeight: 1.6,
					marginBottom: "1.5rem",
				}}
			>
				{project.desc}
			</p>

			{/* ── Links ───────────────────────────────────────────── */}
			{(websiteUrl || repoUrl || project.address) && (
				<div
					style={{
						display: "flex",
						gap: "0.75rem",
						flexWrap: "wrap",
						alignItems: "center",
						fontSize: "0.78rem",
						marginBottom: "1.5rem",
					}}
				>
					{websiteUrl && (
						<a
							href={websiteUrl}
							target="_blank"
							rel="noopener noreferrer"
							style={{
								color: "var(--ok)",
								textDecoration: "none",
								display: "inline-flex",
								alignItems: "center",
								gap: "0.35em",
							}}
						>
							<ExternalLink size={14} aria-hidden="true" /> Website
						</a>
					)}
					{repoUrl && (
						<a
							href={repoUrl}
							target="_blank"
							rel="noopener noreferrer"
							style={{ color: "var(--fg-2)", textDecoration: "none" }}
						>
							⌥ Repo
						</a>
					)}
					{project.address && (
						<span
							style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}
							title={project.address}
						>
							◎ {truncateAddress(project.address)}
						</span>
					)}
				</div>
			)}

			{/* ── Project tip jar ─────────────────────────────────── */}
			<TipJar
				jar={project.tips}
				recipient={tipRecipient}
				title={project.tips?.title ?? DEFAULT_PROJECT_TIP_TITLE}
				isSelf={isOwner}
				info={{
					label,
					fullName,
					displayName: ownerName,
					twitter: record.profile.twitter,
					bluesky: record.profile.bluesky,
					projectName: project.name,
					projectSlug: projectSlugParam,
				}}
			/>

			{/* ── Built by ────────────────────────────────────────── */}
			<section style={{ marginTop: "2rem" }}>
				<h2 style={SECTION_LABEL}>Built by</h2>
				<Link
					to={`/u/${label}`}
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.75rem",
						background: "var(--bg-2)",
						border: "1px solid var(--border)",
						borderRadius: "8px",
						padding: "0.85rem 1rem",
						textDecoration: "none",
					}}
				>
					<Hackatar label={label} size={40} />
					<div style={{ minWidth: 0 }}>
						<span
							style={{
								display: "block",
								fontFamily: "var(--font-mono)",
								fontSize: "0.85rem",
								color: "var(--fg)",
							}}
						>
							{fullName}
						</span>
						{ownerName !== label && (
							<span style={{ fontSize: "0.75rem", color: "var(--fg-3)" }}>
								{ownerName}
							</span>
						)}
					</div>
					<span
						style={{
							marginLeft: "auto",
							color: "var(--fg-3)",
							fontSize: "0.75rem",
						}}
					>
						View profile →
					</span>
				</Link>
			</section>
		</Shell>
	);
}
