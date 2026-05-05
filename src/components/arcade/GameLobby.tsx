import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useArcadeGames, type ArcadeGame } from "../../hooks/useArcade";
import { Hackatar } from "../Hackatar";
import ArcadeLoader from "./ArcadeLoader";

const SORTS = [
    { id: "popular", label: "Most played" },
    { id: "newest", label: "Newest" },
    { id: "trending", label: "Trending" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

export default function GameLobby() {
    const { data, loading, error } = useArcadeGames();
    const games = data?.games ?? [];
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<string | null>(null);
    const [sort, setSort] = useState<SortId>("popular");

    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const g of games) if (g.category) set.add(g.category);
        return Array.from(set).sort();
    }, [games]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let list = games.filter((g) => {
            if (category && g.category !== category) return false;
            if (q && !`${g.title} ${g.description ?? ""} ${g.builder.domain}`.toLowerCase().includes(q)) return false;
            return true;
        });
        if (sort === "newest") {
            list = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        } else if (sort === "trending") {
            // Heuristic: plays per day since createdAt.
            const score = (g: ArcadeGame) => {
                const days = Math.max(1, (Date.now() - +new Date(g.createdAt)) / 86400_000);
                return g.playCount / days;
            };
            list = [...list].sort((a, b) => score(b) - score(a));
        } else {
            list = [...list].sort((a, b) => b.playCount - a.playCount);
        }
        return list;
    }, [games, search, category, sort]);

    if (loading && !games.length) return <ArcadeLoader message="LOADING ARCADE…" />;
    if (error)
        return (
            <div style={{ padding: 16, color: "#ff6b6b", fontFamily: "ui-monospace,monospace" }}>Error: {error}</div>
        );

    return (
        <div style={{ padding: "0 4px", color: "#aafff0", fontFamily: "ui-monospace,monospace" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <h1 style={{ margin: 0, letterSpacing: 2, fontSize: 28, color: "#aafff0" }}>HACKCADE</h1>
                <span style={{ fontSize: 12, opacity: 0.6 }}>
                    {filtered.length} of {games.length} {games.length === 1 ? "game" : "games"}
                </span>
            </div>

            {games.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search games or builders…"
                            style={{
                                flex: "1 1 220px",
                                background: "rgba(0,0,0,0.5)",
                                border: "1px solid rgba(0,255,170,0.3)",
                                borderRadius: 4,
                                padding: "8px 10px",
                                color: "#fff",
                                fontFamily: "ui-monospace,monospace",
                                fontSize: 13,
                            }}
                        />
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortId)}
                            style={{
                                background: "rgba(0,0,0,0.5)",
                                border: "1px solid rgba(0,255,170,0.3)",
                                borderRadius: 4,
                                padding: "8px 10px",
                                color: "#fff",
                                fontFamily: "ui-monospace,monospace",
                                fontSize: 13,
                            }}
                        >
                            {SORTS.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {categories.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Chip active={!category} onClick={() => setCategory(null)}>
                                All
                            </Chip>
                            {categories.map((c) => (
                                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                                    {c}
                                </Chip>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!games.length && (
                <EmptyState
                    title="No games yet"
                    body={
                        <>
                            Be the first to{" "}
                            <a href="/arcade/submit" style={{ color: "#ffe66d" }}>
                                submit one
                            </a>
                            .
                        </>
                    }
                />
            )}
            {games.length > 0 && filtered.length === 0 && (
                <EmptyState
                    title="No matches"
                    body={
                        <>
                            Nothing matches your filters.{" "}
                            <button
                                onClick={() => {
                                    setSearch("");
                                    setCategory(null);
                                }}
                                style={resetBtn}
                            >
                                Clear filters
                            </button>
                        </>
                    }
                />
            )}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 16,
                }}
            >
                {filtered.map((g) => (
                    <GameCard key={g.slug} game={g} />
                ))}
            </div>
        </div>
    );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                background: active ? "rgba(0,255,170,0.18)" : "transparent",
                border: `1px solid ${active ? "#7eff9f" : "rgba(0,255,170,0.3)"}`,
                color: active ? "#7eff9f" : "#aafff0",
                padding: "4px 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: "ui-monospace,monospace",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.5,
            }}
        >
            {children}
        </button>
    );
}

function GameCard({ game }: { game: ArcadeGame }) {
    const nav = useNavigate();
    const isNew = Date.now() - +new Date(game.createdAt) < 72 * 3600_000;
    return (
        <button
            onClick={() => nav(`/arcade/play/${encodeURIComponent(game.slug)}`)}
            style={{
                position: "relative",
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
                transition: "border-color 120ms, transform 120ms",
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,255,170,0.55)";
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,255,170,0.25)";
            }}
        >
            {isNew && (
                <span
                    style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "#ffe66d",
                        color: "#0a0f0d",
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 999,
                        letterSpacing: 1,
                    }}
                >
                    NEW
                </span>
            )}
            <div style={{ fontSize: 16, color: "#fff", fontWeight: 600, paddingRight: isNew ? 40 : 0 }}>
                {game.title}
            </div>
            <div style={{ opacity: 0.7, fontSize: 12, minHeight: 32 }}>
                {game.description?.slice(0, 80) || ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Hackatar label={game.builder.label} size={24} />
                <span style={{ fontSize: 12, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    by {game.builder.domain}
                </span>
            </div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    opacity: 0.65,
                    marginTop: 4,
                }}
            >
                <span>▶ {game.playCount.toLocaleString()}</span>
                <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{game.category}</span>
            </div>
        </button>
    );
}

function EmptyState({ title, body }: { title: string; body: React.ReactNode }) {
    return (
        <div
            style={{
                padding: "32px 16px",
                marginBottom: 16,
                textAlign: "center",
                background: "rgba(0,0,0,0.25)",
                border: "1px dashed rgba(0,255,170,0.25)",
                borderRadius: 8,
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
            }}
        >
            <div style={{ fontSize: 14, color: "#fff", marginBottom: 6 }}>{title}</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>{body}</div>
        </div>
    );
}

const resetBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#ffe66d",
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
    textDecoration: "underline",
    padding: 0,
};
