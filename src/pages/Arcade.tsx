/**
 * Arcade — main page shell.
 *   /arcade            → lobby
 *   /arcade/play/:slug → player + leaderboard + report
 *   /arcade/submit     → submit form
 *   /arcade/my-games   → builder dashboard
 *   /arcade/admin      → moderation (gated)
 */

import { lazy, Suspense, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useTezos } from "../context/TezosContext";
import { Hackatar } from "../components/Hackatar";
import GameLobby from "../components/arcade/GameLobby";
import GameSubmit from "../components/arcade/GameSubmit";
import MyGames from "../components/arcade/MyGames";
import AdminReview from "../components/arcade/AdminReview";
import GamePlayer from "../components/arcade/GamePlayer";
import ArcadeLoader from "../components/arcade/ArcadeLoader";
import ConfirmAction from "../components/arcade/ui/ConfirmAction";
import {
    flagArcadeGame,
    useArcadeFlagged,
    useArcadeGame,
    useArcadePending,
    useArcadePendingUpdates,
} from "../hooks/useArcade";

const Sandbox = lazy(() => import("../components/arcade/Sandbox"));

export default function ArcadePage() {
    const { isAdmin } = useTezos();

    return (
        <div style={{ minHeight: "100vh", padding: "16px 12px", maxWidth: 1100, margin: "0 auto" }}>
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
        <nav
            style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 16,
                padding: 4,
                borderRadius: 8,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(0,255,170,0.18)",
                fontFamily: "ui-monospace,monospace",
                color: "#aafff0",
                fontSize: 12,
                flexWrap: "wrap",
            }}
        >
            <NavTab to="/arcade" label="Lobby" end />
            <NavTab to="/arcade/submit" label="Submit" />
            <NavTab to="/arcade/sandbox" label="Sandbox" />
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
            style={({ isActive }) => ({
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 6,
                background: isActive ? "rgba(0,255,170,0.14)" : "transparent",
                color: isActive ? "#7eff9f" : "#aafff0",
                textDecoration: "none",
                letterSpacing: 0.5,
                textTransform: "uppercase",
            })}
        >
            <span>{label}</span>
            {!!badge && badge > 0 && (
                <span
                    style={{
                        minWidth: 18,
                        padding: "0 5px",
                        height: 16,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        background: "#ffe66d",
                        color: "#0a0f0d",
                    }}
                >
                    {badge > 99 ? "99+" : badge}
                </span>
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

    if (loading && !data) return <ArcadeLoader message="LOADING GAME…" />;
    if (error || !data?.game)
        return (
            <div style={{ padding: 16, color: "#ff6b6b", fontFamily: "ui-monospace,monospace" }}>
                {error || "Not found"}{" "}
                <button style={btn} onClick={() => nav("/arcade")}>
                    Back to lobby
                </button>
            </div>
        );

    const game = data.game;

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <GamePlayer game={game} domain={activeDomain} address={address} onExit={() => nav("/arcade")} />

            <div
                style={{
                    background: "rgba(0,0,0,0.45)",
                    border: "1px solid rgba(0,255,170,0.25)",
                    borderRadius: 8,
                    padding: 16,
                    color: "#aafff0",
                    fontFamily: "ui-monospace,monospace",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ margin: 0, color: "#fff" }}>{game.title}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13 }}>
                            <Hackatar label={game.builder.label} size={20} />
                            <a
                                href={`/u/${encodeURIComponent(game.builder.label)}`}
                                style={{ color: "#aafff0", textDecoration: "none" }}
                            >
                                by {game.builder.domain}
                            </a>
                            <span style={{ opacity: 0.5 }}>·</span>
                            <span style={{ opacity: 0.7 }}>{game.category}</span>
                            <span style={{ opacity: 0.5 }}>·</span>
                            <span style={{ opacity: 0.7 }}>v{game.version}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {address &&
                            (flagDone ? (
                                <span style={{ color: "#ffe66d", fontSize: 12 }}>✓ Reported</span>
                            ) : (
                                <button style={btnSubtle} onClick={() => setFlagOpen(true)} title="Report this game">
                                    Report
                                </button>
                            ))}
                    </div>
                </div>
                {game.description && (
                    <p style={{ opacity: 0.85, fontSize: 13, marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
                        {game.description}
                    </p>
                )}
            </div>

            <Leaderboard board={data.leaderboard} myDomain={activeDomain} />

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
        <div
            style={{
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(0,255,170,0.25)",
                borderRadius: 8,
                padding: 16,
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
            }}
        >
            <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14, letterSpacing: 1 }}>LEADERBOARD</h3>
            {!board.length && (
                <div style={{ opacity: 0.6, fontSize: 13, padding: "12px 0" }}>
                    No scores yet — be the first to set one.
                </div>
            )}
            {board.map((row, i) => {
                const isMe = !!myDomain && row.domain === myDomain;
                return (
                    <div
                        key={`${row.domain}-${i}`}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "32px 24px 1fr auto",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 6px",
                            borderTop: i ? "1px solid rgba(0,255,170,0.08)" : "none",
                            background: isMe ? "rgba(255,230,109,0.06)" : "transparent",
                            borderRadius: 4,
                        }}
                    >
                        <span style={{ color: i === 0 ? "#ffe66d" : "#aafff0", fontWeight: i === 0 ? 700 : 400 }}>
                            #{i + 1}
                        </span>
                        <Hackatar label={row.label} size={20} />
                        <a
                            href={`/u/${encodeURIComponent(row.label)}`}
                            style={{
                                color: isMe ? "#ffe66d" : "#aafff0",
                                textDecoration: "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {row.domain}
                            {isMe && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>(you)</span>}
                        </a>
                        <strong style={{ color: "#fff" }}>{row.score.toLocaleString()}</strong>
                    </div>
                );
            })}
        </div>
    );
}

const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.6)",
    color: "#aafff0",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
};
const btnSubtle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(255,184,107,0.5)",
    color: "#ffb86b",
    padding: "5px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
    fontSize: 12,
};
