import { useState } from "react";
import { Ban, X } from "lucide-react";

interface BanUserModalProps {
    domain: string;
    onConfirm: (opts: {
        domain: string;
        banType: "soft" | "hard";
        scope: "global" | "platform";
        reason: string;
        duration?: number;
        notes?: string;
        banWallet?: boolean;
    }) => void;
    onClose: () => void;
}

const DURATION_PRESETS: { label: string; seconds: number }[] = [
    { label: "1 hour", seconds: 3600 },
    { label: "24 hours", seconds: 86400 },
    { label: "7 days", seconds: 604800 },
    { label: "30 days", seconds: 2592000 },
];

export default function BanUserModal({ domain, onConfirm, onClose }: BanUserModalProps) {
    const [banType, setBanType] = useState<"soft" | "hard">("soft");
    const [scope, setScope] = useState<"global" | "platform">("global");
    const [reason, setReason] = useState("");
    const [durationSeconds, setDurationSeconds] = useState(86400);
    const [customDays, setCustomDays] = useState("");
    const [useCustom, setUseCustom] = useState(false);
    const [notes, setNotes] = useState("");
    const [banWallet, setBanWallet] = useState(false);

    const effectiveDuration = useCustom
        ? (parseFloat(customDays) || 0) * 86400
        : durationSeconds;

    const canSubmit = reason.trim() && (banType === "hard" || effectiveDuration > 0);

    const handleSubmit = () => {
        if (!canSubmit) return;
        onConfirm({
            domain,
            banType,
            scope,
            reason: reason.trim(),
            duration: banType === "soft" ? effectiveDuration : undefined,
            notes: notes.trim() || undefined,
            banWallet,
        });
        onClose();
    };

    const radioStyle = (active: boolean) => ({
        padding: "8px 14px",
        background: active ? "var(--accent-bg)" : "transparent",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-2, #333)",
        color: active ? "var(--accent)" : "var(--fg-2, rgba(255,255,255,0.6))",
        fontFamily: "var(--font-mono)" as const,
        fontSize: "11px",
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        cursor: "pointer" as const,
    });

    const labelStyle = {
        display: "block" as const,
        fontFamily: "var(--font-mono)" as const,
        fontSize: "10px",
        textTransform: "uppercase" as const,
        letterSpacing: "0.1em",
        color: "var(--fg-3, #888)",
        marginBottom: "6px",
    };

    return (
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
                aria-label="Ban user"
                style={{
                    background: "var(--bg-1, #111)",
                    border: "1px solid var(--border-2, #333)",
                    width: "100%",
                    maxWidth: "460px",
                    margin: "0 16px",
                    maxHeight: "90vh",
                    overflowY: "auto",
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
                        <Ban size={16} style={{ color: "#ff6b6b" }} />
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
                            Ban user
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
                            marginBottom: "20px",
                        }}
                    >
                        Ban <strong style={{ color: "#ff6b6b" }}>{domain}</strong> from hackchat.
                        This action is logged in the public audit trail.
                    </p>

                    {/* Ban type */}
                    <label style={labelStyle}>Ban type</label>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                        <button type="button" onClick={() => setBanType("soft")} style={radioStyle(banType === "soft")}>
                            Soft (temporary)
                        </button>
                        <button type="button" onClick={() => setBanType("hard")} style={radioStyle(banType === "hard")}>
                            Hard (permanent)
                        </button>
                    </div>

                    {/* Duration (soft ban only) */}
                    {banType === "soft" && (
                        <>
                            <label style={labelStyle}>Duration</label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                                {DURATION_PRESETS.map((p) => (
                                    <button
                                        key={p.seconds}
                                        type="button"
                                        onClick={() => { setDurationSeconds(p.seconds); setUseCustom(false); }}
                                        style={radioStyle(!useCustom && durationSeconds === p.seconds)}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setUseCustom(true)}
                                    style={radioStyle(useCustom)}
                                >
                                    Custom
                                </button>
                            </div>
                            {useCustom && (
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                    <input
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        value={customDays}
                                        onChange={(e) => setCustomDays(e.target.value)}
                                        placeholder="days"
                                        style={{
                                            width: "80px",
                                            padding: "8px 10px",
                                            background: "var(--bg-2, #0a0a0a)",
                                            border: "1px solid var(--border-2, #333)",
                                            color: "var(--fg-1, #fff)",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "13px",
                                            outline: "none",
                                        }}
                                    />
                                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-3, #888)" }}>
                                        days
                                    </span>
                                </div>
                            )}
                            <div style={{ height: "8px" }} />
                        </>
                    )}

                    {/* Scope */}
                    <label style={labelStyle}>Scope</label>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                        <button type="button" onClick={() => setScope("global")} style={radioStyle(scope === "global")}>
                            Global chat only
                        </button>
                        <button type="button" onClick={() => setScope("platform")} style={radioStyle(scope === "platform")}>
                            Platform-wide (+ DMs)
                        </button>
                    </div>

                    {/* Reason */}
                    <label style={labelStyle}>Reason (required, public)</label>
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g., Harassment, Spam, Impersonation"
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
                            marginBottom: "16px",
                        }}
                    />

                    {/* Notes (internal) */}
                    <label style={labelStyle}>Internal notes (not public)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional context for future reference..."
                        rows={2}
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            background: "var(--bg-2, #0a0a0a)",
                            border: "1px solid var(--border-2, #333)",
                            color: "var(--fg-1, #fff)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "13px",
                            outline: "none",
                            resize: "vertical",
                            boxSizing: "border-box",
                            marginBottom: "16px",
                        }}
                    />

                    {/* Ban wallet toggle */}
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={banWallet}
                            onChange={(e) => setBanWallet(e.target.checked)}
                            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                            aria-label="Ban all domains on this wallet"
                        />
                        <div
                            role="presentation"
                            style={{
                                width: "44px",
                                height: "24px",
                                borderRadius: "10px",
                                background: banWallet ? "#ff6b6b" : "var(--border-2, #333)",
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
                                    left: banWallet ? "23px" : "3px",
                                    transition: "left 0.2s",
                                }}
                            />
                        </div>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: banWallet ? "#ff6b6b" : "var(--fg-2, rgba(255,255,255,0.6))",
                            }}
                        >
                            Ban all domains on this wallet
                        </span>
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
                        disabled={!canSubmit}
                        style={{
                            padding: "8px 16px",
                            background: canSubmit ? "#ff6b6b" : "var(--border-2, #333)",
                            border: "none",
                            color: canSubmit ? "#000" : "var(--fg-3, #888)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            cursor: canSubmit ? "pointer" : "default",
                        }}
                    >
                        {banType === "hard" ? "Ban permanently" : "Ban user"}
                    </button>
                </div>
            </div>
        </div>
    );
}
