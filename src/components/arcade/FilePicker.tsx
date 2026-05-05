import { useEffect, useId, useRef, useState } from "react";

/**
 * FilePicker — drag/drop + click file input, with optional image-preview mode.
 *
 * Drop a file anywhere on the area, or click to open the native picker. The
 * native <input type="file"> stays in the DOM (visually hidden) so keyboard
 * + screenreader users get the standard control.
 *
 * Set `preview="image"` to render the chosen file as a square thumbnail
 * (used for game cover uploads).
 */
export interface FilePickerProps {
    file: File | null;
    onChange: (f: File | null) => void;
    accept?: string;
    maxBytes?: number;
    chooseLabel?: string;
    replaceLabel?: string;
    required?: boolean;
    disabled?: boolean;
    /** "image" → show square thumbnail of chosen file. */
    preview?: "image";
    /** Existing remote URL to show when no local file is chosen yet (e.g. server-side cover). */
    initialPreviewUrl?: string | null;
}

/** Turn an `accept` attribute (".zip,application/zip" or ".png,image/*") into a short user-readable hint. */
function summarizeAccept(accept: string): string {
    const parts = accept.split(",").map((p) => p.trim()).filter(Boolean);
    const exts = new Set<string>();
    for (const p of parts) {
        if (p.startsWith(".")) {
            exts.add(p.slice(1).toUpperCase());
        } else if (p.endsWith("/*")) {
            exts.add(p.split("/")[0].toUpperCase());
        }
    }
    const list = [...exts];
    if (list.length === 0) return "any file";
    if (list.length <= 4) return list.join(", ");
    return list.slice(0, 4).join(", ") + "…";
}

export default function FilePicker({
    file,
    onChange,
    accept = ".zip,application/zip",
    maxBytes,
    chooseLabel = "Drop a file or click",
    replaceLabel = "Drop or click to replace",
    required,
    disabled,
    preview,
    initialPreviewUrl = null,
}: FilePickerProps) {
    const id = useId();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [over, setOver] = useState(false);
    const tooLarge = !!(file && maxBytes && file.size > maxBytes);

    // Generate a local object URL for image preview when a file is chosen.
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    useEffect(() => {
        if (preview !== "image" || !file) {
            setObjectUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setObjectUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file, preview]);

    const previewUrl = objectUrl ?? initialPreviewUrl;

    const cls =
        "arcade-droparea" +
        (over ? " arcade-droparea--over" : "") +
        (tooLarge ? " arcade-droparea--err" : "") +
        (disabled ? " arcade-droparea--disabled" : "");

    function handleFiles(list: FileList | null) {
        if (!list || !list.length) return;
        onChange(list[0]);
    }

    function openPicker() {
        if (disabled) return;
        inputRef.current?.click();
    }

    return (
        <div
            className={cls}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-labelledby={`${id}-label`}
            onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                openPicker();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPicker();
                }
            }}
            onDragOver={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!over) setOver(true);
            }}
            onDragEnter={(e) => {
                if (disabled) return;
                e.preventDefault();
                setOver(true);
            }}
            onDragLeave={(e) => {
                if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
                setOver(false);
            }}
            onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                if (disabled) return;
                handleFiles(e.dataTransfer.files);
            }}
            style={
                preview === "image"
                    ? {
                          flexDirection: "column",
                          aspectRatio: "1 / 1",
                          padding: 12,
                          minHeight: 0,
                          maxWidth: 240,
                          justifyContent: "center",
                          alignItems: "center",
                          textAlign: "center",
                      }
                    : undefined
            }
        >
            <input
                ref={inputRef}
                id={id}
                type="file"
                accept={accept}
                required={required}
                disabled={disabled}
                onChange={(e) => handleFiles(e.target.files)}
                style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0,0,0,0)",
                    border: 0,
                }}
            />

            {preview === "image" && previewUrl ? (
                <ImagePreview
                    src={previewUrl}
                    file={file}
                    tooLarge={tooLarge}
                    maxBytes={maxBytes}
                    onClear={() => onChange(null)}
                    disabled={disabled}
                />
            ) : preview === "image" ? (
                <EmptyImagePrompt
                    id={`${id}-label`}
                    accept={accept}
                    chooseLabel={chooseLabel}
                    required={required}
                    maxBytes={maxBytes}
                />
            ) : (
                <DefaultBody
                    id={`${id}-label`}
                    file={file}
                    accept={accept}
                    chooseLabel={chooseLabel}
                    replaceLabel={replaceLabel}
                    required={required}
                    disabled={disabled}
                    tooLarge={tooLarge}
                    maxBytes={maxBytes}
                    onClear={() => onChange(null)}
                />
            )}
        </div>
    );
}

function DefaultBody({
    id,
    file,
    accept,
    chooseLabel,
    replaceLabel,
    required,
    disabled,
    tooLarge,
    maxBytes,
    onClear,
}: {
    id: string;
    file: File | null;
    accept: string;
    chooseLabel: string;
    replaceLabel: string;
    required?: boolean;
    disabled?: boolean;
    tooLarge: boolean;
    maxBytes?: number;
    onClear: () => void;
}) {
    return (
        <>
            <div className="arcade-droparea__icon" aria-hidden>
                {file ? "📦" : "↥"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0 }}>
                <div id={id} style={{ fontSize: 13, fontWeight: 600 }}>
                    {file ? replaceLabel : chooseLabel}
                </div>
                {file ? (
                    <div className="arcade-meta" style={{ fontSize: 11, marginTop: 2, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span
                            style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                                flex: "1 1 auto",
                            }}
                            title={file.name}
                        >
                            {file.name}
                        </span>
                        <span style={{ flex: "0 0 auto" }}>
                            {tooLarge ? (
                                <span style={{ color: "var(--err)" }}>
                                    ⚠ {(file.size / 1024 / 1024).toFixed(1)} MB
                                    {maxBytes ? ` / ${(maxBytes / 1024 / 1024).toFixed(0)} MB max` : ""}
                                </span>
                            ) : (
                                <span>{file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span>
                            )}
                        </span>
                        <button
                            type="button"
                            onClick={onClear}
                            disabled={disabled}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--err)",
                                cursor: "pointer",
                                fontSize: 11,
                                padding: 0,
                                fontFamily: "var(--font)",
                                flex: "0 0 auto",
                            }}
                        >
                            Remove
                        </button>
                    </div>
                ) : (
                    <div
                        className="arcade-meta"
                        style={{
                            fontSize: 11,
                            marginTop: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                        title={accept}
                    >
                        {summarizeAccept(accept)}
                        {maxBytes ? ` · max ${(maxBytes / 1024 / 1024).toFixed(0)} MB` : ""}
                        {required ? " · required" : ""}
                    </div>
                )}
            </div>
        </>
    );
}

function ImagePreview({
    src,
    file,
    tooLarge,
    maxBytes,
    onClear,
    disabled,
}: {
    src: string;
    file: File | null;
    tooLarge: boolean;
    maxBytes?: number;
    onClear: () => void;
    disabled?: boolean;
}) {
    return (
        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <div
                style={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflow: "hidden",
                    borderRadius: 4,
                    background: "var(--bg-3)",
                }}
            >
                <img
                    src={src}
                    alt="cover preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
            </div>
            <div className="arcade-meta" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file?.name ?? "current cover"}>
                    {file?.name ?? "current cover"}
                </span>
                {file && (
                    <span style={{ flex: "0 0 auto", color: tooLarge ? "var(--err)" : undefined }}>
                        {(file.size / 1024).toFixed(0)} KB
                        {maxBytes && tooLarge ? ` / ${(maxBytes / 1024 / 1024).toFixed(0)} MB max` : ""}
                    </span>
                )}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClear();
                    }}
                    disabled={disabled}
                    style={{
                        background: "none",
                        border: "none",
                        color: "var(--err)",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: 0,
                        fontFamily: "var(--font)",
                        flex: "0 0 auto",
                    }}
                >
                    Remove
                </button>
            </div>
        </div>
    );
}

function EmptyImagePrompt({
    id,
    accept,
    chooseLabel,
    required,
    maxBytes,
}: {
    id: string;
    accept: string;
    chooseLabel: string;
    required?: boolean;
    maxBytes?: number;
}) {
    return (
        <>
            <div className="arcade-droparea__icon" aria-hidden style={{ marginBottom: 8 }}>
                🖼
            </div>
            <div id={id} style={{ fontSize: 13, fontWeight: 600 }}>
                {chooseLabel}
            </div>
            <div className="arcade-meta" style={{ fontSize: 11, marginTop: 4 }}>
                {summarizeAccept(accept)}
                {maxBytes ? ` · max ${(maxBytes / 1024 / 1024).toFixed(0)} MB` : ""}
                {required ? " · required" : ""}
            </div>
        </>
    );
}
