import { useState } from "react";
import { useTezos } from "../../context/TezosContext";
import { rescindArcadeGame, useMyGames, type ArcadeGame } from "../../hooks/useArcade";
import ArcadeLoader from "./ArcadeLoader";
import EditGameForm, { type EditableGame } from "./EditGameForm";

export default function MyGames() {
    const { activeDomain, address, chatDomains, connect } = useTezos();
    const domain = activeDomain ?? chatDomains[0] ?? null;
    const { data, loading, error, reload } = useMyGames(domain);

    if (!address) {
        return (
            <div style={pad}>
                <h2>My games</h2>
                <button style={btn} onClick={() => void connect()}>
                    Connect wallet
                </button>
            </div>
        );
    }
    if (!domain) {
        return (
            <div style={pad}>
                <h2>My games</h2>
                <p>Claim a hack.tez name first.</p>
            </div>
        );
    }
    if (loading && !data) return <ArcadeLoader message="LOADING…" />;
    if (error) return <div style={{ ...pad, color: "#ff6b6b" }}>Error: {error}</div>;
    const games = data?.games ?? [];

    return (
        <div style={pad}>
            <h2 style={{ margin: 0, marginBottom: 16 }}>My games</h2>
            {!games.length && (
                <p style={{ opacity: 0.7 }}>
                    None yet —{" "}
                    <a href="/arcade/submit" style={{ color: "#ffe66d" }}>
                        submit one
                    </a>
                    .
                </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {games.map((g) => (
                    <Row key={g.slug} game={g} onChanged={reload} />
                ))}
            </div>
        </div>
    );
}

function Row({ game, onChanged }: { game: ArcadeGame; onChanged: () => void }) {
    const status = game.status ?? "active";
    const color =
        status === "active"
            ? "#7eff9f"
            : status === "pending"
              ? "#ffe66d"
              : status === "rejected" || status === "removed"
                ? "#ff6b6b"
                : "#aafff0";
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const canEdit = status === "pending" || status === "active" || status === "flagged";
    const canRescind = status === "pending";

    async function rescind() {
        if (!window.confirm(`Rescind "${game.title}"? This permanently deletes your pending submission.`)) return;
        setBusy(true);
        setErr(null);
        try {
            await rescindArcadeGame(game.slug);
            onChanged();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "rescind failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong style={{ color: "#fff" }}>{game.title}</strong>
                <span style={{ color, textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }}>{status}</span>
            </div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
                {game.playCount.toLocaleString()} plays · {game.playerCount.toLocaleString()} players · v{game.version}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {status === "active" && (
                    <a style={btnLink} href={`/arcade/play/${encodeURIComponent(game.slug)}`}>
                        Play
                    </a>
                )}
                {canEdit && (
                    <button style={btn} onClick={() => setEditing((s) => !s)} disabled={busy}>
                        {editing ? "Close" : "Edit"}
                    </button>
                )}
                {canRescind && (
                    <button style={btnDanger} onClick={rescind} disabled={busy}>
                        {busy ? "…" : "Rescind"}
                    </button>
                )}
            </div>
            {err && <div style={{ color: "#ff6b6b", fontSize: 12 }}>{err}</div>}
            {editing && (
                <EditGameForm
                    game={game as EditableGame}
                    onSaved={() => {
                        setEditing(false);
                        onChanged();
                    }}
                    onCancel={() => setEditing(false)}
                />
            )}
        </div>
    );
}

const pad: React.CSSProperties = { padding: 16, color: "#aafff0", fontFamily: "ui-monospace,monospace" };
const card: React.CSSProperties = {
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(0,255,170,0.25)",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
};
const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.6)",
    color: "#aafff0",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
};
const btnLink: React.CSSProperties = { ...btn, textDecoration: "none", display: "inline-block" };
const btnDanger: React.CSSProperties = { ...btn, borderColor: "rgba(255,107,107,0.6)", color: "#ff6b6b" };
