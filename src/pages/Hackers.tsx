/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import config from "../config/tezos";
import { useHackerProfiles } from "../hooks/useHackerProfiles";
import type { HackerEntry } from "../hooks/useHackerProfiles";
import type { BuilderStatus } from "../types/profile";
import { Hackatar } from "../components/Hackatar";
import { Globe, ArrowLeft, ArrowRight } from "lucide-react";
import { SiGithub, SiX, SiBluesky } from "@icons-pack/react-simple-icons";
import { usePageMeta } from "../hooks/usePageMeta";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

// ── Constants ────────────────────────────────────────────────────────

/** Only allow https:// and ipfs:// in rendered links */
function safeHref(url: string | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("https://") || url.startsWith("ipfs://")) return url;
    return null;
}

const POLL_MS = 60_000;
const PAGE_SIZE = 24;
/** Divisible by every gallery column count (5 / 4 / 3 / 2) so pages fill whole rows */
const GALLERY_PAGE_SIZE = 60;

/**
 * Intrinsic tile size. CSS scales tiles to their grid column; this is the
 * width the image is laid out at before that, and keeps the pre-CSS/SSR
 * render from collapsing.
 */
const GALLERY_TILE_PX = 200;

type ViewMode = "cards" | "gallery";

const STATUS_STYLES: Record<BuilderStatus, { color: string; bg: string; label: string }> = {
    building: { color: "var(--info)", bg: "var(--info-bg)", label: "building" },
    "open-to-collab": { color: "var(--ok)", bg: "var(--ok-bg)", label: "open to collab" },
    available: { color: "var(--warn)", bg: "var(--warn-bg)", label: "available" },
    hiring: { color: "var(--purple)", bg: "var(--purple-bg)", label: "hiring" },
};

const ALL_STATUSES: BuilderStatus[] = ["building", "open-to-collab", "available", "hiring"];

// ── Avatar helpers ───────────────────────────────────────────────────

/** Hash a string to a deterministic hue (0–360) for fallback avatars */
function resolveAvatarUrl(picture: string | undefined): string | null {
    if (!picture) return null;
    if (picture.startsWith("ipfs://")) {
        const cid = picture.replace("ipfs://", "");
        return `https://ipfs.fileship.xyz/ipfs/${cid}`;
    }
    if (picture.startsWith("https://")) return picture;
    return null;
}

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

function SkillTag({
    skill,
    onClick,
}: {
    skill: string;
    onClick: (skill: string) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onClick(skill)}
            style={{
                position: "relative",
                zIndex: 1,
                fontFamily: "var(--font)",
                fontSize: "0.6rem",
                padding: "0.25rem 0.5rem",
                minHeight: "1.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--fg-3)",
                cursor: "pointer",
                letterSpacing: "0.04em",
                transition: "border-color 0.15s",
            }}
        >
            {skill}
        </button>
    );
}

function LinkIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            aria-label={label}
            style={{
                position: "relative",
                zIndex: 1,
                color: "var(--fg-3)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "1.5rem",
                minHeight: "1.5rem",
                padding: "0.25rem",
                transition: "color 0.15s",
                lineHeight: 1,
            }}
        >
            {children}
        </a>
    );
}

function HackerCard({
    hacker,
    onSkillClick,
}: {
    hacker: HackerEntry;
    onSkillClick: (skill: string) => void;
}) {
    const { label, name, owner, ownerShort, profile } = hacker;
    const [cardHover, setCardHover] = useState(false);
    const hasProfile = !!(profile.bio || profile.status || profile.skills?.length || profile.github || profile.twitter || profile.website);

    const bio = profile.bio
        ? profile.bio.length > 80
            ? `${profile.bio.slice(0, 80)}…`
            : profile.bio
        : null;

    const skills = profile.skills ?? [];
    const visibleSkills = skills.slice(0, 4);
    const moreCount = skills.length - visibleSkills.length;

    const projectCount = profile.projects?.length ?? 0;

    return (
        <div
            className="hacker-card"
            style={{
                position: "relative",
                border: "1px solid var(--border)",
                padding: "1.25rem",
                background: "var(--bg-card, var(--bg-3))",
                transition: "border-color 0.15s, background 0.15s",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
            }}
        >
            {/* Top row: avatar + name + status */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Avatar picture={profile.picture} label={label} playing={cardHover} />
                <div style={{ minWidth: 0, flex: 1 }}>
                    {/* Stretched link: covers the card via ::after so the whole
                        card is clickable — and hoverable — without nesting the
                        icon anchors inside another anchor. */}
                    <Link
                        className="hacker-card__link"
                        to={`/u/${label}`}
                        onMouseEnter={() => setCardHover(true)}
                        onMouseLeave={() => setCardHover(false)}
                        onFocus={() => setCardHover(true)}
                        onBlur={() => setCardHover(false)}
                        style={{
                            fontFamily: "var(--font)",
                            fontWeight: 700,
                            fontSize: "0.85rem",
                            letterSpacing: "-0.02em",
                            color: "inherit",
                            textDecoration: "none",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {name}
                    </Link>
                    {!hasProfile && (
                        <div
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.65rem",
                                color: "var(--fg-3)",
                                letterSpacing: "0.04em",
                                marginTop: "0.15rem",
                            }}
                            title={owner}
                        >
                            {ownerShort}
                        </div>
                    )}
                </div>
            </div>

            {/* Status + project count */}
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

            {/* Skill tags */}
            {visibleSkills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {visibleSkills.map((s) => (
                        <SkillTag key={s} skill={s} onClick={onSkillClick} />
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

            {/* Link icons — pushed to bottom */}
            {(profile.github || profile.twitter || profile.website) && (
                <div
                    style={{
                        display: "flex",
                        gap: "0.75rem",
                        marginTop: "auto",
                        paddingTop: "0.25rem",
                    }}
                >
                    {profile.github && (
                        <LinkIcon href={`https://github.com/${profile.github}`} label={`@${profile.github} on GitHub`}>
                            <SiGithub size={12} />
                        </LinkIcon>
                    )}
                    {profile.twitter && (
                        <LinkIcon href={`https://x.com/${profile.twitter}`} label={`@${profile.twitter} on X`}>
                            <SiX size={12} />
                        </LinkIcon>
                    )}
                    {safeHref(profile.website) && (
                        <LinkIcon href={safeHref(profile.website)!} label={profile.website ?? "Website"}>
                            <Globe size={12} />
                        </LinkIcon>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Gallery tile: a hackatar at full animation, with the member's name.
 *
 * Animation is gated on the tile actually being on screen — a full page of
 * tiles is a full page of animated GIFs, and only the visible ones are worth
 * fetching. Once a tile has been seen it stays animated, so scrolling back up
 * doesn't re-request anything.
 */
function HackatarTile({ hacker }: { hacker: HackerEntry }) {
    const { label, name } = hacker;
    const ref = useRef<HTMLAnchorElement | null>(null);
    const [seen, setSeen] = useState(false);
    const reducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        const el = ref.current;
        if (!el || seen) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setSeen(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "300px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [seen]);

    return (
        <Link ref={ref} className="hackatar-tile" to={`/u/${label}`}>
            <Hackatar
                label={label}
                size={GALLERY_TILE_PX}
                animated={seen && !reducedMotion}
                hoverAnimate={reducedMotion ? false : undefined}
                borderRadius="0"
            />
            <span className="hackatar-tile__name" title={name}>
                {name}
            </span>
        </Link>
    );
}

/** Terminal-style ASCII poll bar */
function PollOrb({
    lastUpdated,
    isLoading,
    onRefresh,
}: {
    lastUpdated: Date | null;
    isLoading: boolean;
    onRefresh: () => void;
}) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!lastUpdated) return;
        const tick = () => setProgress(Math.min((Date.now() - lastUpdated.getTime()) / POLL_MS, 1));
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [lastUpdated]);

    const BARS = 10;
    const filled = Math.round(progress * BARS);
    const bar = "█".repeat(filled) + "░".repeat(BARS - filled);

    return (
        <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh hackers list"
            title="click to refresh"
            style={{
                background: "none",
                border: "none",
                padding: "0.3rem 0.4rem",
                cursor: isLoading ? "default" : "pointer",
                fontFamily: "var(--font)",
                fontSize: "0.65rem",
                letterSpacing: "0.04em",
                color: "var(--ok)",
                opacity: isLoading ? 0.4 : 1,
                textShadow: "0 0 6px color-mix(in srgb, var(--ok) 40%, transparent)",
                minHeight: "24px",
                display: "inline-flex",
                alignItems: "center",
            }}
        >
            {isLoading ? <span className="poll-syncing">syncing_</span> : `[${bar}]`}
        </button>
    );
}

// ── Filter bar ───────────────────────────────────────────────────────

function FilterBar({
    query,
    onQueryChange,
    activeStatus,
    onStatusToggle,
    activeSkill,
    onSkillClear,
}: {
    query: string;
    onQueryChange: (q: string) => void;
    activeStatus: BuilderStatus | null;
    onStatusToggle: (s: BuilderStatus | null) => void;
    activeSkill: string | null;
    onSkillClear: () => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {/* Search input */}
            <input
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="search by name or bio…"
                aria-label="Search hackers"
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "0.75rem",
                    padding: "0.5rem 0.75rem",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                    width: "100%",
                    maxWidth: "24rem",
                    letterSpacing: "0.04em",
                }}
            />

            {/* Status filters */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                <span
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.6rem",
                        color: "var(--fg-3)",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        marginRight: "0.25rem",
                    }}
                >
                    status:
                </span>
                {ALL_STATUSES.map((s) => {
                    const st = STATUS_STYLES[s];
                    const active = activeStatus === s;
                    return (
                        <button
                            key={s}
                            type="button"
                            onClick={() => onStatusToggle(active ? null : s)}
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.6rem",
                                letterSpacing: "0.06em",
                                padding: "0.3rem 0.6rem",
                                minHeight: "1.5rem",
                                color: active ? st.color : "var(--fg-3)",
                                background: active ? st.bg : "transparent",
                                border: `1px solid ${active ? st.color : "var(--border)"}`,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {st.label}
                        </button>
                    );
                })}

                {/* Active skill filter chip */}
                {activeSkill && (
                    <button
                        type="button"
                        onClick={onSkillClear}
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.6rem",
                            letterSpacing: "0.04em",
                            padding: "0.15em 0.5em",
                            color: "var(--ok)",
                            background: "var(--ok-bg)",
                            border: "1px solid var(--ok)",
                            cursor: "pointer",
                            marginLeft: "0.5rem",
                            whiteSpace: "nowrap",
                        }}
                    >
                        skill: {activeSkill} ✕
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────

export default function Hackers() {
    usePageMeta({
        title: "Hackers — hack.tez",
        description:
            "Browse the directory of builders, artists, and tezonians on hack.tez. Filter by skill, status, and search across the on-chain Tezos hacker community.",
        path: "/hackers",
    });
    const { hackers, isLoading, refresh, lastUpdated } = useHackerProfiles();
    const [searchParams, setSearchParams] = useSearchParams();
    const [starterPackUrl, setStarterPackUrl] = useState<string | null>(null);
    const [listUrl, setListUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/v1/config")
            .then((r) => r.json())
            .then((body) => {
                if (cancelled) return;
                setStarterPackUrl(body?.data?.bskyStarterPackUrl ?? null);
                setListUrl(body?.data?.bskyListUrl ?? null);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const query = searchParams.get("q") ?? "";
    const activeStatus = (searchParams.get("status") as BuilderStatus | null) ?? null;
    const activeSkill = searchParams.get("skill") ?? null;
    const view: ViewMode = searchParams.get("view") === "gallery" ? "gallery" : "cards";
    const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const updateParam = useCallback(
        (key: string, value: string | null) => {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                if (value) {
                    next.set(key, value);
                } else {
                    next.delete(key);
                }
                next.delete("page");
                return next;
            }, { replace: true });
        },
        [setSearchParams],
    );

    const filtered = useMemo(() => {
        const q = query.toLowerCase();
        return hackers.filter((h) => {
            if (q && !h.name.toLowerCase().includes(q) && !(h.profile.bio?.toLowerCase().includes(q))) {
                return false;
            }
            if (activeStatus && h.profile.status !== activeStatus) return false;
            if (activeSkill && !(h.profile.skills?.some((s) => s.toLowerCase() === activeSkill.toLowerCase()))) {
                return false;
            }
            return true;
        });
    }, [hackers, query, activeStatus, activeSkill]);

    const pageSize = view === "gallery" ? GALLERY_PAGE_SIZE : PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = (safePage - 1) * pageSize;
    const pageSlice = filtered.slice(pageStart, pageStart + pageSize);

    const handleSkillClick = useCallback(
        (skill: string) => updateParam("skill", skill),
        [updateParam],
    );

    return (
        <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginBottom: "2rem",
                }}
            >
                <header>
                    <h1
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "clamp(1.4rem, 4vw, 2rem)",
                            letterSpacing: "-0.02em",
                            marginBottom: "0.5rem",
                        }}
                    >
                        // HACKERS
                    </h1>
                    <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem", marginBottom: (starterPackUrl || listUrl) ? "0.6rem" : 0 }}>Who's here.</p>
                    {(starterPackUrl || listUrl) && (
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.4rem 1rem",
                                alignItems: "center",
                                fontFamily: "var(--font)",
                                fontSize: "0.72rem",
                                letterSpacing: "0.02em",
                            }}
                        >
                            {starterPackUrl && (
                                <a
                                    href={starterPackUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.4rem",
                                        color: "var(--accent)",
                                        textDecoration: "none",
                                    }}
                                >
                                    <SiBluesky size={12} />
                                    Follow all on Bluesky <ArrowRight size={11} aria-hidden="true" />
                                </a>
                            )}
                            {listUrl && (
                                <a
                                    href={listUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.4rem",
                                        color: "var(--fg-2)",
                                        textDecoration: "none",
                                    }}
                                    title="Open the list on Bluesky and pin it to your home as a feed"
                                >
                                    <SiBluesky size={12} />
                                    Pin as a feed <ArrowRight size={11} aria-hidden="true" />
                                </a>
                            )}
                        </div>
                    )}
                </header>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        color: "var(--fg-3)",
                        letterSpacing: "0.06em",
                    }}
                >
                    <span>auto-refresh</span>
                    <PollOrb lastUpdated={lastUpdated} isLoading={isLoading} onRefresh={refresh} />
                </div>
            </div>

            {isLoading && hackers.length === 0 ? (
                <p className="section-body" style={{ color: "var(--fg-3)" }}>
                    Loading…
                </p>
            ) : hackers.length === 0 ? (
                <p className="section-body" style={{ color: "var(--fg-3)" }}>
                    No claims found.
                </p>
            ) : (
                <>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "0.75rem",
                            marginBottom: "1.5rem",
                        }}
                    >
                        <p className="section-body" style={{ margin: 0, color: "var(--fg-3)" }}>
                            {hackers.length} hacker{hackers.length !== 1 ? "s" : ""} on hack.{config.tld}
                        </p>
                        <div style={{ display: "flex" }}>
                            {(["cards", "gallery"] as ViewMode[]).map((v) => {
                                const active = view === v;
                                return (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => updateParam("view", v === "cards" ? null : v)}
                                        aria-pressed={active}
                                        style={{
                                            fontFamily: "var(--font)",
                                            fontSize: "0.6rem",
                                            letterSpacing: "0.08em",
                                            textTransform: "uppercase",
                                            padding: "0.35rem 0.7rem",
                                            color: active ? "var(--ok)" : "var(--fg-3)",
                                            background: active ? "var(--ok-bg)" : "transparent",
                                            border: `1px solid ${active ? "var(--ok)" : "var(--border)"}`,
                                            marginLeft: v === "cards" ? 0 : "-1px",
                                            cursor: "pointer",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        {v === "cards" ? "cards" : "hackatars"}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Filter bar */}
                    <FilterBar
                        query={query}
                        onQueryChange={(q) => updateParam("q", q || null)}
                        activeStatus={activeStatus}
                        onStatusToggle={(s) => updateParam("status", s)}
                        activeSkill={activeSkill}
                        onSkillClear={() => updateParam("skill", null)}
                    />

                    {/* Results count when filtered */}
                    {(query || activeStatus || activeSkill) && (
                        <p
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.65rem",
                                color: "var(--fg-3)",
                                marginBottom: "1rem",
                                letterSpacing: "0.04em",
                            }}
                        >
                            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                        </p>
                    )}

                    {/* Card grid */}
                    {pageSlice.length === 0 ? (
                        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.75rem" }}>
                            No matches.
                        </p>
                    ) : view === "gallery" ? (
                        <div className="hackatar-gallery">
                            {pageSlice.map((h) => (
                                <HackatarTile key={h.name} hacker={h} />
                            ))}
                        </div>
                    ) : (
                        <div
                            style={{
                                columns: "280px auto",
                                columnGap: "1rem",
                            }}
                        >
                            {pageSlice.map((h) => (
                                <div key={h.name} style={{ breakInside: "avoid", marginBottom: "1rem" }}>
                                    <HackerCard
                                        hacker={h}
                                        onSkillClick={handleSkillClick}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "1rem",
                                marginTop: "2rem",
                                fontFamily: "var(--font)",
                                fontSize: "0.7rem",
                                color: "var(--fg-3)",
                            }}
                        >
                            <button
                                type="button"
                                disabled={safePage <= 1}
                                onClick={() => {
                                    setSearchParams((prev) => {
                                        const next = new URLSearchParams(prev);
                                        next.set("page", String(safePage - 1));
                                        return next;
                                    }, { replace: true });
                                }}
                                style={{
                                    fontFamily: "var(--font)",
                                    fontSize: "0.7rem",
                                    background: "none",
                                    border: "1px solid var(--border)",
                                    color: safePage <= 1 ? "var(--fg-3)" : "var(--fg)",
                                    padding: "0.3rem 0.75rem",
                                    cursor: safePage <= 1 ? "default" : "pointer",
                                    opacity: safePage <= 1 ? 0.4 : 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35em",
                                }}
                            >
                                <ArrowLeft size={14} aria-hidden="true" /> prev
                            </button>
                            <span>
                                {safePage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={safePage >= totalPages}
                                onClick={() => {
                                    setSearchParams((prev) => {
                                        const next = new URLSearchParams(prev);
                                        next.set("page", String(safePage + 1));
                                        return next;
                                    }, { replace: true });
                                }}
                                style={{
                                    fontFamily: "var(--font)",
                                    fontSize: "0.7rem",
                                    background: "none",
                                    border: "1px solid var(--border)",
                                    color: safePage >= totalPages ? "var(--fg-3)" : "var(--fg)",
                                    padding: "0.3rem 0.75rem",
                                    cursor: safePage >= totalPages ? "default" : "pointer",
                                    opacity: safePage >= totalPages ? 0.4 : 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35em",
                                }}
                            >
                                next <ArrowRight size={14} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
