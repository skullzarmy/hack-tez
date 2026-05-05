import { useState } from "react";
import { editArcadeGame, gameIframeUrl } from "../../hooks/useArcade";
import FilePicker from "./FilePicker";

const CATEGORIES = ["action", "puzzle", "arcade", "rpg", "shooter", "platform", "other"];
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const MAX_DESC = 600;

export interface EditableGame {
    slug: string;
    title: string;
    description: string;
    category: string;
    sourceUrl?: string | null;
    maxPossibleScore?: number | null;
    maxScorePerSecond?: number | null;
    status?: string;
    ipfsCid?: string;
    version?: number;
}

export default function EditGameForm({
    game,
    onSaved,
    onCancel,
}: {
    game: EditableGame;
    onSaved: () => void;
    onCancel: () => void;
}) {
    const isPending = (game.status ?? "active") === "pending";

    const initial = {
        description: game.description ?? "",
        category: game.category ?? "arcade",
        sourceUrl: game.sourceUrl ?? "",
        maxPossibleScore: game.maxPossibleScore != null ? String(game.maxPossibleScore) : "",
        maxScorePerSecond: game.maxScorePerSecond != null ? String(game.maxScorePerSecond) : "",
    };

    const [description, setDescription] = useState(initial.description);
    const [category, setCategory] = useState(initial.category);
    const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
    const [maxPossibleScore, setMaxPossibleScore] = useState(initial.maxPossibleScore);
    const [maxScorePerSecond, setMaxScorePerSecond] = useState(initial.maxScorePerSecond);
    const [zip, setZip] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty =
        description !== initial.description ||
        category !== initial.category ||
        sourceUrl !== initial.sourceUrl ||
        maxPossibleScore !== initial.maxPossibleScore ||
        maxScorePerSecond !== initial.maxScorePerSecond ||
        zip !== null;

    function reset() {
        setDescription(initial.description);
        setCategory(initial.category);
        setSourceUrl(initial.sourceUrl);
        setMaxPossibleScore(initial.maxPossibleScore);
        setMaxScorePerSecond(initial.maxScorePerSecond);
        setZip(null);
        setError(null);
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (zip && zip.size > MAX_ZIP_BYTES) {
            setError(`Zip is too large (${(zip.size / 1024 / 1024).toFixed(1)} MB, max 5 MB).`);
            return;
        }
        setBusy(true);
        try {
            if (zip) {
                const fd = new FormData();
                fd.set("description", description);
                fd.set("category", category);
                fd.set("sourceUrl", sourceUrl);
                if (maxPossibleScore) fd.set("maxPossibleScore", maxPossibleScore);
                if (maxScorePerSecond) fd.set("maxScorePerSecond", maxScorePerSecond);
                fd.set("zip", zip);
                await editArcadeGame(game.slug, fd);
            } else {
                await editArcadeGame(game.slug, {
                    description,
                    category,
                    sourceUrl,
                    maxPossibleScore: maxPossibleScore ? Number(maxPossibleScore) : null,
                    maxScorePerSecond: maxScorePerSecond ? Number(maxScorePerSecond) : null,
                });
            }
            onSaved();
        } catch (e2) {
            setError(e2 instanceof Error ? e2.message : "Save failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={onSubmit} style={form}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12, opacity: 0.85 }}>
                <span>
                    Editing <strong style={{ color: "#fff" }}>{game.title}</strong>
                </span>
                {game.ipfsCid && (
                    <a
                        href={gameIframeUrl(game.ipfsCid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#aafff0", fontSize: 11, opacity: 0.8 }}
                    >
                        Preview current ↗
                    </a>
                )}
            </div>
            {!isPending && (
                <div
                    style={{
                        fontSize: 11,
                        color: "#ffe66d",
                        background: "rgba(255,230,109,0.08)",
                        border: "1px solid rgba(255,230,109,0.3)",
                        borderRadius: 4,
                        padding: "6px 8px",
                    }}
                >
                    Already approved — zip swaps require an Update (not allowed here).
                </div>
            )}

            <Field label="Description" hint={`${description.length}/${MAX_DESC}`}>
                <textarea
                    style={{ ...inp, minHeight: 70, resize: "vertical" }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
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
                <input style={inp} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </Field>
            <Field label="Max possible score" hint="optional">
                <input
                    style={inp}
                    type="number"
                    min={0}
                    value={maxPossibleScore}
                    onChange={(e) => setMaxPossibleScore(e.target.value)}
                />
            </Field>
            <Field label="Max score per second" hint="optional">
                <input
                    style={inp}
                    type="number"
                    min={0}
                    value={maxScorePerSecond}
                    onChange={(e) => setMaxScorePerSecond(e.target.value)}
                />
            </Field>

            {isPending && (
                <Field label="Replace zip" hint="optional, ≤ 5 MB">
                    <FilePicker
                        file={zip}
                        onChange={setZip}
                        maxBytes={MAX_ZIP_BYTES}
                        chooseLabel="Choose new zip"
                        replaceLabel="Pick another"
                    />
                </Field>
            )}

            {error && <div style={{ color: "#ff8a8a", fontSize: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="submit" style={btnPrimary} disabled={busy || !dirty}>
                    {busy ? "Saving…" : "Save changes"}
                </button>
                <button type="button" style={btn} onClick={reset} disabled={busy || !dirty} title="Revert">
                    Reset
                </button>
                <button type="button" style={btn} onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

const form: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(0,255,170,0.25)",
    borderRadius: 6,
    color: "#aafff0",
    fontFamily: "ui-monospace,monospace",
};
const inp: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(0,255,170,0.3)",
    borderRadius: 4,
    padding: "6px 8px",
    color: "#fff",
    fontFamily: "ui-monospace,monospace",
    fontSize: 13,
};
const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.5)",
    color: "#aafff0",
    padding: "6px 14px",
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
