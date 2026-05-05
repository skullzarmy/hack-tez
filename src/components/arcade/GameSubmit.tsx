import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTezos } from "../../context/TezosContext";
import { submitArcadeGame } from "../../hooks/useArcade";
import FilePicker from "./FilePicker";

const CATEGORIES = ["action", "puzzle", "arcade", "rpg", "shooter", "platform", "other"];
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const MAX_TITLE = 80;
const MAX_DESC = 600;
const SDK_RAW_URL = "https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.js";
const TEMPLATE_TREE_URL = "https://github.com/skullzarmy/hack-tez/tree/main/hackcade/template";

export default function GameSubmit() {
    const nav = useNavigate();
    const { activeDomain, address, chatDomains, connect } = useTezos();
    const submitDomain = activeDomain ?? chatDomains[0] ?? null;
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("arcade");
    const [sourceUrl, setSourceUrl] = useState("");
    const [maxPossibleScore, setMaxPossibleScore] = useState("");
    const [maxScorePerSecond, setMaxScorePerSecond] = useState("");
    const [zip, setZip] = useState<File | null>(null);
    const [showAntiCheat, setShowAntiCheat] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ slug: string; ipfsCid: string } | null>(null);

    const validation = useMemo(() => {
        if (!title.trim()) return "Title is required";
        if (title.length > MAX_TITLE) return `Title is over ${MAX_TITLE} chars`;
        if (description.length > MAX_DESC) return `Description is over ${MAX_DESC} chars`;
        if (!zip) return "Zip is required";
        if (zip.size > MAX_ZIP_BYTES) return `Zip is too large (${(zip.size / 1024 / 1024).toFixed(1)} MB)`;
        return null;
    }, [title, description, zip]);

    if (!address || !submitDomain) {
        return (
            <Card>
                <h2 style={{ marginTop: 0 }}>Submit a game</h2>
                <p style={{ opacity: 0.85, fontSize: 13 }}>
                    You need a hack.tez name to submit so players know who built it.
                </p>
                {!address ? (
                    <button style={btnPrimary} onClick={() => void connect()}>
                        Connect wallet
                    </button>
                ) : (
                    <p style={{ fontSize: 13 }}>
                        Claim a name on the{" "}
                        <a href="/" style={{ color: "#ffe66d" }}>
                            home page
                        </a>
                        .
                    </p>
                )}
            </Card>
        );
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (validation || !zip) {
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
            <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "#7eff9f", boxShadow: "0 0 10px #7eff9f" }} />
                    <h2 style={{ margin: 0, color: "#7eff9f", letterSpacing: 1 }}>SUBMITTED FOR REVIEW</h2>
                </div>
                <p style={{ fontSize: 13, opacity: 0.9 }}>
                    Your game <strong style={{ color: "#fff" }}>{success.slug}</strong> is in the admin queue. You'll
                    see it in the lobby once approved — usually within a day.
                </p>
                <p style={{ opacity: 0.6, fontSize: 11, fontFamily: "ui-monospace,monospace" }}>
                    IPFS: {success.ipfsCid}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={btnPrimary} onClick={() => nav("/arcade/my-games")}>
                        My games
                    </button>
                    <button style={btn} onClick={() => nav("/arcade")}>
                        Back to lobby
                    </button>
                </div>
            </Card>
        );
    }

    return (
        <form onSubmit={onSubmit} style={{ maxWidth: 560, margin: "0 auto" }}>
            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ margin: 0 }}>Submit a game</h2>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>
                        as <strong style={{ color: "#aafff0" }}>{submitDomain}</strong>
                    </span>
                </div>
                <p style={{ fontSize: 12, opacity: 0.75, margin: "6px 0 0" }}>
                    Read the{" "}
                    <a href="/skills/hackcade-sdk" style={{ color: "#ffe66d" }}>
                        Hackcade SDK skill
                    </a>{" "}
                    or grab files directly:
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <a href={SDK_RAW_URL} target="_blank" rel="noopener noreferrer" style={pillLink}>
                        ↓ hackcade-sdk.js
                    </a>
                    <a href={TEMPLATE_TREE_URL} target="_blank" rel="noopener noreferrer" style={pillLink}>
                        ↗ template/
                    </a>
                </div>
            </Card>

            <Section title="Basics">
                <Field label="Title" hint={`${title.length}/${MAX_TITLE}`}>
                    <input
                        style={inp}
                        value={title}
                        onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                        required
                        placeholder="What's your game called?"
                    />
                </Field>
                <Field label="Description" hint={`${description.length}/${MAX_DESC}`}>
                    <textarea
                        style={{ ...inp, minHeight: 84, resize: "vertical" }}
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
                        placeholder="One or two sentences about gameplay."
                    />
                </Field>
                <Field label="Category">
                    <select style={inp} value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Source URL" hint="optional">
                    <input
                        style={inp}
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
                <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 6px" }}>
                    Server rejects submitted scores that exceed these caps. Leave blank if unsure.
                </p>
                <Field label="Max possible score">
                    <input
                        style={inp}
                        type="number"
                        min={0}
                        value={maxPossibleScore}
                        onChange={(e) => setMaxPossibleScore(e.target.value)}
                    />
                </Field>
                <Field label="Max score per second">
                    <input
                        style={inp}
                        type="number"
                        min={0}
                        value={maxScorePerSecond}
                        onChange={(e) => setMaxScorePerSecond(e.target.value)}
                    />
                </Field>
            </Section>

            <Section title="Game build" hint="≤ 5 MB zip">
                <FilePicker file={zip} onChange={setZip} maxBytes={MAX_ZIP_BYTES} required />
            </Section>

            {error && (
                <div
                    role="alert"
                    style={{
                        margin: "12px 0",
                        padding: "8px 10px",
                        border: "1px solid rgba(255,107,107,0.4)",
                        borderRadius: 4,
                        color: "#ff8a8a",
                        fontSize: 12,
                        background: "rgba(255,107,107,0.08)",
                        fontFamily: "ui-monospace,monospace",
                    }}
                >
                    {error}
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                {validation && (
                    <span style={{ fontSize: 12, color: "#ffe66d", alignSelf: "center", opacity: 0.85 }}>
                        {validation}
                    </span>
                )}
                <button type="submit" style={btnPrimary} disabled={submitting || !!validation}>
                    {submitting ? "Submitting…" : "Submit for review"}
                </button>
            </div>
        </form>
    );
}

function Card({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(0,255,170,0.25)",
                borderRadius: 8,
                padding: 16,
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
                marginBottom: 12,
            }}
        >
            {children}
        </div>
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
        <div
            style={{
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(0,255,170,0.25)",
                borderRadius: 8,
                padding: 14,
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
                marginBottom: 12,
            }}
        >
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
                    color: "#aafff0",
                    fontFamily: "ui-monospace,monospace",
                    cursor: collapsible ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: open === false ? 0 : 10,
                }}
            >
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                    {title}
                </span>
                {hint && <span style={{ opacity: 0.55, fontSize: 11 }}>{hint}</span>}
                {collapsible && (
                    <span style={{ marginLeft: "auto", opacity: 0.6, fontSize: 11 }}>{open ? "▾" : "▸"}</span>
                )}
            </button>
            {(open !== false) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
            )}
        </div>
    );
}

function Field({ label, children, hint }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ display: "flex", justifyContent: "space-between", opacity: 0.85 }}>
                <span>{label}</span>
                {hint && <span style={{ opacity: 0.55 }}>{hint}</span>}
            </span>
            {children}
        </label>
    );
}

const inp: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(0,255,170,0.3)",
    borderRadius: 4,
    padding: "8px 10px",
    color: "#fff",
    fontFamily: "ui-monospace,monospace",
    fontSize: 13,
};

const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.6)",
    color: "#aafff0",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
    fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
    ...btn,
    background: "rgba(0,255,170,0.18)",
    borderColor: "#7eff9f",
    color: "#7eff9f",
};

const pillLink: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    border: "1px solid rgba(0,255,170,0.4)",
    borderRadius: 999,
    color: "#aafff0",
    textDecoration: "none",
    fontFamily: "ui-monospace,monospace",
    fontSize: 12,
};
