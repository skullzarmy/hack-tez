import { useNavigate } from "react-router-dom";
import { useArcadeGames, type ArcadeGame } from "../../hooks/useArcade";
import { Hackatar } from "../Hackatar";
import ArcadeLoader from "./ArcadeLoader";

export default function GameLobby() {
    const { data, loading, error } = useArcadeGames();
    const games = data?.games ?? [];

    if (loading && !games.length) return <ArcadeLoader message="LOADING ARCADE…" />;
    if (error) return <div style={{ color: "#ff6b6b", padding: 16 }}>Error: {error}</div>;

    return (
        <div style={{ padding: "0 8px" }}>
            <h1
                style={{
                    fontFamily: "ui-monospace,monospace",
                    color: "#aafff0",
                    margin: "0 0 16px",
                    letterSpacing: 2,
                    fontSize: 28,
                }}
            >
                HACKCADE
            </h1>
            {!games.length && (
                <div style={{ color: "#aafff0", opacity: 0.7, fontFamily: "ui-monospace,monospace" }}>
                    No games yet. Be the first to{" "}
                    <a href="/arcade/submit" style={{ color: "#ffe66d" }}>
                        submit one
                    </a>
                    .
                </div>
            )}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 16,
                }}
            >
                {games.map((g) => (
                    <GameCard key={g.slug} game={g} />
                ))}
            </div>
        </div>
    );
}

function GameCard({ game }: { game: ArcadeGame }) {
    const nav = useNavigate();
    return (
        <button
            onClick={() => nav(`/arcade/play/${encodeURIComponent(game.slug)}`)}
            style={{
                textAlign: "left",
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(0,255,170,0.25)",
                borderRadius: 8,
                padding: 12,
                cursor: "pointer",
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
                display: "flex",
                flexDirection: "column",
                gap: 8,
            }}
        >
            <div style={{ fontSize: 16, color: "#fff", fontWeight: 600 }}>{game.title}</div>
            <div style={{ opacity: 0.7, fontSize: 12, minHeight: 32 }}>
                {game.description?.slice(0, 80) || ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Hackatar label={game.builder.label} size={24} />
                <span style={{ fontSize: 12, opacity: 0.85 }}>by {game.builder.domain}</span>
            </div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    opacity: 0.6,
                    marginTop: 4,
                }}
            >
                <span>▶ {game.playCount.toLocaleString()}</span>
                <span>{game.category}</span>
            </div>
        </button>
    );
}
