import { useState } from "react";
import { useTezos } from "../../context/TezosContext";
import {
    adminAction,
    gameIframeUrl,
    useArcadeFlagged,
    useArcadePending,
    useArcadePendingUpdates,
    type ArcadeGame,
} from "../../hooks/useArcade";
import ArcadeLoader from "./ArcadeLoader";
import EditGameForm, { type EditableGame } from "./EditGameForm";

const ADMIN_DOMAIN_GHOSTNET = "admin.hack.gho";
const ADMIN_DOMAIN_MAINNET = "admin.hack.tez";

function adminDomain() {
    return import.meta.env.VITE_TEZOS_NETWORK === "mainnet" ? ADMIN_DOMAIN_MAINNET : ADMIN_DOMAIN_GHOSTNET;
}

function tabCount(loading: boolean, n: number | undefined) {
    if (loading && n === undefined) return "…";
    return String(n ?? 0);
}

export default function AdminReview() {
    const { chatDomains } = useTezos();
    const isAdmin = chatDomains.includes(adminDomain());

    const [tab, setTab] = useState<"pending" | "updates" | "flagged">("pending");
    const pending = useArcadePending(isAdmin);
    const updates = useArcadePendingUpdates(isAdmin);
    const flagged = useArcadeFlagged(isAdmin);

    if (!isAdmin) {
        return <div style={pad}>Admins only.</div>;
    }

    const pendingItems = pending.data?.pending;
    const updateItems = updates.data?.pendingUpdates;
    const flaggedItems = flagged.data?.flagged;

    return (
        <div style={pad}>
            <h2 style={{ margin: 0, marginBottom: 12 }}>Arcade admin</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>
                    Pending ({tabCount(pending.loading, pendingItems?.length)})
                </TabBtn>
                <TabBtn active={tab === "updates"} onClick={() => setTab("updates")}>
                    Updates ({tabCount(updates.loading, updateItems?.length)})
                </TabBtn>
                <TabBtn active={tab === "flagged"} onClick={() => setTab("flagged")}>
                    Flagged ({tabCount(flagged.loading, flaggedItems?.length)})
                </TabBtn>
            </div>

            {tab === "pending" && (
                <Section
                    loading={pending.loading}
                    error={pending.error}
                    items={pendingItems}
                    empty="No pending submissions."
                    render={(items) => (
                        <div style={col}>
                            {items.map((g) => (
                                <PendingCard
                                    key={g.slug}
                                    game={g}
                                    onAction={async (a, body) => {
                                        await adminAction(g.slug, a, body);
                                        pending.reload();
                                    }}
                                    onEdited={() => pending.reload()}
                                />
                            ))}
                        </div>
                    )}
                />
            )}
            {tab === "updates" && (
                <Section
                    loading={updates.loading}
                    error={updates.error}
                    items={updateItems}
                    empty="No pending updates."
                    render={(items) => (
                        <div style={col}>
                            {items.map((u: any) => (
                                <UpdateCard
                                    key={u.id}
                                    update={u}
                                    onAction={async (a, body) => {
                                        await adminAction(u.slug, a, body);
                                        updates.reload();
                                    }}
                                />
                            ))}
                        </div>
                    )}
                />
            )}
            {tab === "flagged" && (
                <Section
                    loading={flagged.loading}
                    error={flagged.error}
                    items={flaggedItems}
                    empty="No flags."
                    render={(items) => (
                        <div style={col}>
                            {items.map((g) => (
                                <PendingCard
                                    key={g.slug}
                                    game={g}
                                    flagged
                                    onAction={async (a, body) => {
                                        await adminAction(g.slug, a, body);
                                        flagged.reload();
                                    }}
                                    onEdited={() => flagged.reload()}
                                />
                            ))}
                        </div>
                    )}
                />
            )}
        </div>
    );
}

function Section<T>({
    error,
    items,
    empty,
    render,
}: {
    loading: boolean;
    error: string | null;
    items: T[] | undefined;
    empty: string;
    render: (items: T[]) => React.ReactNode;
}) {
    if (error) {
        return (
            <div style={{ ...pad, color: "#ff6b6b", padding: 24, textAlign: "center" }}>
                Error loading: {error}
            </div>
        );
    }
    if (items === undefined) {
        return <ArcadeLoader message="LOADING…" />;
    }
    if (items.length === 0) {
        return <Empty>{empty}</Empty>;
    }
    return <>{render(items)}</>;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: active ? "rgba(0,255,170,0.15)" : "transparent",
                border: "1px solid rgba(0,255,170,0.4)",
                color: "#aafff0",
                padding: "6px 12px",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "ui-monospace,monospace",
            }}
        >
            {children}
        </button>
    );
}

function PendingCard({
    game,
    flagged = false,
    onAction,
    onEdited,
}: {
    game: ArcadeGame;
    flagged?: boolean;
    onAction: (action: "approve" | "reject" | "remove" | "unflag", body?: Record<string, unknown>) => Promise<void>;
    onEdited?: () => void;
}) {
    const [showPreview, setShowPreview] = useState(false);
    const [editing, setEditing] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    async function run(a: "approve" | "reject" | "remove" | "unflag") {
        setErr(null);
        setBusy(true);
        try {
            await onAction(a, a === "reject" || a === "remove" ? { reason } : undefined);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "failed");
        } finally {
            setBusy(false);
        }
    }
    return (
        <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong style={{ color: "#fff" }}>{game.title}</strong>
                <span style={{ opacity: 0.7, fontSize: 12 }}>by {game.builder.domain}</span>
            </div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>{game.description}</div>
            <div style={{ opacity: 0.6, fontSize: 11 }}>{game.ipfsCid}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btn} onClick={() => setShowPreview((s) => !s)}>
                    {showPreview ? "Hide preview" : "Preview"}
                </button>
                <button style={btn} onClick={() => setEditing((s) => !s)} disabled={busy}>
                    {editing ? "Close edit" : "Edit"}
                </button>
                {!flagged && (
                    <button style={btnPos} disabled={busy} onClick={() => run("approve")}>
                        Approve
                    </button>
                )}
                {flagged && (
                    <button style={btnPos} disabled={busy} onClick={() => run("unflag")}>
                        Unflag
                    </button>
                )}
                <button style={btnNeg} disabled={busy || !reason} onClick={() => run(flagged ? "remove" : "reject")}>
                    {flagged ? "Remove" : "Reject"}
                </button>
            </div>
            <input
                style={inp}
                placeholder={flagged ? "Removal reason" : "Rejection reason"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
            />
            {err && <div style={{ color: "#ff6b6b", fontSize: 12 }}>{err}</div>}
            {editing && (
                <EditGameForm
                    game={{ ...(game as EditableGame), status: flagged ? "flagged" : "pending" }}
                    onSaved={() => {
                        setEditing(false);
                        onEdited?.();
                    }}
                    onCancel={() => setEditing(false)}
                />
            )}
            {showPreview && (
                <iframe
                    src={gameIframeUrl(game.ipfsCid)}
                    sandbox="allow-scripts"
                    title={`Preview ${game.slug}`}
                    style={{ width: "100%", aspectRatio: "9/16", maxHeight: 600, border: "1px solid #333", borderRadius: 4 }}
                />
            )}
        </div>
    );
}

function UpdateCard({
    update,
    onAction,
}: {
    update: { slug: string; title: string; version: number; ipfsCid: string; uploadedBy: string; scoresReset: boolean };
    onAction: (a: "approve-update" | "reject-update", body?: Record<string, unknown>) => Promise<void>;
}) {
    const [showPreview, setShowPreview] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    async function run(a: "approve-update" | "reject-update") {
        setErr(null);
        setBusy(true);
        try {
            await onAction(a, a === "reject-update" ? { reason } : undefined);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "failed");
        } finally {
            setBusy(false);
        }
    }
    return (
        <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong style={{ color: "#fff" }}>
                    {update.title} → v{update.version}
                </strong>
                <span style={{ opacity: 0.7, fontSize: 12 }}>by {update.uploadedBy}</span>
            </div>
            {update.scoresReset && (
                <div style={{ color: "#ffe66d", fontSize: 12 }}>⚠ Scores will be wiped on approval</div>
            )}
            <div style={{ opacity: 0.6, fontSize: 11 }}>{update.ipfsCid}</div>
            <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} onClick={() => setShowPreview((s) => !s)}>
                    {showPreview ? "Hide" : "Preview"}
                </button>
                <button style={btnPos} disabled={busy} onClick={() => run("approve-update")}>
                    Approve update
                </button>
                <button style={btnNeg} disabled={busy || !reason} onClick={() => run("reject-update")}>
                    Reject
                </button>
            </div>
            <input
                style={inp}
                placeholder="Rejection reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
            />
            {err && <div style={{ color: "#ff6b6b", fontSize: 12 }}>{err}</div>}
            {showPreview && (
                <iframe
                    src={gameIframeUrl(update.ipfsCid)}
                    sandbox="allow-scripts"
                    title={`Preview ${update.slug} v${update.version}`}
                    style={{ width: "100%", aspectRatio: "9/16", maxHeight: 600, border: "1px solid #333", borderRadius: 4 }}
                />
            )}
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <div style={{ opacity: 0.6, padding: 24, textAlign: "center" }}>{children}</div>;
}

const pad: React.CSSProperties = { padding: 16, color: "#aafff0", fontFamily: "ui-monospace,monospace" };
const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const card: React.CSSProperties = {
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(0,255,170,0.25)",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
};
const inp: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(0,255,170,0.3)",
    borderRadius: 4,
    padding: "6px 8px",
    color: "#fff",
    fontFamily: "ui-monospace,monospace",
};
const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.5)",
    color: "#aafff0",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
};
const btnPos: React.CSSProperties = { ...btn, borderColor: "#7eff9f", color: "#7eff9f" };
const btnNeg: React.CSSProperties = { ...btn, borderColor: "#ff6b6b", color: "#ff6b6b" };
