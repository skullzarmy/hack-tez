/**
 * Arcade — main page shell.
 *   /arcade            → lobby
 *   /arcade/play/:slug → player + leaderboard + report
 *   /arcade/submit     → submit form
 *   /arcade/my-games   → builder dashboard
 *   /arcade/admin      → moderation (gated)
 */

import { lazy, Suspense, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { useTezos } from "../context/TezosContext";
import ArcadeAvatar from "../components/arcade/ArcadeAvatar";
import GameLobby from "../components/arcade/GameLobby";
import GameSubmit from "../components/arcade/GameSubmit";
import MyGames from "../components/arcade/MyGames";
import AdminReview from "../components/arcade/AdminReview";
import GamePlayer from "../components/arcade/GamePlayer";
import ArcadeLoader from "../components/arcade/ArcadeLoader";
import ConfirmAction from "../components/arcade/ui/ConfirmAction";
import {
    flagArcadeGame,
    gameCoverUrl,
    useArcadeFlagged,
    useArcadeGame,
    useArcadePending,
    useArcadePendingUpdates,
} from "../hooks/useArcade";

const SITE_URL = (import.meta.env?.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") || "https://hacktez.com";

function absUrl(p: string): string {
    if (!p) return p;
    if (/^https?:\/\//i.test(p)) return p;
    return `${SITE_URL}${p.startsWith("/") ? p : `/${p}`}`;
}

const Sandbox = lazy(() => import("../components/arcade/Sandbox"));

export default function ArcadePage() {
    const { isAdmin } = useTezos();

    return (
        <div style={{ minHeight: "100vh", padding: "16px 12px", maxWidth: 1100, margin: "0 auto" }}>
            <header style={{ marginBottom: "1rem" }}>
                <h1
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "clamp(1.4rem, 4vw, 2rem)",
                        letterSpacing: "-0.02em",
                        margin: 0,
                        marginBottom: "0.25rem",
                    }}
                >
                    // HACKCADE
                </h1>
                <p style={{ color: "var(--fg-3)", fontSize: "0.9rem", margin: 0 }}>
                    Build it. Ship it. Play it.
                </p>
            </header>
            <NavBar isAdmin={isAdmin} />
            <Routes>
                <Route index element={<GameLobby />} />
                <Route path="play/:slug" element={<PlayRoute />} />
                <Route path="submit" element={<GameSubmit />} />
                <Route path="sandbox" element={
                    <Suspense fallback={<ArcadeLoader message="LOADING SANDBOX…" />}>
                        <Sandbox />
                    </Suspense>
                } />
                <Route path="my-games" element={<MyGames />} />
                {isAdmin && <Route path="admin" element={<AdminReview />} />}
                <Route path="*" element={<Navigate to="/arcade" replace />} />
            </Routes>
        </div>
    );
}

function NavBar({ isAdmin }: { isAdmin: boolean }) {
    // Admin badge: pull counts only when admin, only the totals matter here.
    const pending = useArcadePending(isAdmin);
    const updates = useArcadePendingUpdates(isAdmin);
    const flagged = useArcadeFlagged(isAdmin);
    const adminCount =
        (pending.data?.pending?.length ?? 0) +
        (updates.data?.pendingUpdates?.length ?? 0) +
        (flagged.data?.flagged?.length ?? 0);

    return (
        <nav className="arcade-tablist" style={{ marginBottom: 16 }}>
            <NavTab to="/arcade" label="Lobby" end />
            <NavTab to="/arcade/submit" label="Submit" />
            <NavTab to="/arcade/my-games" label="My games" />
            {isAdmin && <NavTab to="/arcade/admin" label="Admin" badge={adminCount} />}
        </nav>
    );
}

function NavTab({ to, label, end, badge }: { to: string; label: string; end?: boolean; badge?: number }) {
    return (
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) =>
                `arcade-tab arcade-tab--md${isActive ? " arcade-tab--active" : ""}`
            }
        >
            <span>{label}</span>
            {!!badge && badge > 0 && (
                <span className="arcade-tab__badge">{badge > 99 ? "99+" : badge}</span>
            )}
        </NavLink>
    );
}

function PlayRoute() {
    const { slug } = useParams();
    const nav = useNavigate();
    const { activeDomain, address } = useTezos();
    const { data, loading, error } = useArcadeGame(slug);
    const [flagOpen, setFlagOpen] = useState(false);
    const [flagDone, setFlagDone] = useState(false);

    const game = data?.game ?? null;
    const coverUrl = game ? gameCoverUrl(game.coverKey) : null;
    const pageImage = coverUrl ?? "/arcade-og.png";

    const playStructuredData = useMemo(() => {
        if (!game) return undefined;
        const url = `${SITE_URL}/arcade/play/${encodeURIComponent(slug ?? game.slug)}`;
        const breadcrumb = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "hack.tez", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "Hackcade", item: `${SITE_URL}/arcade` },
                { "@type": "ListItem", position: 3, name: game.title, item: url },
            ],
        };
        const videoGame: Record<string, unknown> = {
            "@context": "https://schema.org",
            "@type": "VideoGame",
            name: game.title,
            description: game.description || `Play ${game.title} on the hack.tez Hackcade.`,
            url,
            image: absUrl(coverUrl ?? "/arcade-og.png"),
            genre: game.category,
            applicationCategory: "GameApplication",
            operatingSystem: "Web",
            playMode: "SinglePlayer",
            gamePlatform: "Web browser",
            datePublished: game.createdAt,
            dateModified: game.updatedAt,
            author: {
                "@type": "Person",
                name: game.builder.domain,
                url: `${SITE_URL}/u/${encodeURIComponent(game.builder.label)}`,
            },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        };
        if (game.playCount > 0) {
            videoGame.interactionStatistic = {
                "@type": "InteractionCounter",
                interactionType: { "@type": "PlayAction" },
                userInteractionCount: game.playCount,
            };
        }
        return [breadcrumb, videoGame];
    }, [game, slug, coverUrl]);

    usePageMeta(
        game
            ? {
                  title: `${game.title} — Hackcade — hack.tez`,
                  description: game.description || `Play ${game.title} on the hack.tez Hackcade — a community-built HTML5 game.`,
                  path: `/arcade/play/${slug}`,
                  image: pageImage,
                  imageAlt: `${game.title} — Hackcade cover art`,
                  structuredData: playStructuredData,
              }
            : null,
    );

    if (loading && !data) return <ArcadeLoader message="LOADING GAME…" />;
    if (error || !game)
        return (
            <div className="arcade-page" style={{ padding: 16, color: "var(--err)" }}>
                {error || "Not found"}{" "}
                <button className="arcade-btn arcade-btn--sm" onClick={() => nav("/arcade")}>
                    Back to lobby
                </button>
            </div>
        );

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <GamePlayer game={game} domain={activeDomain} address={address} onExit={() => nav("/arcade")} />

            <div className="arcade-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ margin: 0, color: "var(--fg)" }}>{game.title}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13 }}>
                            <ArcadeAvatar label={game.builder.label} size={20} />
                            <a
                                href={`/u/${encodeURIComponent(game.builder.label)}`}
                                className="arcade-link"
                            >
                                by {game.builder.domain}
                            </a>
                            <span style={{ color: "var(--fg-3)" }}>·</span>
                            <span style={{ color: "var(--fg-3)" }}>{game.category}</span>
                            <span style={{ color: "var(--fg-3)" }}>·</span>
                            <span style={{ color: "var(--fg-3)" }}>v{game.version}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {address &&
                            (flagDone ? (
                                <span style={{ color: "var(--warn)", fontSize: 12 }}>✓ Reported</span>
                            ) : (
                                <button
                                    className="arcade-btn arcade-btn--sm arcade-btn--warn"
                                    onClick={() => setFlagOpen(true)}
                                    title="Report this game"
                                >
                                    Report
                                </button>
                            ))}
                    </div>
                </div>
                {game.description && (
                    <p style={{ color: "var(--fg-2)", fontSize: 13, marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
                        {game.description}
                    </p>
                )}
            </div>

            <Leaderboard board={data?.leaderboard ?? []} myDomain={activeDomain} />

            <ConfirmAction
                open={flagOpen}
                onClose={() => setFlagOpen(false)}
                title="Report game"
                variant="warning"
                confirmLabel="Submit report"
                message={
                    <span>
                        Reports are reviewed by admins. Use this for inappropriate, broken, or stolen content — not as
                        feedback.
                    </span>
                }
                reason={{
                    required: true,
                    label: "What's wrong with this game?",
                    placeholder: "e.g. contains explicit content, doesn't load, copies an existing game…",
                    minLength: 8,
                }}
                onConfirm={async (reason) => {
                    if (!slug || !reason) return;
                    await flagArcadeGame(slug, reason);
                    setFlagDone(true);
                }}
            />
        </div>
    );
}

function Leaderboard({
    board,
    myDomain,
}: {
    board: Array<{ domain: string; label: string; score: number; lastPlayed: string }>;
    myDomain: string | null;
}) {
    return (
        <div className="arcade-card">
            <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14, letterSpacing: 1, color: "var(--fg)" }}>
                LEADERBOARD
            </h3>
            {!board.length && (
                <div style={{ color: "var(--fg-3)", fontSize: 13, padding: "12px 0" }}>
                    No scores yet — be the first to set one.
                </div>
            )}
            {board.map((row, i) => {
                const isMe = !!myDomain && row.domain === myDomain;
                return (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: leaderboard row keyed by domain; i is the rank shown beside it, not a fallback identity
                        key={`${row.domain}-${i}`}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "32px 24px 1fr auto",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 6px",
                            borderTop: i ? "1px solid var(--border)" : "none",
                            background: isMe ? "var(--warn-bg)" : "transparent",
                            borderRadius: 4,
                        }}
                    >
                        <span
                            style={{
                                color: i === 0 ? "var(--warn)" : "var(--fg-2)",
                                fontWeight: i === 0 ? 700 : 400,
                            }}
                        >
                            #{i + 1}
                        </span>
                        <ArcadeAvatar label={row.label} size={20} />
                        <a
                            href={`/u/${encodeURIComponent(row.label)}`}
                            style={{
                                color: isMe ? "var(--warn)" : "var(--accent)",
                                textDecoration: "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {row.domain}
                            {isMe && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--fg-3)" }}>(you)</span>}
                        </a>
                        <strong style={{ color: "var(--fg)" }}>{row.score.toLocaleString()}</strong>
                    </div>
                );
            })}
        </div>
    );
}
