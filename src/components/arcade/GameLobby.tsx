import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useArcadeGames, gameCoverUrl, type ArcadeGame } from "../../hooks/useArcade";
import { usePageMeta } from "../../hooks/usePageMeta";
import ArcadeAvatar from "./ArcadeAvatar";
import ArcadeLoader from "./ArcadeLoader";

const SORTS = [
    { id: "popular", label: "Most played" },
    { id: "newest", label: "Newest" },
    { id: "trending", label: "Trending" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

const SITE_URL = (import.meta.env?.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") || "https://hacktez.com";

export default function GameLobby() {
    const { data, loading, error } = useArcadeGames();
    const games = data?.games ?? [];

    const lobbyStructuredData = useMemo(() => {
        const breadcrumb = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "hack.tez", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "Hackcade", item: `${SITE_URL}/arcade` },
            ],
        };
        if (!games.length) return [breadcrumb];
        // Canonical SEO ordering: most played first
        const ranked = [...games].sort((a, b) => b.playCount - a.playCount);
        const itemList = {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Hackcade Games",
            numberOfItems: ranked.length,
            itemListElement: ranked.map((g, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${SITE_URL}/arcade/play/${encodeURIComponent(g.slug)}`,
                name: g.title,
            })),
        };
        return [breadcrumb, itemList];
    }, [games]);

    usePageMeta({
        title: "Hackcade — hack.tez Arcade",
        description:
            "Build it. Ship it. Play it. Community-built HTML5 games — sign in with your hack.tez domain and climb the leaderboards.",
        path: "/arcade",
        image: "/arcade-og.png",
        imageAlt: "HACKCADE — community-built HTML5 games on hack.tez",
        structuredData: lobbyStructuredData,
    });
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
            <div style={{ padding: 16, fontFamily: "var(--font)" }} className="arcade-err-block">
                Error: {error}
            </div>
        );

    return (
        <div style={{ padding: "0 4px" }} className="arcade-page">
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <span className="arcade-meta">
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
                            className="arcade-input"
                            style={{ flex: "1 1 220px" }}
                        />
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortId)}
                            className="arcade-select"
                            style={{ flex: "0 0 auto", width: "auto" }}
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
                            <a href="/arcade/submit" className="arcade-link">
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
                                className="arcade-link"
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}
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
            className={`arcade-chip${active ? " arcade-chip--active" : ""}`}
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
            className="arcade-game-card"
        >
            {isNew && (
                <span
                    className="arcade-warn-pill"
                    style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}
                >
                    NEW
                </span>
            )}
            <div className="arcade-cover">
                {gameCoverUrl(game.coverKey) ? (
                    <img
                        src={gameCoverUrl(game.coverKey) as string}
                        alt={`${game.title} cover`}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                ) : (
                    <span style={{ fontSize: 28, opacity: 0.35 }}>🎮</span>
                )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, paddingRight: isNew ? 40 : 0 }}>
                {game.title}
            </div>
            <div className="arcade-meta" style={{ minHeight: 32, opacity: 0.7 }}>
                {game.description?.slice(0, 80) || ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <ArcadeAvatar label={game.builder.label} size={24} />
                <span className="arcade-meta" style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    by {game.builder.domain}
                </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }} className="arcade-meta">
                <span>▶ {game.playCount.toLocaleString()}</span>
                <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{game.category}</span>
            </div>
        </button>
    );
}

function EmptyState({ title, body }: { title: string; body: React.ReactNode }) {
    return (
        <div className="arcade-empty" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>{title}</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>{body}</div>
        </div>
    );
}
