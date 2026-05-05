import { useState } from "react";
import { ExternalLink, Pencil, Eye, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { SiGithub, SiX } from "@icons-pack/react-simple-icons";
import config from "../config/tezos";
import type { SubdomainRecord } from "../lib/domains";
import type { BuilderStatus } from "../types/profile";
import { Hackatar } from "./Hackatar";
import SubdomainManager from "./SubdomainManager";

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
        return `https://ipfs.porcupin.xyz/ipfs/${cid}`;
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
                className="domain-tile-avatar"
            />
        );
    }

    return <Hackatar label={label} size={64} playing={playing} />;
}

function StatusBadge({ status }: { status: BuilderStatus }) {
    const s = STATUS_STYLES[status];
    return (
        <span
            className="domain-tile-status"
            style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}` }}
        >
            {s.label}
        </span>
    );
}

// ── DomainTile ───────────────────────────────────────────────────────

export default function DomainTile({ domain, onMutate }: { domain: SubdomainRecord; onMutate: () => void }) {
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
        <div className="domain-tile">
            {/* Header: avatar + name */}
            <div className="domain-tile-header">
                <Avatar picture={profile.picture} label={label} />
                <div className="domain-tile-identity">
                    <div className="domain-tile-name">{displayName}</div>
                    <div className="domain-tile-fqdn">{domain.name}</div>
                </div>
            </div>

            {/* Status + projects */}
            {(profile.status || projectCount > 0) && (
                <div className="domain-tile-meta">
                    {profile.status && <StatusBadge status={profile.status} />}
                    {projectCount > 0 && (
                        <span className="domain-tile-projects">
                            {projectCount} project{projectCount !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            )}

            {/* Bio */}
            {bio && <p className="domain-tile-bio">{bio}</p>}

            {/* Skills */}
            {visibleSkills.length > 0 && (
                <div className="domain-tile-skills">
                    {visibleSkills.map((s) => (
                        <span key={s} className="domain-tile-skill">{s}</span>
                    ))}
                    {moreCount > 0 && (
                        <span className="domain-tile-skill-more">+{moreCount} more</span>
                    )}
                </div>
            )}

            {/* Social links */}
            {(profile.github || profile.twitter || profile.website) && (
                <div className="domain-tile-socials">
                    {profile.github && (
                        <a
                            href={`https://github.com/${profile.github}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`@${profile.github} on GitHub`}
                            className="domain-tile-social"
                        >
                            <SiGithub size={16} />
                        </a>
                    )}
                    {profile.twitter && (
                        <a
                            href={`https://x.com/${profile.twitter}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`@${profile.twitter} on X`}
                            className="domain-tile-social"
                        >
                            <SiX size={16} />
                        </a>
                    )}
                    {safeHref(profile.website) && (
                        <a
                            href={safeHref(profile.website)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={profile.website ?? "Website"}
                            className="domain-tile-social"
                        >
                            <Globe size={16} />
                        </a>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="domain-tile-actions">
                <a href={`/u/${label}`} className="btn btn-ghost btn-sm domain-tile-action">
                    <Eye size={14} aria-hidden="true" /> View
                </a>
                <a href={`/u/${label}?edit=true`} className="btn btn-ghost btn-sm domain-tile-action">
                    <Pencil size={14} aria-hidden="true" /> Edit
                </a>
                <a
                    href={`${TED_APP_URL}/domain/${domain.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm domain-tile-action"
                    aria-label={`Manage ${domain.name} on Tezos Domains`}
                >
                    TED <ExternalLink size={14} aria-hidden="true" />
                </a>
            </div>

            {/* Expandable sub-subdomains */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="btn btn-ghost btn-sm domain-tile-expand"
            >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Sub-subdomains
            </button>
            {expanded && <SubdomainManager domain={domain} onMutate={onMutate} />}
        </div>
    );
}
