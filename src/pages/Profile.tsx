/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTezos } from "../context/TezosContext";
import { getDomainRecord } from "../lib/domains";
import { useProfileEdit, ProfileEditFormBody } from "../components/ProfileEditForm";
import type { DomainRecord } from "../lib/domains";
import type { HackProfile, ProjectEntry, BuilderStatus } from "../types/profile";
import { ipfsUriToGatewayUrl } from "../lib/pin";
import config from "../config/tezos";
import { useTedContracts } from "../hooks/useTedContracts";
import { Hackatar } from "../components/Hackatar";
import { Globe } from "lucide-react";
import { SiGithub, SiX } from "@icons-pack/react-simple-icons";

// ── Helpers ──────────────────────────────────────────────────────────

/** Only allow https:// and ipfs:// URLs in rendered links — blocks javascript:, data:, etc. */
function safeHref(url: string | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("https://") || url.startsWith("ipfs://")) return url;
    return null;
}

function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function resolveAvatarUrl(profile: HackProfile, gravatar: string | null, label: string): { type: "image"; url: string } | { type: "hackatar"; label: string } {
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
    // Server resolves label → opHash → deterministic hackatar
    return { type: "hackatar", label };
}

const STATUS_STYLES: Record<BuilderStatus, { bg: string; color: string; label: string }> = {
    building: { bg: "var(--info-bg)", color: "var(--info)", label: "Building" },
    "open-to-collab": { bg: "var(--ok-bg)", color: "var(--ok)", label: "Open to Collab" },
    available: { bg: "var(--warn-bg)", color: "var(--warn)", label: "Available" },
    hiring: { bg: "var(--purple-bg)", color: "var(--purple)", label: "Hiring" },
};

const ENV_STYLES: Record<string, { bg: string; color: string }> = {
    tezos: { bg: "var(--info-bg)", color: "var(--info)" },
    etherlink: { bg: "var(--purple-bg)", color: "var(--purple)" },
    tezlink: { bg: "var(--ok-bg)", color: "var(--ok)" },
    web: { bg: "var(--warn-bg)", color: "var(--warn)" },
    other: { bg: "rgba(148,163,184,0.12)", color: "var(--fg-3)" },
};

const PROJECT_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    live: { bg: "var(--ok-bg)", color: "var(--ok)" },
    wip: { bg: "var(--warn-bg)", color: "var(--warn)" },
    archived: { bg: "rgba(148,163,184,0.15)", color: "var(--fg-3)" },
    "open-source": { bg: "var(--purple-bg)", color: "var(--purple)" },
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
            <span style={{ fontSize: "0.65rem", opacity: 0.5 }}>{copied ? "✓" : "⧉"}</span>
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
        <button
            type="button"
            onClick={handleCopy}
            title={`Copy: ${name}`}
            style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
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
            <span style={{ fontSize: "0.65rem", color: "var(--fg-3)", opacity: 0.4 }}>
                {copied ? "✓" : "⧉"}
            </span>
        </button>
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
    const logoUrl = project.logo
        ? (project.logo.startsWith("ipfs://") ? ipfsUriToGatewayUrl(project.logo) : safeHref(project.logo))
        : null;

    return (
        <div
            style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "1.25rem",
                display: "flex",
                gap: "1rem",
            }}
        >
            {logoUrl && (
                <img
                    src={logoUrl}
                    alt={`${project.name} logo`}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: "6px",
                        objectFit: "cover",
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                    }}
                />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1, minWidth: 0 }}>
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
                    {safeHref(project.url) && (
                        <a
                            href={safeHref(project.url)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--ok)", textDecoration: "none" }}
                        >
                            ↗ Website
                        </a>
                    )}
                    {safeHref(project.repo) && (
                        <a
                            href={safeHref(project.repo)!}
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
        </div>
    );
}

function LinkIcon({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
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
    const tedContracts = useTedContracts();
    const [record, setRecord] = useState<DomainRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const hasLoaded = useRef(false);

    const label = subdomain ?? "";
    const fullName = `${label}.hack.${config.tld}`;

    const handleRefresh = useCallback(() => {
        setRefreshKey((k) => k + 1);
    }, []);

    const editState = useProfileEdit(label, fullName, record, handleRefresh);

    useEffect(() => {
        if (!label) {
            setNotFound(true);
            setLoading(false);
            return;
        }
        let cancelled = false;
        if (!hasLoaded.current) setLoading(true);
        setNotFound(false);

        getDomainRecord(fullName).then((result) => {
            if (cancelled) return;
            if (result === null) {
                setNotFound(true);
            } else {
                setRecord(result);
                hasLoaded.current = true;
            }
            setLoading(false);
        }).catch(() => {
            if (!cancelled) {
                setNotFound(true);
                setLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [label, fullName, refreshKey]);

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
        <>
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
                    <Hackatar label={avatar.label} size={96} animated />
                )}

                <CopyableDomain name={fullName} />

                {displayName !== label && (
                    <span style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.8rem",
                        color: "var(--fg-3)",
                        letterSpacing: "0.02em",
                        marginTop: "-0.25rem",
                    }}>
                        {displayName}
                    </span>
                )}

                <CopyableAddress address={owner} />

                {profile.status && (
                    <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: STATUS_STYLES[profile.status].color,
                        letterSpacing: "0.02em",
                        opacity: 0.8,
                    }}>
                        {"// "}{STATUS_STYLES[profile.status].label.toLowerCase()}
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
            {editState.editing && (
                <ProfileEditFormBody state={editState} />
            )}

            {/* ── View Mode ───────────────────────────────────────── */}
            {!editState.editing && (
                <>
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
                            <p style={{ color: "var(--fg)", fontSize: "0.9rem", lineHeight: 1.6 }}>{profile.bio}</p>
                        </section>
                    )}

                    {/* ── Location ───────────────────────────────────── */}
                    {profile.location && (
                        <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span style={{ fontSize: "0.85rem" }} aria-hidden="true">◉</span>
                            <span style={{ color: "var(--fg-2)", fontSize: "0.8rem" }}>{profile.location}</span>
                        </div>
                    )}

                    {/* ── Links ──────────────────────────────────────── */}
                    {hasLinks && (
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                            {profile.github && (
                                <LinkIcon href={`https://github.com/${profile.github}`} label="GitHub" icon={<SiGithub size={14} />} />
                            )}
                            {profile.twitter && (
                                <LinkIcon href={`https://x.com/${profile.twitter}`} label="X / Twitter" icon={<SiX size={14} />} />
                            )}
                            {safeHref(profile.website) && (
                                <LinkIcon href={safeHref(profile.website)!} label="Website" icon={<Globe size={14} />} />
                            )}
                        </div>
                    )}

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
                            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
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
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                {profile.projects.map((project) => (
                                    <ProjectCard key={project.name} project={project} />
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
