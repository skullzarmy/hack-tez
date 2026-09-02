import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTezos } from "../../context/TezosContext";
import { submitArcadeGame } from "../../hooks/useArcade";
import FilePicker from "./FilePicker";
import Modal from "./ui/Modal";

const Sandbox = lazy(() => import("./Sandbox"));

const CATEGORIES = ["action", "puzzle", "arcade", "rpg", "shooter", "platform", "other"];
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const COVER_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_TITLE = 80;
const MAX_DESC = 600;
const SDK_RAW_URL = "https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.js";
const TEMPLATE_TREE_URL = "https://github.com/skullzarmy/hack-tez/tree/main/hackcade/template";

export default function GameSubmit() {
    const nav = useNavigate();
    const { activeDomain, primaryDomain, address, chatDomains, connect } = useTezos();
    const submitDomain = activeDomain ?? primaryDomain ?? chatDomains[0] ?? null;
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("arcade");
    const [sourceUrl, setSourceUrl] = useState("");
    const [maxPossibleScore, setMaxPossibleScore] = useState("");
    const [maxScorePerSecond, setMaxScorePerSecond] = useState("");
    const [zip, setZip] = useState<File | null>(null);
    const [cover, setCover] = useState<File | null>(null);
    const [showAntiCheat, setShowAntiCheat] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ slug: string; ipfsCid: string } | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);

    const validation = useMemo(() => {
        if (!title.trim()) return "Title is required";
        if (title.length > MAX_TITLE) return `Title is over ${MAX_TITLE} chars`;
        if (description.length > MAX_DESC) return `Description is over ${MAX_DESC} chars`;
        if (!cover) return "Cover image is required";
        if (cover.size > MAX_COVER_BYTES) return `Cover is too large (${(cover.size / 1024 / 1024).toFixed(1)} MB, max 2 MB)`;
        if (!zip) return "Zip is required";
        if (zip.size > MAX_ZIP_BYTES) return `Zip is too large (${(zip.size / 1024 / 1024).toFixed(1)} MB)`;
        return null;
    }, [title, description, zip, cover]);

    if (!address || !submitDomain) {
        return (
            <div className="arcade-card">
                <h2 style={{ marginTop: 0 }}>Submit a game</h2>
                <p style={{ opacity: 0.85, fontSize: 13 }}>
                    You need a hack.tez name to submit so players know who built it.
                </p>
                {!address ? (
                    <button type="button" className="arcade-btn arcade-btn--primary" onClick={() => void connect()}>
                        Connect wallet
                    </button>
                ) : (
                    <p style={{ fontSize: 13 }}>
                        Claim a name on the{" "}
                        <a href="/" className="arcade-link">
                            home page
                        </a>
                        .
                    </p>
                )}
            </div>
        );
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (validation || !zip || !cover) {
            setError(validation);
            return;
        }
        setError(null);
        const fd = new FormData();
        fd.set("title", title);
        fd.set("description", description);
        fd.set("category", category);
        if (sourceUrl) fd.set("sourceUrl", sourceUrl);
        if (maxPossibleScore) fd.set("maxPossibleScore", maxPossibleScore);
        if (maxScorePerSecond) fd.set("maxScorePerSecond", maxScorePerSecond);
        fd.set("cover", cover);
        fd.set("zip", zip);
        setSubmitting(true);
        try {
            const res = await submitArcadeGame(fd);
            setSuccess(res);
        } catch (e2) {
            setError(e2 instanceof Error ? e2.message : "Submit failed");
        } finally {
            setSubmitting(false);
        }
    }

    if (success) {
        return (
            <div className="arcade-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ok)", boxShadow: "0 0 10px var(--ok)" }} />
                    <h2 style={{ margin: 0, color: "var(--ok)", letterSpacing: 1 }}>SUBMITTED FOR REVIEW</h2>
                </div>
                <p style={{ fontSize: 13, opacity: 0.9 }}>
                    Your game <strong>{success.slug}</strong> is in the admin queue. You'll
                    see it in the lobby once approved — usually within a day.
                </p>
                <p className="arcade-meta" style={{ fontSize: 11 }}>
                    Bundle: {success.ipfsCid}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" className="arcade-btn arcade-btn--primary" onClick={() => nav("/arcade/my-games")}>
                        My games
                    </button>
                    <button type="button" className="arcade-btn" onClick={() => nav("/arcade")}>
                        Back to lobby
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} style={{ maxWidth: 560, margin: "0 auto" }}>
            <div className="arcade-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ margin: 0 }}>Submit a game</h2>
                    <span className="arcade-meta">
                        as <strong style={{ color: "var(--accent)" }}>{submitDomain}</strong>
                    </span>
                </div>
                <p className="arcade-meta" style={{ marginTop: 6 }}>
                    Read the{" "}
                    <a href="/developers#arcade" target="_blank" rel="noopener noreferrer" className="arcade-link">
                        Docs
                    </a>{", "}
                    <a href="/skills/hackcade-sdk" target="_blank" rel="noopener noreferrer" className="arcade-link">
                        Hackcade SDK skill
                    </a>{" "}
                    or grab files directly:
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <a href={SDK_RAW_URL} target="_blank" rel="noopener noreferrer" className="arcade-pill">
                        ↓ hackcade-sdk.js
                    </a>
                    <a href={TEMPLATE_TREE_URL} target="_blank" rel="noopener noreferrer" className="arcade-pill">
                        ↗ template/
                    </a>
                    <a href="/arcade/sandbox" target="_blank" rel="noopener noreferrer" className="arcade-pill">
                        ↗ Open Sandbox
                    </a>
                </div>
            </div>

            <Section title="Basics">
                <Field label="Title" hint={`${title.length}/${MAX_TITLE}`}>
                    <input
                        className="arcade-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                        required
                        placeholder="What's your game called?"
                    />
                </Field>
                <Field label="Description" hint={`${description.length}/${MAX_DESC}`}>
                    <textarea
                        className="arcade-textarea"
                        style={{ minHeight: 84, resize: "vertical" }}
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
                        placeholder="One or two sentences about gameplay."
                    />
                </Field>
                <Field label="Category">
                    <select className="arcade-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Source URL" hint="optional">
                    <input
                        className="arcade-input"
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://github.com/you/your-game"
                    />
                </Field>
            </Section>

            <Section
                title="Anti-cheat caps"
                hint="optional"
                collapsible
                open={showAntiCheat}
                onToggle={() => setShowAntiCheat((s) => !s)}
            >
                <p className="arcade-meta" style={{ margin: "0 0 6px" }}>
                    Server rejects submitted scores that exceed these caps. Leave blank if unsure.
                </p>
                <Field label="Max possible score">
                    <input
                        className="arcade-input"
                        type="number"
                        min={0}
                        value={maxPossibleScore}
                        onChange={(e) => setMaxPossibleScore(e.target.value)}
                    />
                </Field>
                <Field label="Max score per second">
                    <input
                        className="arcade-input"
                        type="number"
                        min={0}
                        value={maxScorePerSecond}
                        onChange={(e) => setMaxScorePerSecond(e.target.value)}
                    />
                </Field>
            </Section>

            <Section title="Cover image" hint="square works best · ≤ 2 MB · PNG/JPEG/WebP/GIF">
                <FilePicker
                    file={cover}
                    onChange={setCover}
                    accept={COVER_ACCEPT}
                    maxBytes={MAX_COVER_BYTES}
                    chooseLabel="Drop cover or click"
                    replaceLabel="Drop or click to replace"
                    preview="image"
                    required
                />
            </Section>

            <Section title="Game build" hint="≤ 5 MB zip">
                <FilePicker file={zip} onChange={setZip} maxBytes={MAX_ZIP_BYTES} required />
                {zip && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        <button type="button" className="arcade-btn" onClick={() => setPreviewOpen(true)}>
                            ▶ Preview locally
                        </button>
                        <span className="arcade-meta">
                            Runs in your browser — nothing is uploaded. Recommended before submitting.
                        </span>
                    </div>
                )}
            </Section>

            {error && (
                <div role="alert" className="arcade-err-block" style={{ margin: "12px 0" }}>
                    {error}
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                {validation && (
                    <span className="arcade-meta" style={{ color: "var(--warn)", alignSelf: "center" }}>
                        {validation}
                    </span>
                )}
                <button type="submit" className="arcade-btn arcade-btn--primary" disabled={submitting || !!validation}>
                    {submitting ? "Submitting…" : "Submit for review"}
                </button>
            </div>

            <Modal
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                title="Local preview"
                width={760}
            >
                <Suspense fallback={<div style={{ padding: 24, fontSize: 12, opacity: 0.8 }}>Loading sandbox…</div>}>
                    {zip && <Sandbox initialZip={zip} compact />}
                </Suspense>
            </Modal>
        </form>
    );
}

function Section({
    title,
    hint,
    children,
    collapsible,
    open,
    onToggle,
}: {
    title: string;
    hint?: string;
    children: React.ReactNode;
    collapsible?: boolean;
    open?: boolean;
    onToggle?: () => void;
}) {
    return (
        <div className="arcade-card">
            <button
                type="button"
                onClick={collapsible ? onToggle : undefined}
                disabled={!collapsible}
                style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    width: "100%",
                    textAlign: "left",
                    color: "inherit",
                    fontFamily: "var(--font)",
                    cursor: collapsible ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: open === false ? 0 : 10,
                }}
            >
                <span className="arcade-section-header">{title}</span>
                {hint && <span className="arcade-meta">{hint}</span>}
                {collapsible && (
                    <span className="arcade-meta" style={{ marginLeft: "auto" }}>{open ? "▾" : "▸"}</span>
                )}
            </button>
            {open !== false && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
            )}
        </div>
    );
}

function Field({ label, children, hint }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label
            // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as {children} and rendered inside this label, which biome cannot follow through the prop
            style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}
        >
            <span style={{ display: "flex", justifyContent: "space-between", opacity: 0.85 }}>
                <span>{label}</span>
                {hint && <span style={{ opacity: 0.55 }}>{hint}</span>}
            </span>
            {children}
        </label>
    );
}
