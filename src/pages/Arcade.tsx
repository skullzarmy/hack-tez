/**
 * Arcade — main page with internal sub-routes:
 *   /arcade            → lobby
 *   /arcade/play/:slug → game player + leaderboard
 *   /arcade/submit     → submit form
 *   /arcade/my-games   → builder dashboard
 *   /arcade/admin      → admin moderation (gated)
 */

import { useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useTezos } from "../context/TezosContext";
import { Hackatar } from "../components/Hackatar";
import GameLobby from "../components/arcade/GameLobby";
import GameSubmit from "../components/arcade/GameSubmit";
import MyGames from "../components/arcade/MyGames";
import AdminReview from "../components/arcade/AdminReview";
import GamePlayer from "../components/arcade/GamePlayer";
import ArcadeLoader from "../components/arcade/ArcadeLoader";
import { flagArcadeGame, useArcadeGame } from "../hooks/useArcade";

const ADMIN_DOMAIN_GHOSTNET = "admin.hack.gho";
const ADMIN_DOMAIN_MAINNET = "admin.hack.tez";
const ADMIN_DOMAIN =
    import.meta.env.VITE_TEZOS_NETWORK === "mainnet" ? ADMIN_DOMAIN_MAINNET : ADMIN_DOMAIN_GHOSTNET;

export default function ArcadePage() {
    const { chatDomains } = useTezos();
    const isAdmin = chatDomains.includes(ADMIN_DOMAIN);

    return (
        <div style={{ minHeight: "100vh", padding: "16px 12px", maxWidth: 1100, margin: "0 auto" }}>
            <NavBar isAdmin={isAdmin} />
            <Routes>
                <Route index element={<GameLobby />} />
                <Route path="play/:slug" element={<PlayRoute />} />
                <Route path="submit" element={<GameSubmit />} />
                <Route path="my-games" element={<MyGames />} />
                {isAdmin && <Route path="admin" element={<AdminReview />} />}
                <Route path="*" element={<Navigate to="/arcade" replace />} />
            </Routes>
        </div>
    );
}

function NavBar({ isAdmin }: { isAdmin: boolean }) {
    return (
        <nav
            style={{
                display: "flex",
                gap: 16,
                marginBottom: 16,
                fontFamily: "ui-monospace,monospace",
                color: "#aafff0",
                fontSize: 13,
                flexWrap: "wrap",
            }}
        >
            <Link to="/arcade" style={navLink}>
                Lobby
            </Link>
            <Link to="/arcade/submit" style={navLink}>
                Submit
            </Link>
            <Link to="/arcade/my-games" style={navLink}>
                My games
            </Link>
            {isAdmin && (
                <Link to="/arcade/admin" style={navLink}>
                    Admin
                </Link>
            )}
        </nav>
    );
}

function PlayRoute() {
    const { slug } = useParams();
    const nav = useNavigate();
    const { activeDomain, address } = useTezos();
    const { data, loading, error } = useArcadeGame(slug);
    const [showFlag, setShowFlag] = useState(false);
    const [flagReason, setFlagReason] = useState("");
    const [flagDone, setFlagDone] = useState(false);
    const [flagError, setFlagError] = useState<string | null>(null);

    if (loading && !data) return <ArcadeLoader message="LOADING GAME…" />;
    if (error || !data?.game)
        return (
            <div style={{ padding: 16, color: "#ff6b6b" }}>
                {error || "Not found"}{" "}
                <button style={btn} onClick={() => nav("/arcade")}>
                    Back
                </button>
            </div>
        );

    const game = data.game;

    async function onFlag() {
        if (!slug) return;
        setFlagError(null);
        try {
            await flagArcadeGame(slug, flagReason);
            setFlagDone(true);
        } catch (e) {
            setFlagError(e instanceof Error ? e.message : "Flag failed");
        }
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                        <h2 style={{ margin: 0, color: "#fff" }}>{game.title}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                            <Hackatar label={game.builder.label} size={20} />
                            <span style={{ fontSize: 13 }}>by {game.builder.domain}</span>
                        </div>
                    </div>
                    <div>
                        {address && !flagDone && (
                            <button style={btn} onClick={() => setShowFlag((s) => !s)}>
                                {showFlag ? "Cancel" : "Report"}
                            </button>
                        )}
                        {flagDone && <span style={{ color: "#ffe66d" }}>Reported</span>}
                    </div>
                </div>
                {showFlag && !flagDone && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        <input
                            style={inp}
                            value={flagReason}
                            onChange={(e) => setFlagReason(e.target.value)}
                            placeholder="Why is this game inappropriate?"
                        />
                        <button style={btn} disabled={!flagReason} onClick={() => void onFlag()}>
                            Submit
                        </button>
                    </div>
                )}
                {flagError && <div style={{ color: "#ff6b6b", marginTop: 4 }}>{flagError}</div>}
                <p style={{ opacity: 0.8, fontSize: 13 }}>{game.description}</p>
            </div>

            <Leaderboard board={data.leaderboard} />
        </div>
    );
}

function Leaderboard({
    board,
}: {
    board: Array<{ domain: string; label: string; score: number; lastPlayed: string }>;
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
            <h3 style={{ marginTop: 0 }}>Leaderboard</h3>
            {!board.length && <div style={{ opacity: 0.6 }}>No scores yet — be the first!</div>}
            {board.map((row, i) => (
                <div
                    key={`${row.domain}-${i}`}
                    style={{
                        display: "grid",
                        gridTemplateColumns: "30px auto 1fr auto",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 0",
                        borderTop: i ? "1px solid rgba(0,255,170,0.1)" : "none",
                    }}
                >
                    <span style={{ color: "#ffe66d" }}>#{i + 1}</span>
                    <Hackatar label={row.label} size={20} />
                    <a href={`/u/${encodeURIComponent(row.label)}`} style={{ color: "#aafff0" }}>
                        {row.domain}
                    </a>
                    <strong style={{ color: "#fff" }}>{row.score.toLocaleString()}</strong>
                </div>
            ))}
        </div>
    );
}

const navLink: React.CSSProperties = {
    color: "#aafff0",
    textDecoration: "none",
    padding: "6px 10px",
    border: "1px solid rgba(0,255,170,0.3)",
    borderRadius: 4,
};
const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.6)",
    color: "#aafff0",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
};
const inp: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(0,255,170,0.3)",
    borderRadius: 4,
    padding: "6px 8px",
    color: "#fff",
    fontFamily: "ui-monospace,monospace",
    flex: 1,
};
