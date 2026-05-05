import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTezos } from "../../context/TezosContext";
import {
    useMyGames,
    rescindArcadeGame,
    updateArcadeGame,
    type ArcadeGame,
} from "../../hooks/useArcade";
import StatusBadge from "./ui/StatusBadge";
import Modal from "./ui/Modal";
import ConfirmAction from "./ui/ConfirmAction";
import EditGameForm, { type EditableGame } from "./EditGameForm";
import FilePicker from "./FilePicker";

const STATUS_GROUPS: { key: string; label: string; tone: string }[] = [
    { key: "active", label: "Live", tone: "#7eff9f" },
    { key: "pending", label: "Pending review", tone: "#ffe66d" },
    { key: "flagged", label: "Flagged", tone: "#ffb86b" },
    { key: "rejected", label: "Rejected", tone: "#ff8a8a" },
    { key: "removed", label: "Removed", tone: "#888" },
];

export default function MyGames() {
    const { activeDomain, chatDomains, address } = useTezos();
    const myDomain = activeDomain ?? chatDomains[0] ?? null;
    const { data, loading, error, reload } = useMyGames(myDomain);
    const games = data?.games ?? [];

    const grouped = useMemo(() => {
        const m = new Map<string, ArcadeGame[]>();
        STATUS_GROUPS.forEach((g) => m.set(g.key, []));
        for (const g of games) {
            const key = g.status ?? "active";
            (m.get(key) ?? m.get("active")!).push(g);
        }
        return m;
    }, [games]);

    const [editing, setEditing] = useState<ArcadeGame | null>(null);
    const [updating, setUpdating] = useState<ArcadeGame | null>(null);
    const [rescinding, setRescinding] = useState<ArcadeGame | null>(null);

    if (!address) {
        return <Empty title="Connect your wallet to see your games." />;
    }
    if (!myDomain) {
        return <Empty title="No hack.tez name on this wallet." subtitle="Claim one on the home page first." />;
    }
    if (loading && games.length === 0) {
        return <Empty title="Loading your games…" />;
    }
    if (error) {
        return <Empty title="Couldn't load your games." subtitle={error} />;
    }
    if (games.length === 0) {
        return (
            <Empty
                title="You haven't shipped any games yet."
                subtitle={
                    <>
                        Build one with the{" "}
                        <Link to="/skills/hackcade-sdk" style={{ color: "#ffe66d" }}>
                            Hackcade SDK
                        </Link>
                        , then{" "}
                        <Link to="/arcade/submit" style={{ color: "#ffe66d" }}>
                            submit it
                        </Link>
                        .
                    </>
                }
            />
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {STATUS_GROUPS.map((group) => {
                const items = grouped.get(group.key) ?? [];
                if (items.length === 0) return null;
                return (
                    <section key={group.key}>
                        <h3
                            style={{
                                margin: "0 0 8px",
                                fontSize: 12,
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                color: group.tone,
                                opacity: 0.9,
                                fontFamily: "ui-monospace,monospace",
                            }}
                        >
                            {group.label} <span style={{ opacity: 0.55 }}>({items.length})</span>
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {items.map((g) => (
                                <GameRow
                                    key={g.slug}
                                    game={g}
                                    onEdit={() => setEditing(g)}
                                    onUpdate={() => setUpdating(g)}
                                    onRescind={() => setRescinding(g)}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}

            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.title}` : ""}>
                {editing && (
                    <EditGameForm
                        game={toEditable(editing)}
                        onSaved={() => {
                            setEditing(null);
                            void reload();
                        }}
                        onCancel={() => setEditing(null)}
                    />
                )}
            </Modal>

            <Modal open={!!updating} onClose={() => setUpdating(null)} title={updating ? `Update ${updating.title}` : ""}>
                {updating && (
                    <UpdateForm
                        game={updating}
                        onDone={() => {
                            setUpdating(null);
                            void reload();
                        }}
                        onCancel={() => setUpdating(null)}
                    />
                )}
            </Modal>

            <ConfirmAction
                open={!!rescinding}
                title="Rescind this submission?"
                message={
                    rescinding ? (
                        <>
                            <strong style={{ color: "#fff" }}>{rescinding.title}</strong> will be withdrawn from the
                            review queue. You can resubmit later.
                        </>
                    ) : null
                }
                confirmLabel="Rescind"
                variant="danger"
                onConfirm={async () => {
                    if (!rescinding) return;
                    await rescindArcadeGame(rescinding.slug);
                    void reload();
                }}
                onClose={() => setRescinding(null)}
            />
        </div>
    );
}

function GameRow({
    game,
    onEdit,
    onUpdate,
    onRescind,
}: {
    game: ArcadeGame;
    onEdit: () => void;
    onUpdate: () => void;
    onRescind: () => void;
}) {
    const status = game.status ?? "active";
    const reason = (game as ArcadeGame & { rejectionReason?: string; removalReason?: string; flagReason?: string });
    const showReason = reason.rejectionReason || reason.removalReason || reason.flagReason;

    return (
        <div style={row}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ color: "#fff" }}>{game.title}</strong>
                    <StatusBadge status={status} />
                    <span style={{ opacity: 0.5, fontSize: 11 }}>v{game.version ?? 1}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                    {game.playCount ?? 0} plays · {game.playerCount ?? 0} players
                </div>
                {showReason && (
                    <div
                        style={{
                            marginTop: 6,
                            fontSize: 11,
                            color: "#ff8a8a",
                            background: "rgba(255,107,107,0.07)",
                            border: "1px solid rgba(255,107,107,0.25)",
                            borderRadius: 3,
                            padding: "4px 6px",
                        }}
                    >
                        {reason.rejectionReason && <>Rejected: {reason.rejectionReason}</>}
                        {reason.removalReason && <>Removed: {reason.removalReason}</>}
                        {reason.flagReason && <>Flagged: {reason.flagReason}</>}
                    </div>
                )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {status === "active" && (
                    <Link to={`/arcade/play/${game.slug}`} style={btn}>
                        Play
                    </Link>
                )}
                <button style={btn} onClick={onEdit}>
                    Edit
                </button>
                {status === "active" && (
                    <button style={btn} onClick={onUpdate}>
                        Update
                    </button>
                )}
                {status === "pending" && (
                    <button style={btnDanger} onClick={onRescind}>
                        Rescind
                    </button>
                )}
            </div>
        </div>
    );
}

function UpdateForm({ game, onDone, onCancel }: { game: ArcadeGame; onDone: () => void; onCancel: () => void }) {
    const [zip, setZip] = useState<File | null>(null);
    const [scoresReset, setScoresReset] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!zip) {
            setError("Pick a zip");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const fd = new FormData();
            fd.set("zip", zip);
            fd.set("scoresReset", scoresReset ? "true" : "false");
            await updateArcadeGame(game.slug, fd);
            onDone();
        } catch (e2) {
            setError(e2 instanceof Error ? e2.message : "Update failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, opacity: 0.85, margin: 0 }}>
                Submit a new build. It will go through admin review again. Players keep playing the current version
                until approved.
            </p>
            <FilePicker file={zip} onChange={setZip} maxBytes={5 * 1024 * 1024} required />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.9 }}>
                <input
                    type="checkbox"
                    checked={scoresReset}
                    onChange={(e) => setScoresReset(e.target.checked)}
                />
                Reset all scores when this update is approved
            </label>
            {scoresReset && (
                <div
                    style={{
                        fontSize: 11,
                        color: "#ff8a8a",
                        background: "rgba(255,107,107,0.08)",
                        border: "1px solid rgba(255,107,107,0.3)",
                        padding: "6px 8px",
                        borderRadius: 4,
                    }}
                >
                    ⚠ All existing high scores for {game.title} will be wiped on approval.
                </div>
            )}
            {error && <div style={{ color: "#ff8a8a", fontSize: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={btnPrimary} disabled={busy || !zip}>
                    {busy ? "Submitting…" : "Submit update"}
                </button>
                <button type="button" style={btn} onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

function toEditable(g: ArcadeGame): EditableGame {
    return {
        slug: g.slug,
        title: g.title,
        description: g.description,
        category: g.category,
        sourceUrl: g.sourceUrl,
        maxPossibleScore: g.maxPossibleScore,
        maxScorePerSecond: g.maxScorePerSecond,
        status: g.status,
        ipfsCid: g.ipfsCid,
        version: g.version,
    };
}

function Empty({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
    return (
        <div
            style={{
                padding: "32px 16px",
                textAlign: "center",
                border: "1px dashed rgba(0,255,170,0.25)",
                borderRadius: 8,
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
            }}
        >
            <div style={{ fontSize: 14, marginBottom: 4 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, opacity: 0.7 }}>{subtitle}</div>}
        </div>
    );
}

const row: React.CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 12,
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(0,255,170,0.22)",
    borderRadius: 6,
    color: "#aafff0",
    fontFamily: "ui-monospace,monospace",
};

const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.5)",
    color: "#aafff0",
    padding: "5px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
    fontSize: 12,
    textDecoration: "none",
};

const btnPrimary: React.CSSProperties = {
    ...btn,
    background: "rgba(0,255,170,0.18)",
    borderColor: "#7eff9f",
    color: "#7eff9f",
};

const btnDanger: React.CSSProperties = {
    ...btn,
    borderColor: "rgba(255,107,107,0.6)",
    color: "#ff8a8a",
};
