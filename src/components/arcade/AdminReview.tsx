import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTezos } from "../../context/TezosContext";
import {
    useArcadePending,
    useArcadePendingUpdates,
    type ArcadePendingUpdate,
    useArcadeFlagged,
    adminAction,
    gameIframeUrl,
    gameCoverUrl,
    type ArcadeGame,
} from "../../hooks/useArcade";
import Tabs from "./ui/Tabs";
import StatusBadge from "./ui/StatusBadge";
import ConfirmAction from "./ui/ConfirmAction";
import Modal from "./ui/Modal";
import EditGameForm, { type EditableGame } from "./EditGameForm";

type TabKey = "pending" | "updates" | "flagged";

export default function AdminReview() {
    const pending = useArcadePending(true);
    const updates = useArcadePendingUpdates(true);
    const flagged = useArcadeFlagged(true);

    const pendingItems = pending.data?.pending ?? [];
    const updateItems = updates.data?.pendingUpdates ?? [];
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
        <div className="arcade-card" style={{ gap: 10, display: "flex", flexDirection: "column" }}>
            <Header game={game} />
            <p className="arcade-meta" style={{ margin: 0, fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
                {game.description || <em style={{ opacity: 0.5 }}>(no description)</em>}
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="arcade-btn arcade-btn--primary" onClick={() => setConfirmKind("approve")}>
                    Approve
                </button>
                <button className="arcade-btn arcade-btn--danger" onClick={() => setConfirmKind("reject")}>
                    Reject
                </button>
                <button className="arcade-btn" onClick={() => setEditOpen(true)}>
                    Edit
                </button>
                <button className="arcade-btn" onClick={() => setShowPreview((s) => !s)}>
                    {showPreview ? "Hide preview" : "Preview"}
                </button>
                <span className="arcade-meta" style={{ marginLeft: "auto" }}>bundle: {short(game.ipfsCid)}</span>
            </div>

            {showPreview && (
                <div className="arcade-preview-wrap">
                    <PreviewIframe cid={game.ipfsCid} title={game.title} />
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

function UpdateCard({ update, reload }: { update: ArcadePendingUpdate; reload: () => void }) {
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [confirmKind, setConfirmKind] = useState<null | "approve" | "reject">(null);

    return (
        <div className="arcade-card" style={{ gap: 10, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <CoverThumb coverKey={update.coverKey} title={update.title} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: "1 1 auto", minWidth: 0 }}>
                    <strong>{update.title}</strong>
                    <StatusBadge status="pending" />
                    <span className="arcade-meta">
                        by <strong style={{ color: "var(--accent)" }}>{update.uploadedBy ?? update.builderDomain}</strong>
                    </span>
                    <span className="arcade-meta" style={{ marginLeft: "auto" }}>
                        v{update.currentVersion} → v{update.newVersion}
                    </span>
                </div>
            </div>

            {update.scoresReset && (
                <div className="arcade-warn-block">⚠ Approving will WIPE all existing scores for this game.</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="arcade-subcard">
                    <div className="arcade-meta" style={{ textTransform: "uppercase", letterSpacing: 1, color: "var(--warn)" }}>
                        Current v{update.currentVersion}
                    </div>
                    <div className="arcade-meta">{short(update.currentCid)}</div>
                    <button className="arcade-btn arcade-btn--sm" onClick={() => setShowCurrent((s) => !s)}>
                        {showCurrent ? "Hide" : "Preview"}
                    </button>
                    {showCurrent && (
                        <div style={{ marginTop: 8 }}>
                            <PreviewIframe cid={update.currentCid} title={`${update.title} v${update.currentVersion}`} />
                        </div>
                    )}
                </div>
                <div className="arcade-subcard arcade-subcard--accent">
                    <div className="arcade-meta" style={{ textTransform: "uppercase", letterSpacing: 1, color: "var(--ok)" }}>
                        New v{update.newVersion}
                    </div>
                    <div className="arcade-meta">{short(update.newCid)}</div>
                    <button className="arcade-btn arcade-btn--sm" onClick={() => setShowNew((s) => !s)}>
                        {showNew ? "Hide" : "Preview"}
                    </button>
                    {showNew && (
                        <div style={{ marginTop: 8 }}>
                            <PreviewIframe cid={update.newCid} title={`${update.title} v${update.newVersion}`} />
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="arcade-btn arcade-btn--primary" onClick={() => setConfirmKind("approve")}>
                    Approve update
                </button>
                <button className="arcade-btn arcade-btn--danger" onClick={() => setConfirmKind("reject")}>
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
        <div className="arcade-card" style={{ gap: 10, display: "flex", flexDirection: "column" }}>
            <Header game={game} />
            {flagReason && (
                <div className="arcade-flag-block">
                    Flagged: {flagReason}
                </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="arcade-btn arcade-btn--primary" onClick={() => setConfirmKind("unflag")}>
                    Unflag
                </button>
                <button className="arcade-btn arcade-btn--danger" onClick={() => setConfirmKind("remove")}>
                    Remove
                </button>
                <Link to={`/arcade/play/${game.slug}`} className="arcade-btn">
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

function PreviewIframe({ cid, title }: { cid: string; title: string }) {
    const { activeDomain, address } = useTezos();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const sendInit = useCallback(() => {
        if (!iframeRef.current?.contentWindow) return;
        const player = activeDomain
            ? { domain: activeDomain, label: activeDomain.split(".")[0], address: address ?? null, isGuest: false }
            : { domain: null, label: "guest", address: null, isGuest: true };
        iframeRef.current.contentWindow.postMessage(
            { type: "hackcade:init", player, sessionId: `admin-preview-${Date.now()}`, gameSlug: title },
            "*",
        );
    }, [activeDomain, address, title]);

    useEffect(() => {
        function onMessage(e: MessageEvent) {
            if (e.source !== iframeRef.current?.contentWindow) return;
            const data = e.data as { type?: string } | null;
            if (data?.type === "hackcade:ready") sendInit();
            // Ignore score / gameover in preview mode.
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [sendInit]);

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1 / 1",
                maxWidth: 600,
                maxHeight: "calc(100vh - 240px)",
                margin: "0 auto",
                background: "#000",
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--border-2)",
            }}
        >
            <iframe
                ref={iframeRef}
                title={`Preview ${title}`}
                src={gameIframeUrl(cid)}
                sandbox="allow-scripts allow-same-origin"
                allow="accelerometer; gyroscope; gamepad"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
        </div>
    );
}

function CoverThumb({ coverKey, title }: { coverKey?: string | null; title: string }) {
    const url = gameCoverUrl(coverKey ?? null);
    if (!url) {
        return (
            <div
                aria-hidden
                style={{
                    width: 56,
                    height: 56,
                    flex: "0 0 auto",
                    borderRadius: 6,
                    background: "var(--bg-3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    opacity: 0.5,
                }}
            >
                🎮
            </div>
        );
    }
    return (
        <img
            src={url}
            alt={`${title} cover`}
            loading="lazy"
            style={{
                width: 56,
                height: 56,
                flex: "0 0 auto",
                borderRadius: 6,
                objectFit: "cover",
                background: "var(--bg-3)",
            }}
        />
    );
}

function Header({ game }: { game: ArcadeGame }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <CoverThumb coverKey={game.coverKey} title={game.title} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: "1 1 auto", minWidth: 0 }}>
                <strong>{game.title}</strong>
                <StatusBadge status={game.status ?? "pending"} />
                <span className="arcade-meta">
                    by{" "}
                    <Link to={`/u/${game.builder.label}`} className="arcade-link">
                        {game.builder.domain}
                    </Link>
                </span>
                <span className="arcade-meta" style={{ marginLeft: "auto" }}>
                    {game.category} · v{game.version ?? 1}
                </span>
            </div>
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

function short(cid?: string) {
    if (!cid) return "";
    return cid.length > 14 ? `${cid.slice(0, 6)}…${cid.slice(-4)}` : cid;
}
