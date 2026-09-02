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

const STATUS_GROUPS: { key: string; label: string; toneVar: string }[] = [
    { key: "active", label: "Live", toneVar: "var(--ok)" },
    { key: "pending", label: "Pending review", toneVar: "var(--warn)" },
    { key: "flagged", label: "Flagged", toneVar: "var(--warn)" },
    { key: "rejected", label: "Rejected", toneVar: "var(--err)" },
    { key: "removed", label: "Removed", toneVar: "var(--fg-3)" },
];

export default function MyGames() {
    const { activeDomain, primaryDomain, chatDomains, address } = useTezos();
    const myDomain = activeDomain ?? primaryDomain ?? chatDomains[0] ?? null;
    const { data, loading, error, reload } = useMyGames(myDomain);
    const games = data?.games ?? [];

    const grouped = useMemo(() => {
        const m = new Map<string, ArcadeGame[]>();
        STATUS_GROUPS.forEach((g) => {
            m.set(g.key, []);
        });
        for (const g of games) {
            const key = g.status ?? "active";
            const bucket = m.get(key) ?? m.get("active");
            bucket?.push(g);
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
                        <Link to="/skills/hackcade-sdk" className="arcade-link">
                            Hackcade SDK
                        </Link>
                        , then{" "}
                        <Link to="/arcade/submit" className="arcade-link">
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
                                color: group.toneVar,
                                opacity: 0.9,
                                fontFamily: "var(--font)",
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
                            <strong>{rescinding.title}</strong> will be withdrawn from the
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
    const reason = game as ArcadeGame & { rejectionReason?: string; removalReason?: string; flagReason?: string };
    const showReason = reason.rejectionReason || reason.removalReason || reason.flagReason;

    return (
        <div className="arcade-row">
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{game.title}</strong>
                    <StatusBadge status={status} />
                    <span className="arcade-meta">v{game.version ?? 1}</span>
                </div>
                <div className="arcade-meta" style={{ marginTop: 2 }}>
                    {game.playCount ?? 0} plays · {game.playerCount ?? 0} players
                </div>
                {showReason && (
                    <div className="arcade-flag-block" style={{ marginTop: 6 }}>
                        {reason.rejectionReason && <>Rejected: {reason.rejectionReason}</>}
                        {reason.removalReason && <>Removed: {reason.removalReason}</>}
                        {reason.flagReason && <>Flagged: {reason.flagReason}</>}
                    </div>
                )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {status === "active" && (
                    <Link to={`/arcade/play/${game.slug}`} className="arcade-btn arcade-btn--sm">
                        Play
                    </Link>
                )}
                <button type="button" className="arcade-btn arcade-btn--sm" onClick={onEdit}>
                    Edit
                </button>
                {status === "active" && (
                    <button type="button" className="arcade-btn arcade-btn--sm" onClick={onUpdate}>
                        Update
                    </button>
                )}
                {status === "pending" && (
                    <button type="button" className="arcade-btn arcade-btn--sm arcade-btn--danger" onClick={onRescind}>
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
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
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
                <div className="arcade-warn-block">
                    ⚠ All existing high scores for {game.title} will be wiped on approval.
                </div>
            )}
            {error && (
                <div role="alert" className="arcade-err-block">
                    {error}
                </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="arcade-btn arcade-btn--primary" disabled={busy || !zip}>
                    {busy ? "Submitting…" : "Submit update"}
                </button>
                <button type="button" className="arcade-btn" onClick={onCancel} disabled={busy}>
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
        coverKey: g.coverKey ?? null,
    };
}

function Empty({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
    return (
        <div className="arcade-empty">
            <div style={{ fontSize: 14, marginBottom: 4 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, opacity: 0.7 }}>{subtitle}</div>}
        </div>
    );
}
