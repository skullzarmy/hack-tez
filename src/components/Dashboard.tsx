import { useState, useCallback } from "react";
import { ArrowRight, ExternalLink, Pencil, Eye, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { SiGithub, SiX } from "@icons-pack/react-simple-icons";
import { useTezos } from "../context/TezosContext";
import { useOnboarding } from "../context/OnboardingContext";
import { useSubdomains } from "../hooks/useSubdomains";
import config from "../config/tezos";
import type { SubdomainRecord } from "../lib/domains";
import type { BuilderStatus } from "../types/profile";
import { Hackatar } from "./Hackatar";
import SubdomainManager from "./SubdomainManager";
import PushSubscribeButton from "./PushSubscribeButton";
import ProfileHint from "./onboarding/ProfileHint";
import PushHint from "./onboarding/PushHint";

const TED_APP_URL = config.tedAppUrl;

// ── Helpers ──────────────────────────────────────────────────────────

function safeHref(url: string | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("https://") || url.startsWith("ipfs://")) return url;
    return null;
}

function resolveAvatarUrl(picture: string | undefined): string | null {
    if (!picture) return null;
    if (picture.startsWith("ipfs://")) {
        const cid = picture.replace("ipfs://", "");
        return `https://ipfs.fileship.xyz/ipfs/${cid}`;
    }
    if (picture.startsWith("https://")) return picture;
    return null;
}

const STATUS_STYLES: Record<BuilderStatus, { color: string; bg: string; label: string }> = {
    building: { color: "var(--info)", bg: "var(--info-bg)", label: "building" },
    "open-to-collab": { color: "var(--ok)", bg: "var(--ok-bg)", label: "open to collab" },
    available: { color: "var(--warn)", bg: "var(--warn-bg)", label: "available" },
    hiring: { color: "var(--purple)", bg: "var(--purple-bg)", label: "hiring" },
};

// ── Sub-components ───────────────────────────────────────────────────

function Avatar({ picture, label, playing }: { picture?: string; label: string; playing?: boolean }) {
    const [imgFailed, setImgFailed] = useState(false);
    const url = resolveAvatarUrl(picture);

    if (url && !imgFailed) {
        return (
            <img
                src={url}
                alt=""
                onError={() => setImgFailed(true)}
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                    border: "1px solid var(--border)",
                }}
            />
        );
    }

    return <Hackatar label={label} size={56} playing={playing} />;
}

function StatusBadge({ status }: { status: BuilderStatus }) {
    const s = STATUS_STYLES[status];
    return (
        <span
            style={{
                fontFamily: "var(--font)",
                fontSize: "0.6rem",
                letterSpacing: "0.06em",
                padding: "0.15em 0.5em",
                color: s.color,
                background: s.bg,
                border: `1px solid ${s.color}`,
                whiteSpace: "nowrap",
            }}
        >
            {s.label}
        </span>
    );
}

function DomainTile({ domain, onMutate }: { domain: SubdomainRecord; onMutate: () => void }) {
    const [hover, setHover] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const label = domain.name.replace(`.hack.${config.tld}`, "");
    const { profile } = domain;
    const displayName = profile.name || profile.nickname || label;

    const bio = profile.bio
        ? profile.bio.length > 100
            ? `${profile.bio.slice(0, 100)}…`
            : profile.bio
        : null;

    const skills = profile.skills ?? [];
    const visibleSkills = skills.slice(0, 4);
    const moreCount = skills.length - visibleSkills.length;
    const projectCount = profile.projects?.length ?? 0;

    return (
        <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                border: `1px solid ${hover ? "var(--accent, #00ffc8)" : "var(--border)"}`,
                background: "var(--bg-card, var(--bg-3))",
                transition: "border-color 0.15s, background 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                padding: "1.25rem",
            }}
        >
            {/* Header: avatar + name */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Avatar picture={profile.picture} label={label} playing={hover} />
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                        style={{
                            fontFamily: "var(--font)",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            letterSpacing: "-0.02em",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {displayName}
                    </div>
                    <div
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.65rem",
                            color: "var(--fg-3)",
                            letterSpacing: "0.04em",
                            marginTop: "0.1rem",
                        }}
                    >
                        {domain.name}
                    </div>
                </div>
            </div>

            {/* Status + projects */}
            {(profile.status || projectCount > 0) && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    {profile.status && <StatusBadge status={profile.status} />}
                    {projectCount > 0 && (
                        <span
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.6rem",
                                color: "var(--fg-3)",
                                letterSpacing: "0.06em",
                            }}
                        >
                            {projectCount} project{projectCount !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            )}

            {/* Bio */}
            {bio && (
                <p
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.7rem",
                        color: "var(--fg-2)",
                        lineHeight: 1.6,
                        margin: 0,
                    }}
                >
                    {bio}
                </p>
            )}

            {/* Skills */}
            {visibleSkills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {visibleSkills.map((s) => (
                        <span
                            key={s}
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.6rem",
                                padding: "0.25rem 0.5rem",
                                border: "1px solid var(--border)",
                                background: "var(--bg)",
                                color: "var(--fg-3)",
                                letterSpacing: "0.04em",
                            }}
                        >
                            {s}
                        </span>
                    ))}
                    {moreCount > 0 && (
                        <span
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.6rem",
                                color: "var(--fg-3)",
                                alignSelf: "center",
                            }}
                        >
                            +{moreCount} more
                        </span>
                    )}
                </div>
            )}

            {/* Social links */}
            {(profile.github || profile.twitter || profile.website) && (
                <div style={{ display: "flex", gap: "0.75rem" }}>
                    {profile.github && (
                        <a
                            href={`https://github.com/${profile.github}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`@${profile.github} on GitHub`}
                            style={{ color: "var(--fg-3)", display: "inline-flex", alignItems: "center", padding: "0.25rem" }}
                        >
                            <SiGithub size={12} />
                        </a>
                    )}
                    {profile.twitter && (
                        <a
                            href={`https://x.com/${profile.twitter}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`@${profile.twitter} on X`}
                            style={{ color: "var(--fg-3)", display: "inline-flex", alignItems: "center", padding: "0.25rem" }}
                        >
                            <SiX size={12} />
                        </a>
                    )}
                    {safeHref(profile.website) && (
                        <a
                            href={safeHref(profile.website)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={profile.website ?? "Website"}
                            style={{ color: "var(--fg-3)", display: "inline-flex", alignItems: "center", padding: "0.25rem" }}
                        >
                            <Globe size={12} />
                        </a>
                    )}
                </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "auto", paddingTop: "0.25rem" }}>
                <a
                    href={`/u/${label}`}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                >
                    <Eye size={12} aria-hidden="true" /> View
                </a>
                <a
                    href={`/u/${label}?edit=true`}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                >
                    <Pencil size={12} aria-hidden="true" /> Edit
                </a>
                <a
                    href={`${TED_APP_URL}/domain/${domain.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    aria-label={`Manage ${domain.name} on Tezos Domains`}
                >
                    TED <ExternalLink size={12} aria-hidden="true" />
                </a>
            </div>

            {/* Expandable sub-subdomains */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="btn btn-ghost btn-sm"
                style={{
                    fontSize: "0.65rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    alignSelf: "flex-start",
                    color: "var(--fg-3)",
                }}
            >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Sub-subdomains
            </button>
            {expanded && <SubdomainManager domain={domain} onMutate={onMutate} />}
        </div>
    );
}

export default function Dashboard() {
    const { address } = useTezos();
    const { step: onboardingStep } = useOnboarding();
    const { subdomains, loading, error, refresh } = useSubdomains(address);
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
    }, [refresh]);

    // Only show direct hack.tez subdomains (level 3), not sub-subdomains
    const topLevel = subdomains.filter((d) => d.name.split(".").length === 3);

    if (!address) {
        return (
            <div
                style={{
                    textAlign: "center",
                    padding: "4rem 1rem",
                    fontFamily: "var(--font)",
                    color: "var(--fg-2)",
                    fontSize: "0.85rem",
                }}
                role="status"
            >
                Connect your wallet to view your subdomains.
            </div>
        );
    }

    if (loading) {
        return (
            <div
                style={{
                    textAlign: "center",
                    padding: "4rem 1rem",
                    fontFamily: "var(--font)",
                    color: "var(--fg-3)",
                    fontSize: "0.8rem",
                }}
                role="status"
                aria-live="polite"
            >
                Loading…
            </div>
        );
    }

    if (error) {
        return (
            <div className="status-panel status-panel--err" role="alert">
                Error: {error}
            </div>
        );
    }

    return (
        <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
            <header style={{ marginBottom: "2rem" }}>
                <h1
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "clamp(1.4rem, 4vw, 2rem)",
                        letterSpacing: "-0.02em",
                        marginBottom: "0.5rem",
                    }}
                >
                    // MANAGE
                </h1>
                <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem" }}>
                    Your domains, profiles, and subdomains.
                </p>
            </header>
            <div
                style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "2rem" }}
            >
                <p
                    className="text-subtle"
                    style={{ fontFamily: "var(--font)", fontSize: "0.7rem", letterSpacing: "0.06em" }}
                >
                    You own your subdomains on Tezos Domains. Manage them directly on TED.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <PushSubscribeButton />
                        {onboardingStep === "push" && <PushHint />}
                    </div>
                    <button
                        onClick={() => void handleRefresh()}
                        className="btn btn-ghost btn-sm"
                        aria-label="Refresh subdomain list"
                        disabled={refreshing}
                        style={{ transition: "opacity 0.15s", opacity: refreshing ? 0.5 : 1 }}
                    >
                        <span style={{ display: "inline-block", animation: refreshing ? "spin 0.6s linear infinite" : "none" }}>↻</span> Refresh
                    </button>
                </div>
            </div>

            {onboardingStep === "profile" && topLevel.length > 0 && (
                <ProfileHint />
            )}

            {topLevel.length === 0 ? (
                <div
                    style={{
                        textAlign: "center",
                        padding: "3rem",
                        border: "1px solid var(--border-2)",
                        fontFamily: "var(--font)",
                        fontSize: "0.8rem",
                        color: "var(--fg-2)",
                    }}
                    role="status"
                >
                    <p style={{ marginBottom: "0.75rem" }}>No subdomains yet.</p>
                    <a href="/" className="btn btn-primary btn-sm">
                        Claim your name <ArrowRight size={14} aria-hidden="true" />
                    </a>
                </div>
            ) : (
                <div
                    role="list"
                    aria-label="Your subdomains"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                        gap: "1rem",
                    }}
                >
                    {topLevel.map((d) => (
                        <div key={d.name} role="listitem">
                            <DomainTile domain={d} onMutate={refresh} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
