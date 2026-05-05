import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTezos } from "../../context/TezosContext";
import { submitArcadeGame } from "../../hooks/useArcade";
import FilePicker from "./FilePicker";

const CATEGORIES = ["action", "puzzle", "arcade", "rpg", "shooter", "platform", "other"];
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const SDK_RAW_URL =
    "https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.js";
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
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ slug: string; ipfsCid: string } | null>(null);

    if (!address || !submitDomain) {
        return (
            <div style={{ padding: 16, color: "#aafff0", fontFamily: "ui-monospace,monospace" }}>
                <h2>Submit a game</h2>
                <p>You need a hack.tez name to submit a game so players know who built it.</p>
                {!address ? (
                    <button style={btn} onClick={() => void connect()}>
                        Connect wallet
                    </button>
                ) : (
                    <p>
                        Claim a name on <a href="/" style={{ color: "#ffe66d" }}>the home page</a>.
                    </p>
                )}
            </div>
        );
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!zip) {
            setError("Choose a zip file.");
            return;
        }
        if (zip.size > MAX_ZIP_BYTES) {
            setError(`Zip is too large (${(zip.size / 1024 / 1024).toFixed(1)} MB, max 5 MB).`);
            return;
        }
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
            <div style={{ padding: 16, color: "#aafff0", fontFamily: "ui-monospace,monospace", maxWidth: 520 }}>
                <h2 style={{ color: "#ffe66d" }}>SUBMITTED</h2>
                <p>
                    Your game <strong>{success.slug}</strong> is awaiting admin review. You'll see it appear in the
                    lobby once approved.
                </p>
                <p style={{ opacity: 0.7, fontSize: 12 }}>IPFS: {success.ipfsCid}</p>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={btn} onClick={() => nav("/arcade/my-games")}>
                        My games
                    </button>
                    <button style={btn} onClick={() => nav("/arcade")}>
                        Lobby
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form
            onSubmit={onSubmit}
            style={{
                padding: 16,
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
                maxWidth: 520,
                display: "flex",
                flexDirection: "column",
                gap: 12,
            }}
        >
            <h2 style={{ margin: 0 }}>Submit a game</h2>
            <p style={{ opacity: 0.75, fontSize: 13, margin: 0 }}>
                Submitting as <strong>{submitDomain}</strong>. See the{" "}
                <a href="/skills/hackcade-sdk" style={{ color: "#ffe66d" }}>
                    Hackcade SDK skill
                </a>{" "}
                or grab files directly:
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                <a href={SDK_RAW_URL} target="_blank" rel="noopener noreferrer" style={pillLink}>
                    ↓ hackcade-sdk.js
                </a>
                <a href={TEMPLATE_TREE_URL} target="_blank" rel="noopener noreferrer" style={pillLink}>
                    ↗ template/
                </a>
            </div>

            <Field label="Title (max 80)">
                <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
            </Field>
            <Field label="Description (max 600)">
                <textarea
                    style={{ ...inp, minHeight: 80 }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={600}
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
            <Field label="Source URL (optional)">
                <input style={inp} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </Field>
            <Field label="Max possible score (optional anti-cheat cap)">
                <input
                    style={inp}
                    type="number"
                    min={0}
                    value={maxPossibleScore}
                    onChange={(e) => setMaxPossibleScore(e.target.value)}
                />
            </Field>
            <Field label="Max score per second (optional rate cap)">
                <input
                    style={inp}
                    type="number"
                    min={0}
                    value={maxScorePerSecond}
                    onChange={(e) => setMaxScorePerSecond(e.target.value)}
                />
            </Field>
            <Field label="Game zip (≤ 5 MB)">
                <FilePicker file={zip} onChange={setZip} maxBytes={MAX_ZIP_BYTES} required />
            </Field>
            {error && <div style={{ color: "#ff6b6b" }}>{error}</div>}
            <button style={{ ...btn, alignSelf: "flex-start" }} type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit for review"}
            </button>
        </form>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            <span style={{ opacity: 0.85 }}>{label}</span>
            {children}
        </label>
    );
}

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
    border: "1px solid rgba(0,255,170,0.6)",
    color: "#aafff0",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
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
};
