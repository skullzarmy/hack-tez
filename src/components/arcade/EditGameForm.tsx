import { useState } from "react";
import { editArcadeGame, gameCoverUrl, gameIframeUrl } from "../../hooks/useArcade";
import FilePicker from "./FilePicker";

const CATEGORIES = ["action", "puzzle", "arcade", "rpg", "shooter", "platform", "other"];
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const COVER_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
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
    coverKey?: string | null;
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
    const [cover, setCover] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty =
        description !== initial.description ||
        category !== initial.category ||
        sourceUrl !== initial.sourceUrl ||
        maxPossibleScore !== initial.maxPossibleScore ||
        maxScorePerSecond !== initial.maxScorePerSecond ||
        zip !== null ||
        cover !== null;

    function reset() {
        setDescription(initial.description);
        setCategory(initial.category);
        setSourceUrl(initial.sourceUrl);
        setMaxPossibleScore(initial.maxPossibleScore);
        setMaxScorePerSecond(initial.maxScorePerSecond);
        setZip(null);
        setCover(null);
        setError(null);
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (zip && zip.size > MAX_ZIP_BYTES) {
            setError(`Zip is too large (${(zip.size / 1024 / 1024).toFixed(1)} MB, max 5 MB).`);
            return;
        }
        if (cover && cover.size > MAX_COVER_BYTES) {
            setError(`Cover is too large (${(cover.size / 1024 / 1024).toFixed(1)} MB, max 2 MB).`);
            return;
        }
        setBusy(true);
        try {
            if (zip || cover) {
                const fd = new FormData();
                fd.set("description", description);
                fd.set("category", category);
                fd.set("sourceUrl", sourceUrl);
                if (maxPossibleScore) fd.set("maxPossibleScore", maxPossibleScore);
                if (maxScorePerSecond) fd.set("maxScorePerSecond", maxScorePerSecond);
                if (zip) fd.set("zip", zip);
                if (cover) fd.set("cover", cover);
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
        <form
            onSubmit={onSubmit}
            className="arcade-card"
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12, opacity: 0.85 }}>
                <span>
                    Editing <strong>{game.title}</strong>
                </span>
                {game.ipfsCid && (
                    <a
                        href={gameIframeUrl(game.ipfsCid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="arcade-link"
                        style={{ fontSize: 11 }}
                    >
                        Preview current ↗
                    </a>
                )}
            </div>
            {!isPending && (
                <div className="arcade-notice-block">
                    Already approved — zip swaps require an Update (not allowed here).
                </div>
            )}

            <Field label="Description" hint={`${description.length}/${MAX_DESC}`}>
                <textarea
                    className="arcade-textarea"
                    style={{ minHeight: 70, resize: "vertical" }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
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
                <input className="arcade-input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </Field>
            <Field label="Max possible score" hint="optional">
                <input
                    className="arcade-input"
                    type="number"
                    min={0}
                    value={maxPossibleScore}
                    onChange={(e) => setMaxPossibleScore(e.target.value)}
                />
            </Field>
            <Field label="Max score per second" hint="optional">
                <input
                    className="arcade-input"
                    type="number"
                    min={0}
                    value={maxScorePerSecond}
                    onChange={(e) => setMaxScorePerSecond(e.target.value)}
                />
            </Field>

            <Field label="Cover image" hint="optional · ≤ 2 MB · square works best">
                <FilePicker
                    file={cover}
                    onChange={setCover}
                    accept={COVER_ACCEPT}
                    maxBytes={MAX_COVER_BYTES}
                    chooseLabel="Drop new cover or click"
                    replaceLabel="Drop or click to replace"
                    preview="image"
                    initialPreviewUrl={gameCoverUrl(game.coverKey ?? null)}
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

            {error && (
                <div role="alert" className="arcade-err-block">
                    {error}
                </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="submit" className="arcade-btn arcade-btn--primary" disabled={busy || !dirty}>
                    {busy ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="arcade-btn" onClick={reset} disabled={busy || !dirty} title="Revert">
                    Reset
                </button>
                <button type="button" className="arcade-btn" onClick={onCancel} disabled={busy}>
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
