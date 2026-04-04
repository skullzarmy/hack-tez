/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTezos } from "../context/TezosContext";
import { getDomainRecord } from "../lib/domains";
import type { DomainRecord } from "../lib/domains";
import type { HackProfile, ProjectEntry, BuilderStatus } from "../types/profile";
import config from "../config/tezos";

// ── Helpers ──────────────────────────────────────────────────────────

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function labelToHsl(label: string): string {
    const h = hashCode(label) % 360;
    return `hsl(${h}, 55%, 45%)`;
}

function labelToHslLight(label: string): string {
    const h = hashCode(label) % 360;
    return `hsl(${h}, 55%, 75%)`;
}

function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function resolveAvatarUrl(profile: HackProfile, gravatar: string | null, label: string): { type: "image"; url: string } | { type: "generated"; label: string } {
    if (profile.picture) {
        if (profile.picture.startsWith("ipfs://")) {
            const cid = profile.picture.replace("ipfs://", "");
            return { type: "image", url: `https://ipfs.fileship.xyz/ipfs/${cid}` };
        }
        if (profile.picture.startsWith("https://")) {
            return { type: "image", url: profile.picture };
        }
    }
    if (gravatar) {
        return { type: "image", url: `https://www.gravatar.com/avatar/${gravatar}?s=200&d=identicon` };
    }
    return { type: "generated", label };
}

const STATUS_STYLES: Record<BuilderStatus, { bg: string; color: string; label: string }> = {
    building: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa", label: "Building" },
    "open-to-collab": { bg: "rgba(34,197,94,0.15)", color: "#4ade80", label: "Open to Collab" },
    available: { bg: "rgba(234,179,8,0.15)", color: "#facc15", label: "Available" },
    hiring: { bg: "rgba(168,85,247,0.15)", color: "#c084fc", label: "Hiring" },
};

const ENV_STYLES: Record<string, { bg: string; color: string }> = {
    tezos: { bg: "rgba(59,130,246,0.12)", color: "#60a5fa" },
    etherlink: { bg: "rgba(168,85,247,0.12)", color: "#c084fc" },
    tezlink: { bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
    web: { bg: "rgba(234,179,8,0.12)", color: "#facc15" },
    other: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
};

const PROJECT_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    live: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
    wip: { bg: "rgba(234,179,8,0.15)", color: "#facc15" },
    archived: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
    "open-source": { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
};

// ── Sub-components ───────────────────────────────────────────────────

function GeneratedAvatar({ label, size }: { label: string; size: number }) {
    const bg = labelToHsl(label);
    const fg = labelToHslLight(label);
    const initial = label.charAt(0).toUpperCase();
    return (
        <div
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: size * 0.4,
                fontWeight: 900,
                color: fg,
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
            }}
        >
            {initial}
        </div>
    );
}

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
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "0.2rem 0.5rem",
                color: "var(--fg-2)",
                fontFamily: "var(--font)",
                fontSize: "0.75rem",
                cursor: "pointer",
                letterSpacing: "0.04em",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
            }}
        >
            {truncateAddress(address)}
            <span style={{ fontSize: "0.65rem", opacity: 0.6 }}>{copied ? "✓" : "⧉"}</span>
        </button>
    );
}

function StatusBadge({ status }: { status: BuilderStatus }) {
    const s = STATUS_STYLES[status];
    return (
        <span
            style={{
                background: s.bg,
                color: s.color,
                padding: "0.2rem 0.6rem",
                borderRadius: "9999px",
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
            }}
        >
            {s.label}
        </span>
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

function ProjectCard({ project }: { project: ProjectEntry }) {
    const envStyle = project.environment ? ENV_STYLES[project.environment] ?? ENV_STYLES.other : null;
    const statusStyle = project.status ? PROJECT_STATUS_STYLES[project.status] ?? null : null;

    return (
        <div
            style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--fg)" }}>{project.name}</span>
                {statusStyle && project.status && (
                    <span
                        style={{
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            padding: "0.1rem 0.45rem",
                            borderRadius: "9999px",
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                        }}
                    >
                        {project.status}
                    </span>
                )}
                {envStyle && project.environment && (
                    <span
                        style={{
                            background: envStyle.bg,
                            color: envStyle.color,
                            padding: "0.1rem 0.45rem",
                            borderRadius: "9999px",
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                        }}
                    >
                        {project.environment}
                    </span>
                )}
            </div>
            <p style={{ color: "var(--fg-2)", fontSize: "0.8rem", lineHeight: 1.5, margin: 0 }}>{project.desc}</p>
            {(project.url || project.repo || project.address) && (
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.7rem" }}>
                    {project.url && (
                        <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--ok)", textDecoration: "none" }}
                        >
                            ↗ Website
                        </a>
                    )}
                    {project.repo && (
                        <a
                            href={project.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg-2)", textDecoration: "none" }}
                        >
                            ⌥ Repo
                        </a>
                    )}
                    {project.address && (
                        <span
                            style={{ color: "var(--fg-3)", fontFamily: "var(--font)", letterSpacing: "0.03em" }}
                            title={project.address}
                        >
                            ◎ {project.address.slice(0, 8)}…
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

function LinkIcon({ href, label, icon }: { href: string; label: string; icon: string }) {
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
                fontSize: "0.8rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.3rem 0.6rem",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                transition: "border-color 0.15s",
            }}
        >
            <span style={{ fontSize: "0.9rem" }}>{icon}</span>
            <span>{label}</span>
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
        <div className="container" style={{ paddingBlock: "3rem 5rem", maxWidth: "680px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                <div style={{ ...pulse, width: 96, height: 96, borderRadius: "50%" }} />
                <div style={{ ...pulse, width: 200, height: 24 }} />
                <div style={{ ...pulse, width: 140, height: 18 }} />
            </div>
            <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
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
    const [record, setRecord] = useState<DomainRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const label = subdomain ?? "";
    const fullName = `${label}.hack.${config.tld}`;

    useEffect(() => {
        if (!label) {
            setNotFound(true);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setNotFound(false);

        getDomainRecord(fullName).then((result) => {
            if (cancelled) return;
            if (result === null) {
                setNotFound(true);
            } else {
                setRecord(result);
            }
            setLoading(false);
        }).catch(() => {
            if (!cancelled) {
                setNotFound(true);
                setLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [label, fullName]);

    // ── Loading State ────────────────────────────────────────────────
    if (loading) return <ProfileSkeleton />;

    // ── 404 State ────────────────────────────────────────────────────
    if (notFound || !record) {
        return (
            <div className="container" style={{ paddingBlock: "4rem 5rem", maxWidth: "680px", textAlign: "center" }}>
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
                <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
                    <strong>{fullName}</strong> is not registered.
                </p>
                <a
                    href="/"
                    style={{
                        color: "var(--ok)",
                        textDecoration: "none",
                        fontSize: "0.8rem",
                        letterSpacing: "0.1em",
                    }}
                >
                    ← claim a name
                </a>
            </div>
        );
    }

    const { profile, owner, gravatar } = record;
    const isOwner = walletAddress !== null && walletAddress === owner;

    // Check if profile has any hack: data at all
    const hasProfileData = !!(
        profile.bio ||
        profile.status ||
        profile.skills?.length ||
        profile.projects?.length ||
        profile.location ||
        profile.github ||
        profile.twitter ||
        profile.website
    );

    const avatar = resolveAvatarUrl(profile, gravatar, label);
    const displayName = profile.name || profile.nickname || label;

    const hasLinks = !!(profile.github || profile.twitter || profile.website);

    return (
        <div className="container" style={{ paddingBlock: "3rem 5rem", maxWidth: "680px" }}>
            {/* ── Header ──────────────────────────────────────────── */}
            <header style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
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
                    <GeneratedAvatar label={avatar.label} size={96} />
                )}

                <div style={{ textAlign: "center" }}>
                    <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
                        {displayName}
                    </h1>
                    <span
                        style={{
                            display: "inline-block",
                            background: "rgba(34,197,94,0.1)",
                            color: "var(--ok)",
                            border: "1px solid rgba(34,197,94,0.25)",
                            padding: "0.15rem 0.6rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontFamily: "var(--font)",
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            marginBottom: "0.5rem",
                        }}
                    >
                        {fullName}
                    </span>
                </div>

                <CopyableAddress address={owner} />

                {profile.status && (
                    <div style={{ marginTop: "0.25rem" }}>
                        <StatusBadge status={profile.status} />
                    </div>
                )}

                {isOwner && (
                    <a
                        href="#edit"
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
                        }}
                    >
                        Edit profile
                    </a>
                )}
            </header>

            {/* ── Empty Profile ────────────────────────────────────── */}
            {!hasProfileData && (
                <div style={{ textAlign: "center", padding: "2rem 0" }}>
                    <p style={{ color: "var(--fg-3)", fontSize: "0.85rem" }}>
                        This hacker hasn't set up their profile yet.
                    </p>
                </div>
            )}

            {/* ── Bio ─────────────────────────────────────────────── */}
            {profile.bio && (
                <section style={{ marginBottom: "1.5rem" }}>
                    <p style={{ color: "var(--fg)", fontSize: "0.9rem", lineHeight: 1.6 }}>{profile.bio}</p>
                </section>
            )}

            {/* ── Location ────────────────────────────────────────── */}
            {profile.location && (
                <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.85rem" }} aria-hidden="true">◉</span>
                    <span style={{ color: "var(--fg-2)", fontSize: "0.8rem" }}>{profile.location}</span>
                </div>
            )}

            {/* ── Links ───────────────────────────────────────────── */}
            {hasLinks && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                    {profile.github && (
                        <LinkIcon href={`https://github.com/${profile.github}`} label="GitHub" icon="⌥" />
                    )}
                    {profile.twitter && (
                        <LinkIcon href={`https://x.com/${profile.twitter}`} label="X / Twitter" icon="𝕏" />
                    )}
                    {profile.website && (
                        <LinkIcon href={profile.website} label="Website" icon="↗" />
                    )}
                </div>
            )}

            {/* ── Skills ──────────────────────────────────────────── */}
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
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {profile.skills.map((skill) => (
                            <SkillChip key={skill} skill={skill} />
                        ))}
                    </div>
                </section>
            )}

            {/* ── Projects ────────────────────────────────────────── */}
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
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {profile.projects.map((project) => (
                            <ProjectCard key={project.name} project={project} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
