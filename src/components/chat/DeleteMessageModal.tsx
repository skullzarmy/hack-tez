import { useEffect, useState } from "react";
import { Trash2, X, Eye, EyeOff } from "lucide-react";

interface DeleteMessageModalProps {
    messageId: string;
    senderDomain: string;
    onConfirm: (messageId: string, reason: string, visible: boolean) => void;
    onClose: () => void;
}

export default function DeleteMessageModal({ messageId, senderDomain, onConfirm, onClose }: DeleteMessageModalProps) {
    // Escape closes the modal — the overlay click is a mouse-only convenience,
    // so without this there is no keyboard way out.
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);
    const [reason, setReason] = useState("");
    const [visible, setVisible] = useState(true);

    const handleSubmit = () => {
        if (!reason.trim()) return;
        onConfirm(messageId, reason.trim(), visible);
        onClose();
    };

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Escape closes this modal; the overlay click is a redundant mouse affordance
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes this modal; the overlay click is a redundant mouse affordance
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(2px)",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Delete message"
                style={{
                    background: "var(--bg-1, #111)",
                    border: "1px solid var(--border-2, #333)",
                    width: "100%",
                    maxWidth: "420px",
                    margin: "0 16px",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 20px",
                        borderBottom: "1px solid var(--border-2, #333)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Trash2 size={16} style={{ color: "#ff6b6b" }} />
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "13px",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                color: "var(--fg-1, #fff)",
                            }}
                        >
                            Delete message
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--fg-3, #888)",
                            padding: "8px",
                        }}
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: "20px" }}>
                    <p
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            color: "var(--fg-2, rgba(255,255,255,0.6))",
                            marginBottom: "16px",
                        }}
                    >
                        Delete a message from <strong style={{ color: "var(--fg-1, #fff)" }}>{senderDomain}</strong>.
                        This action is logged in the public audit trail.
                    </p>

                    {/* Reason */}
                    <label
                        htmlFor="delete-reason"
                        style={{
                            display: "block",
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            color: "var(--fg-3, #888)",
                            marginBottom: "6px",
                        }}
                    >
                        Reason (required)
                    </label>
                    <input
                        id="delete-reason"
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g., Spam, Harassment, Off-topic"
                        // biome-ignore lint/a11y/noAutofocus: the field is the reason the dialog opened, so focusing it on open is the expected behaviour
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) handleSubmit(); }}
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            background: "var(--bg-2, #0a0a0a)",
                            border: "1px solid var(--border-2, #333)",
                            color: "var(--fg-1, #fff)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "13px",
                            outline: "none",
                            boxSizing: "border-box",
                        }}
                    />

                    {/* Visibility toggle */}
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginTop: "16px",
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={visible}
                            onChange={(e) => setVisible(e.target.checked)}
                            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                            aria-label={visible ? "Show removed stub" : "Hide message entirely"}
                        />
                        <div
                            role="presentation"
                            style={{
                                width: "44px",
                                height: "24px",
                                borderRadius: "10px",
                                background: visible
                                    ? "var(--accent)"
                                    : "var(--border-2, #333)",
                                position: "relative",
                                transition: "background 0.2s",
                            }}
                        >
                            <div
                                style={{
                                    width: "18px",
                                    height: "18px",
                                    borderRadius: "50%",
                                    background: "#fff",
                                    position: "absolute",
                                    top: "3px",
                                    left: visible ? "23px" : "3px",
                                    transition: "left 0.2s",
                                }}
                            />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {visible ? <Eye size={14} style={{ color: "var(--accent)" }} /> : <EyeOff size={14} style={{ color: "var(--fg-3, #888)" }} />}
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "11px",
                                    color: "var(--fg-2, rgba(255,255,255,0.6))",
                                }}
                            >
                                {visible ? "Show \"[removed]\" stub" : "Hide message entirely"}
                            </span>
                        </div>
                    </label>
                </div>

                {/* Footer */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "8px",
                        padding: "16px 20px",
                        borderTop: "1px solid var(--border-2, #333)",
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: "8px 16px",
                            background: "transparent",
                            border: "1px solid var(--border-2, #333)",
                            color: "var(--fg-2, rgba(255,255,255,0.6))",
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            cursor: "pointer",
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!reason.trim()}
                        style={{
                            padding: "8px 16px",
                            background: reason.trim() ? "#ff6b6b" : "var(--border-2, #333)",
                            border: "none",
                            color: reason.trim() ? "#000" : "var(--fg-3, #888)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            cursor: reason.trim() ? "pointer" : "default",
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
