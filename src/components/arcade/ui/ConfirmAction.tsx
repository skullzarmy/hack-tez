import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Modal from "./Modal";

type Variant = "primary" | "danger" | "warning";

interface ReasonSpec {
    required?: boolean;
    label?: string;
    placeholder?: string;
    minLength?: number;
    maxLength?: number;
    multiline?: boolean;
}

interface ConfirmActionProps {
    open: boolean;
    title: string;
    message?: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    variant?: Variant;
    reason?: ReasonSpec;
    onConfirm: (reason?: string) => Promise<void> | void;
    onClose: () => void;
}

export default function ConfirmAction({
    open,
    title,
    message,
    confirmLabel,
    cancelLabel = "Cancel",
    variant = "primary",
    reason,
    onConfirm,
    onClose,
}: ConfirmActionProps) {
    const titleId = useId();
    const [reasonText, setReasonText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) {
            setReasonText("");
            setBusy(false);
            setError(null);
            return;
        }
        const t = window.setTimeout(() => {
            if (reason) textareaRef.current?.focus();
            else confirmRef.current?.focus();
        }, 30);
        return () => window.clearTimeout(t);
    }, [open, reason]);

    const reasonMin = reason?.minLength ?? (reason?.required ? 4 : 0);
    const reasonMax = reason?.maxLength ?? 500;
    const trimmed = reasonText.trim();
    const reasonValid = !reason?.required || trimmed.length >= reasonMin;
    const canSubmit = !busy && reasonValid;

    async function handleConfirm() {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        try {
            await onConfirm(reason ? trimmed || undefined : undefined);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Action failed");
            setBusy(false);
            return;
        }
        setBusy(false);
        onClose();
    }

    const accent = variant === "danger" ? "#ff6b6b" : variant === "warning" ? "#ffe66d" : "#7eff9f";

    return (
        <Modal open={open} onClose={busy ? () => {} : onClose} dismissable={!busy} labelledBy={titleId} width={460}>
            <div style={{ padding: "18px 20px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span
                        aria-hidden="true"
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: accent,
                            boxShadow: `0 0 10px ${accent}`,
                        }}
                    />
                    <h2 id={titleId} style={{ margin: 0, fontSize: 14, color: accent, letterSpacing: 1 }}>
                        {title.toUpperCase()}
                    </h2>
                </div>
                {message && (
                    <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6, lineHeight: 1.5 }}>{message}</div>
                )}
                {reason && (
                    <label style={{ display: "block", marginTop: 14, fontSize: 12 }}>
                        <span style={{ opacity: 0.85 }}>
                            {reason.label ?? "Reason"}
                            {reason.required ? " *" : " (optional)"}
                        </span>
                        <textarea
                            ref={textareaRef}
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value.slice(0, reasonMax))}
                            placeholder={reason.placeholder ?? ""}
                            rows={3}
                            disabled={busy}
                            style={{
                                marginTop: 4,
                                width: "100%",
                                background: "rgba(0,0,0,0.5)",
                                border: "1px solid rgba(0,255,170,0.3)",
                                borderRadius: 4,
                                padding: "6px 8px",
                                color: "#fff",
                                fontFamily: "ui-monospace,monospace",
                                fontSize: 13,
                                resize: "vertical",
                                minHeight: 70,
                                boxSizing: "border-box",
                            }}
                            onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                    e.preventDefault();
                                    void handleConfirm();
                                }
                            }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                            <span>{reason.required ? `min ${reasonMin}` : ""}</span>
                            <span>
                                {trimmed.length}/{reasonMax}
                            </span>
                        </div>
                    </label>
                )}
                {error && (
                    <div
                        role="alert"
                        style={{
                            marginTop: 12,
                            padding: "8px 10px",
                            border: "1px solid rgba(255,107,107,0.4)",
                            borderRadius: 4,
                            color: "#ff8a8a",
                            fontSize: 12,
                            background: "rgba(255,107,107,0.08)",
                        }}
                    >
                        {error}
                    </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                    <button type="button" onClick={onClose} disabled={busy} style={btnGhost}>
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={() => void handleConfirm()}
                        disabled={!canSubmit}
                        style={{
                            ...btnGhost,
                            border: `1px solid ${accent}`,
                            color: accent,
                            background: canSubmit ? `${accent}14` : "transparent",
                            opacity: canSubmit ? 1 : 0.5,
                            cursor: canSubmit ? "pointer" : "not-allowed",
                        }}
                    >
                        {busy ? "Working…" : confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

const btnGhost: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.5)",
    color: "#aafff0",
    padding: "8px 14px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
    fontSize: 13,
};
