import { useId, useRef } from "react";

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
    const inputRef = useRef<HTMLInputElement>(null);
    const tooLarge = !!(file && maxBytes && file.size > maxBytes);

    return (
        <div
            style={{
                display: "flex",
                alignItems: "stretch",
                gap: 8,
                background: "rgba(0,0,0,0.5)",
                border: tooLarge ? "1px solid #ff6b6b" : "1px solid rgba(0,255,170,0.3)",
                borderRadius: 4,
                padding: 4,
                fontFamily: "ui-monospace,monospace",
            }}
        >
            <input
                ref={inputRef}
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
                style={{
                    background: "rgba(0,255,170,0.15)",
                    border: "1px solid rgba(0,255,170,0.5)",
                    color: "#aafff0",
                    padding: "8px 14px",
                    borderRadius: 3,
                    cursor: disabled ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    opacity: disabled ? 0.5 : 1,
                    userSelect: "none",
                    display: "inline-flex",
                    alignItems: "center",
                }}
            >
                {file ? replaceLabel : chooseLabel}
            </label>
            <div
                style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "0 6px",
                    fontSize: 13,
                    color: file ? "#fff" : "rgba(170,255,240,0.55)",
                }}
            >
                {file ? (
                    <>
                        <div
                            style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%",
                            }}
                            title={file.name}
                        >
                            {file.name}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.7, color: tooLarge ? "#ff6b6b" : undefined }}>
                            {formatBytes(file.size)}
                            {maxBytes ? ` / ${formatBytes(maxBytes)} max` : ""}
                            {tooLarge ? " — TOO LARGE" : ""}
                        </div>
                    </>
                ) : (
                    <span>No file selected</span>
                )}
            </div>
            {file && (
                <button
                    type="button"
                    onClick={() => {
                        onChange(null);
                        if (inputRef.current) inputRef.current.value = "";
                    }}
                    title="Clear"
                    style={{
                        background: "transparent",
                        border: "1px solid rgba(255,107,107,0.4)",
                        color: "#ff6b6b",
                        padding: "0 10px",
                        borderRadius: 3,
                        cursor: "pointer",
                        fontFamily: "ui-monospace,monospace",
                        fontSize: 14,
                    }}
                >
                    ×
                </button>
            )}
        </div>
    );
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
