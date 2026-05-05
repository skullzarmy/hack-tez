import { useId } from "react";

/**
 * FilePicker — accessible custom-styled file input.
 * Hides the native input behind a styled label-button and shows a separate
 * filename + size readout. Native input still drives keyboard/screenreader UX.
 */
export interface FilePickerProps {
    file: File | null;
    onChange: (f: File | null) => void;
    accept?: string;
    maxBytes?: number;
    /** Button label when no file is chosen. */
    chooseLabel?: string;
    /** Button label when a file is already chosen. */
    replaceLabel?: string;
    required?: boolean;
    disabled?: boolean;
}

export default function FilePicker({
    file,
    onChange,
    accept = ".zip,application/zip",
    maxBytes,
    chooseLabel = "Choose file",
    replaceLabel = "Replace file",
    required,
    disabled,
}: FilePickerProps) {
    const id = useId();
    const tooLarge = !!(file && maxBytes && file.size > maxBytes);

    const dropAreaClass =
        "arcade-droparea" +
        (tooLarge ? " arcade-droparea--err" : "") +
        (disabled ? " arcade-droparea--disabled" : "");

    return (
        <div
            className={dropAreaClass}
            style={{ flexDirection: "row", alignItems: "stretch", padding: 4, gap: 8 }}
        >
            <input
                id={id}
                type="file"
                accept={accept}
                required={required}
                disabled={disabled}
                onChange={(e) => onChange(e.target.files?.[0] ?? null)}
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
            <label
                htmlFor={id}
                className="arcade-btn"
                style={{
                    cursor: disabled ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    display: "inline-flex",
                    alignItems: "center",
                    margin: 0,
                }}
            >
                {file ? replaceLabel : chooseLabel}
            </label>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, overflow: "hidden" }}>
                {file ? (
                    <>
                        <div
                            style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: 12,
                                maxWidth: "100%",
                            }}
                        >
                            {file.name}
                        </div>
                        <div className="arcade-meta" style={{ fontSize: 11, marginTop: 2 }}>
                            {tooLarge && (
                                <span style={{ color: "var(--err)", marginRight: 6 }}>
                                    ⚠ {(file.size / 1024 / 1024).toFixed(1)} MB exceeds limit
                                    {maxBytes ? ` (max ${(maxBytes / 1024 / 1024).toFixed(0)} MB)` : ""}
                                </span>
                            )}
                            {!tooLarge && (
                                <span>{(file.size / 1024).toFixed(0)} KB</span>
                            )}
                            <button
                                type="button"
                                onClick={() => onChange(null)}
                                disabled={disabled}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--err)",
                                    cursor: "pointer",
                                    fontSize: 11,
                                    padding: "0 0 0 8px",
                                    fontFamily: "var(--font)",
                                }}
                            >
                                Remove
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="arcade-meta" style={{ fontSize: 12 }}>
                        No file chosen{required ? " (required)" : ""}
                    </div>
                )}
            </div>
        </div>
    );
}
