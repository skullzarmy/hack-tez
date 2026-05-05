import { useState } from "react";
import { editArcadeGame } from "../../hooks/useArcade";
import FilePicker from "./FilePicker";

const CATEGORIES = ["action", "puzzle", "arcade", "rpg", "shooter", "platform", "other"];
const MAX_ZIP_BYTES = 5 * 1024 * 1024;

export interface EditableGame {
    slug: string;
    title: string;
    description: string;
    category: string;
    sourceUrl?: string | null;
    maxPossibleScore?: number | null;
    maxScorePerSecond?: number | null;
    status?: string;
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
    const [description, setDescription] = useState(game.description ?? "");
    const [category, setCategory] = useState(game.category ?? "arcade");
    const [sourceUrl, setSourceUrl] = useState(game.sourceUrl ?? "");
    const [maxPossibleScore, setMaxPossibleScore] = useState(
        game.maxPossibleScore != null ? String(game.maxPossibleScore) : "",
    );
    const [maxScorePerSecond, setMaxScorePerSecond] = useState(
        game.maxScorePerSecond != null ? String(game.maxScorePerSecond) : "",
    );
    const [zip, setZip] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            <div style={{ fontSize: 12, opacity: 0.7 }}>
                Editing <strong style={{ color: "#fff" }}>{game.title}</strong>
                {!isPending && (
                    <span style={{ marginLeft: 8, color: "#ffe66d" }}>
                        (already approved — zip swaps require an Update)
                    </span>
                )}
            </div>
            <Field label="Description (max 600)">
                <textarea
                    style={{ ...inp, minHeight: 70 }}
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
            <Field label="Source URL">
                <input style={inp} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </Field>
            <Field label="Max possible score (optional)">
                <input
                    style={inp}
                    type="number"
                    min={0}
                    value={maxPossibleScore}
                    onChange={(e) => setMaxPossibleScore(e.target.value)}
                />
            </Field>
            <Field label="Max score per second (optional)">
                <input
                    style={inp}
                    type="number"
                    min={0}
                    value={maxScorePerSecond}
                    onChange={(e) => setMaxScorePerSecond(e.target.value)}
                />
            </Field>
            {isPending && (
                <Field label="Replace zip (optional, ≤ 5 MB)">
                    <FilePicker
                        file={zip}
                        onChange={setZip}
                        maxBytes={MAX_ZIP_BYTES}
                        chooseLabel="Choose new zip"
                        replaceLabel="Pick another"
                    />
                </Field>
            )}
            {error && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={btnPrimary} disabled={busy}>
                    {busy ? "Saving…" : "Save changes"}
                </button>
                <button type="button" style={btn} onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ opacity: 0.85 }}>{label}</span>
            {children}
        </label>
    );
}

const form: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
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
const btnPrimary: React.CSSProperties = { ...btn, background: "rgba(0,255,170,0.15)" };
