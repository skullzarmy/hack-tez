import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    useArcadePending,
    useArcadePendingUpdates,
    useArcadeFlagged,
    adminAction,
    gameIframeUrl,
    type ArcadeGame,
} from "../../hooks/useArcade";
import Tabs from "./ui/Tabs";
import StatusBadge from "./ui/StatusBadge";
import ConfirmAction from "./ui/ConfirmAction";
import Modal from "./ui/Modal";
import EditGameForm, { type EditableGame } from "./EditGameForm";

interface PendingUpdate {
    id: number;
    versionId: number;
    slug: string;
    title: string;
    description?: string;
    category?: string;
    builderDomain?: string;
    currentCid: string;
    currentVersion: number;
    newCid: string;
    newVersion: number;
    uploadedBy?: string;
    scoresReset: boolean;
    createdAt?: string;
}

type TabKey = "pending" | "updates" | "flagged";

export default function AdminReview() {
    const pending = useArcadePending(true);
    const updates = useArcadePendingUpdates(true);
    const flagged = useArcadeFlagged(true);

    const pendingItems = pending.data?.pending ?? [];
    const updateItems = (updates.data?.pendingUpdates ?? []) as PendingUpdate[];
    const flaggedItems = flagged.data?.flagged ?? [];

    const [tab, setTab] = useState<TabKey>("pending");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Tabs
                active={tab}
                onChange={(k) => setTab(k as TabKey)}
                tabs={[
                    { id: "pending", label: "Pending", count: pendingItems.length },
                    { id: "updates", label: "Updates", count: updateItems.length },
                    { id: "flagged", label: "Flagged", count: flaggedItems.length },
                ]}
            />

            {tab === "pending" && (
                <Section state={pending} emptyTitle="Inbox zero. No games waiting on review.">
                    {pendingItems.map((g) => (
                        <PendingCard key={g.slug} game={g} reload={pending.reload} />
                    ))}
                </Section>
            )}

            {tab === "updates" && (
                <Section state={updates} emptyTitle="No version updates pending.">
                    {updateItems.map((u) => (
                        <UpdateCard key={u.versionId} update={u} reload={updates.reload} />
                    ))}
                </Section>
            )}

            {tab === "flagged" && (
                <Section state={flagged} emptyTitle="Nothing flagged. Community is chill.">
                    {flaggedItems.map((g) => (
                        <FlaggedCard key={g.slug} game={g} reload={flagged.reload} />
                    ))}
                </Section>
            )}
        </div>
    );
}

function Section({
    state,
    emptyTitle,
    children,
}: {
    state: { loading: boolean; error: string | null; data: unknown };
    emptyTitle: string;
    children: React.ReactNode;
}) {
    const arr = useMemo(() => {
        const c = Array.isArray(children) ? children : [children];
        return c.filter(Boolean);
    }, [children]);

    if (state.loading && !state.data) return <Empty title="Loading…" />;
    if (state.error) return <Empty title="Couldn't load." subtitle={state.error} />;
    if (arr.length === 0) return <Empty title={emptyTitle} />;
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>;
}

function PendingCard({ game, reload }: { game: ArcadeGame; reload: () => void }) {
    const [showPreview, setShowPreview] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [confirmKind, setConfirmKind] = useState<null | "approve" | "reject">(null);

    return (
        <div style={card}>
            <Header game={game} />
            <p style={desc}>{game.description || <em style={{ opacity: 0.5 }}>(no description)</em>}</p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button style={btnPrimary} onClick={() => setConfirmKind("approve")}>
                    Approve
                </button>
                <button style={btnDanger} onClick={() => setConfirmKind("reject")}>
                    Reject
                </button>
                <button style={btn} onClick={() => setEditOpen(true)}>
                    Edit
                </button>
                <button style={btn} onClick={() => setShowPreview((s) => !s)}>
                    {showPreview ? "Hide preview" : "Preview"}
                </button>
                <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.55 }}>cid: {short(game.ipfsCid)}</span>
            </div>

            {showPreview && (
                <div style={previewWrap}>
                    <iframe
                        title={`Preview ${game.title}`}
                        src={gameIframeUrl(game.ipfsCid)}
                        style={{ width: "100%", height: 360, border: "none", background: "#000" }}
                        sandbox="allow-scripts allow-same-origin"
                    />
                </div>
            )}

            <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${game.title}`}>
                <EditGameForm
                    game={toEditable(game)}
                    onSaved={() => {
                        setEditOpen(false);
                        reload();
                    }}
                    onCancel={() => setEditOpen(false)}
                />
            </Modal>

            <ConfirmAction
                open={confirmKind === "approve"}
                title={`Approve ${game.title}?`}
                message="It goes live in the lobby immediately."
                confirmLabel="Approve"
                variant="primary"
                onConfirm={async () => {
                    await adminAction(game.slug, "approve");
                    reload();
                }}
                onClose={() => setConfirmKind(null)}
            />
            <ConfirmAction
                open={confirmKind === "reject"}
                title={`Reject ${game.title}?`}
                message="The submitter will see your reason."
                confirmLabel="Reject"
                variant="danger"
                reason={{ required: true, label: "Reason", minLength: 8, multiline: true, placeholder: "What needs to change?" }}
                onConfirm={async (reason) => {
                    await adminAction(game.slug, "reject", { reason });
                    reload();
                }}
                onClose={() => setConfirmKind(null)}
            />
        </div>
    );
}

function UpdateCard({ update, reload }: { update: PendingUpdate; reload: () => void }) {
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [confirmKind, setConfirmKind] = useState<null | "approve" | "reject">(null);

    return (
        <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ color: "#fff" }}>{update.title}</strong>
                <StatusBadge status="pending" />
                <span style={{ fontSize: 11, opacity: 0.65 }}>
                    by <strong style={{ color: "#aafff0" }}>{update.uploadedBy ?? update.builderDomain}</strong>
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>
                    v{update.currentVersion} → v{update.newVersion}
                </span>
            </div>

            {update.scoresReset && (
                <div style={warn}>⚠ Approving will WIPE all existing scores for this game.</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={subCard}>
                    <div style={subHead}>Current v{update.currentVersion}</div>
                    <div style={cidLine}>{short(update.currentCid)}</div>
                    <button style={btnSm} onClick={() => setShowCurrent((s) => !s)}>
                        {showCurrent ? "Hide" : "Preview"}
                    </button>
                    {showCurrent && (
                        <iframe
                            title="Current"
                            src={gameIframeUrl(update.currentCid)}
                            style={{ width: "100%", height: 240, border: "none", marginTop: 8, background: "#000" }}
                            sandbox="allow-scripts allow-same-origin"
                        />
                    )}
                </div>
                <div style={{ ...subCard, borderColor: "rgba(126,255,159,0.4)" }}>
                    <div style={{ ...subHead, color: "#7eff9f" }}>New v{update.newVersion}</div>
                    <div style={cidLine}>{short(update.newCid)}</div>
                    <button style={btnSm} onClick={() => setShowNew((s) => !s)}>
                        {showNew ? "Hide" : "Preview"}
                    </button>
                    {showNew && (
                        <iframe
                            title="New"
                            src={gameIframeUrl(update.newCid)}
                            style={{ width: "100%", height: 240, border: "none", marginTop: 8, background: "#000" }}
                            sandbox="allow-scripts allow-same-origin"
                        />
                    )}
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btnPrimary} onClick={() => setConfirmKind("approve")}>
                    Approve update
                </button>
                <button style={btnDanger} onClick={() => setConfirmKind("reject")}>
                    Reject update
                </button>
            </div>

            <ConfirmAction
                open={confirmKind === "approve"}
                title={`Approve v${update.newVersion} of ${update.title}?`}
                message={
                    update.scoresReset
                        ? "All scores will be wiped. This cannot be undone."
                        : "The new build will replace the live one for all players."
                }
                confirmLabel={update.scoresReset ? "Approve & wipe scores" : "Approve update"}
                variant={update.scoresReset ? "danger" : "primary"}
                onConfirm={async () => {
                    await adminAction(update.slug, "approve-update", { versionId: update.versionId });
                    reload();
                }}
                onClose={() => setConfirmKind(null)}
            />
            <ConfirmAction
                open={confirmKind === "reject"}
                title={`Reject v${update.newVersion} of ${update.title}?`}
                confirmLabel="Reject update"
                variant="danger"
                reason={{ required: true, label: "Reason", minLength: 8, multiline: true }}
                onConfirm={async (reason) => {
                    await adminAction(update.slug, "reject-update", { versionId: update.versionId, reason });
                    reload();
                }}
                onClose={() => setConfirmKind(null)}
            />
        </div>
    );
}

function FlaggedCard({ game, reload }: { game: ArcadeGame; reload: () => void }) {
    const [confirmKind, setConfirmKind] = useState<null | "unflag" | "remove">(null);
    const flagReason = (game as ArcadeGame & { flagReason?: string }).flagReason;

    return (
        <div style={card}>
            <Header game={game} />
            {flagReason && (
                <div
                    style={{
                        fontSize: 12,
                        color: "#ffb86b",
                        background: "rgba(255,184,107,0.07)",
                        border: "1px solid rgba(255,184,107,0.3)",
                        borderRadius: 4,
                        padding: "6px 8px",
                    }}
                >
                    Flagged: {flagReason}
                </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btnPrimary} onClick={() => setConfirmKind("unflag")}>
                    Unflag
                </button>
                <button style={btnDanger} onClick={() => setConfirmKind("remove")}>
                    Remove
                </button>
                <Link to={`/arcade/play/${game.slug}`} style={btn}>
                    Play
                </Link>
            </div>
            <ConfirmAction
                open={confirmKind === "unflag"}
                title={`Unflag ${game.title}?`}
                message="It returns to the lobby."
                confirmLabel="Unflag"
                variant="primary"
                onConfirm={async () => {
                    await adminAction(game.slug, "unflag");
                    reload();
                }}
                onClose={() => setConfirmKind(null)}
            />
            <ConfirmAction
                open={confirmKind === "remove"}
                title={`Remove ${game.title}?`}
                message="It will be hidden from the lobby. The submitter will see your reason."
                confirmLabel="Remove"
                variant="danger"
                reason={{ required: true, label: "Reason", minLength: 8, multiline: true }}
                onConfirm={async (reason) => {
                    await adminAction(game.slug, "remove", { reason });
                    reload();
                }}
                onClose={() => setConfirmKind(null)}
            />
        </div>
    );
}

function Header({ game }: { game: ArcadeGame }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ color: "#fff" }}>{game.title}</strong>
            <StatusBadge status={game.status ?? "pending"} />
            <span style={{ fontSize: 11, opacity: 0.65 }}>
                by{" "}
                <Link to={`/u/${game.builder.label}`} style={{ color: "#aafff0" }}>
                    {game.builder.domain}
                </Link>
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.55 }}>
                {game.category} · v{game.version ?? 1}
            </span>
        </div>
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

function short(cid?: string) {
    if (!cid) return "";
    return cid.length > 14 ? `${cid.slice(0, 6)}…${cid.slice(-4)}` : cid;
}

const card: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(0,255,170,0.22)",
    borderRadius: 6,
    color: "#aafff0",
    fontFamily: "ui-monospace,monospace",
};

const subCard: React.CSSProperties = {
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(0,255,170,0.25)",
    borderRadius: 4,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
};

const subHead: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.85,
    color: "#ffe66d",
};

const cidLine: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.6,
    fontFamily: "ui-monospace,monospace",
};

const desc: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    opacity: 0.85,
    lineHeight: 1.4,
};

const previewWrap: React.CSSProperties = {
    border: "1px solid rgba(0,255,170,0.25)",
    borderRadius: 4,
    overflow: "hidden",
};

const warn: React.CSSProperties = {
    fontSize: 12,
    color: "#ff8a8a",
    background: "rgba(255,107,107,0.08)",
    border: "1px solid rgba(255,107,107,0.3)",
    padding: "6px 8px",
    borderRadius: 4,
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

const btnSm: React.CSSProperties = {
    ...btn,
    padding: "3px 8px",
    fontSize: 11,
    alignSelf: "flex-start",
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
