import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { X, Search, MessageSquare } from "lucide-react";
import config from "../../config/tezos";

interface NewDMModalProps {
    onlineUsers: string[];
    activeDomain: string;
    onStartDM: (targetDomain: string) => void;
    onClose: () => void;
}

export default function NewDMModal({ onlineUsers, activeDomain, onStartDM, onClose }: NewDMModalProps) {
    const [search, setSearch] = useState("");
    const dialogRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const normalizeManualTarget = useCallback((input: string): { valid: boolean; domain?: string; error?: string } => {
        const raw = input.trim().toLowerCase();
        if (!raw) return { valid: false, error: "Enter a domain" };
        if (raw.length > 80) return { valid: false, error: "Domain is too long" };

        const tld = config.tld;
        const labelPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
        const fullMatch = raw.match(new RegExp(`^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.hack\\.${tld}$`));
        if (fullMatch) {
            return { valid: true, domain: raw };
        }

        if (raw.includes(".")) {
            return { valid: false, error: `Use a label or label.hack.${tld}` };
        }

        if (raw.length < 1 || raw.length > 63 || !labelPattern.test(raw)) {
            return { valid: false, error: "Use 1-63 lowercase letters, numbers, or hyphens" };
        }

        return { valid: true, domain: `${raw}.hack.${tld}` };
    }, []);

    const manualTarget = normalizeManualTarget(search);

    const filteredUsers = useMemo(() => {
        const others = onlineUsers.filter((d) => d !== activeDomain);
        if (!search.trim()) return others;
        const q = search.trim().toLowerCase();
        return others.filter((d) => d.toLowerCase().includes(q));
    }, [onlineUsers, activeDomain, search]);

    const canSendManual =
        !!manualTarget.valid &&
        !!manualTarget.domain &&
        manualTarget.domain !== activeDomain &&
        !filteredUsers.includes(manualTarget.domain);

    function handleManualSend() {
        const domain = manualTarget.domain;
        if (domain && domain !== activeDomain) {
            onStartDM(domain);
        }
    }

    // Escape key closes modal
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onClose();
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Focus trap within the modal
    const handleFocusTrap = useCallback((e: KeyboardEvent) => {
        if (e.key !== "Tab" || !dialogRef.current) return;

        const focusableEls = dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableEls.length === 0) return;

        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    }, []);

    useEffect(() => {
        document.addEventListener("keydown", handleFocusTrap);
        // Focus the search input on mount
        searchInputRef.current?.focus();
        return () => document.removeEventListener("keydown", handleFocusTrap);
    }, [handleFocusTrap]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0, 0, 0, 0.7)" }}
            onClick={onClose}
            role="presentation"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="New direct message"
                className="w-full max-w-sm overflow-hidden flex flex-col mx-4"
                style={{
                    background: "var(--bg-2, #0a0a0a)",
                    border: "1px solid var(--border-2, #333)",
                    maxHeight: "70vh",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-5"
                    style={{ borderBottom: "1px solid var(--border-2, #333)", minHeight: "56px" }}
                >
                    <span
                        className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
                        id="new-dm-title"
                    >
                        <MessageSquare size={14} style={{ color: "var(--accent, #00ffc8)" }} aria-hidden="true" />
                        New DM
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                            width: "44px",
                            height: "44px",
                            color: "var(--fg-2, rgba(255,255,255,0.6))",
                            cursor: "pointer",
                            border: "none",
                            background: "transparent",
                            outlineColor: "var(--accent, #00ffc8)",
                        }}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Search input */}
                <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-2, #222)" }}>
                    <div
                        className="flex items-center px-3 gap-2"
                        style={{
                            background: "var(--bg, #000)",
                            border: "1px solid var(--border-2, #333)",
                            minHeight: "44px",
                        }}
                    >
                        <Search size={14} style={{ color: "var(--fg-2, rgba(255,255,255,0.6))" }} aria-hidden="true" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search or enter domain name…"
                            className="flex-1 bg-transparent text-sm outline-none border-0"
                            style={{
                                color: "var(--fg, #eee)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "14px",
                            }}
                            aria-label="Search users"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && canSendManual) {
                                    handleManualSend();
                                }
                            }}
                        />
                    </div>
                </div>

                {/* User list */}
                <div className="flex-1 overflow-y-auto min-h-0" role="list" aria-label="Online users">
                    {filteredUsers.map((domain) => (
                        <button
                            key={domain}
                            type="button"
                            onClick={() => onStartDM(domain)}
                            role="listitem"
                            className="flex items-center w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] px-5 gap-3"
                            style={{
                                cursor: "pointer",
                                border: "none",
                                borderBottom: "1px solid var(--border-2, #222)",
                                background: "transparent",
                                minHeight: "44px",
                                outlineColor: "var(--accent, #00ffc8)",
                            }}
                        >
                            <span
                                className="inline-block w-2 h-2 rounded-full shrink-0"
                                style={{ background: "var(--accent, #00ffc8)" }}
                                aria-hidden="true"
                            />
                            <span
                                className="text-xs font-bold truncate"
                                style={{
                                    color: "var(--fg, #eee)",
                                    fontFamily: "var(--font-mono)",
                                }}
                            >
                                {domain}
                            </span>
                        </button>
                    ))}

                    {/* Manual entry hint */}
                    {canSendManual && (
                        <button
                            type="button"
                            onClick={handleManualSend}
                            role="listitem"
                            className="flex items-center w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] px-5 gap-3"
                            style={{
                                cursor: "pointer",
                                border: "none",
                                borderBottom: "1px solid var(--border-2, #222)",
                                background: "rgba(0, 255, 200, 0.05)",
                                minHeight: "44px",
                                outlineColor: "var(--accent, #00ffc8)",
                            }}
                        >
                            <MessageSquare size={14} style={{ color: "var(--accent, #00ffc8)" }} aria-hidden="true" />
                            <span
                                className="text-xs"
                                style={{ color: "var(--fg-2, rgba(255,255,255,0.6))", fontFamily: "var(--font-mono)" }}
                            >
                                Message{" "}
                                <span style={{ color: "var(--accent, #00ffc8)", fontWeight: 700 }}>
                                    {manualTarget.domain}
                                </span>
                            </span>
                        </button>
                    )}

                    {search.trim() && !canSendManual && !filteredUsers.length && !manualTarget.valid && (
                        <div
                            className="text-center text-xs px-5 py-3"
                            style={{ color: "var(--warn, #ffd166)", fontFamily: "var(--font-mono)" }}
                        >
                            {manualTarget.error}
                        </div>
                    )}

                    {filteredUsers.length === 0 && !canSendManual && (
                        <div
                            className="text-center text-xs uppercase tracking-widest px-5 py-6"
                            style={{
                                color: "var(--fg-3, #888)",
                                fontFamily: "var(--font-mono)",
                                letterSpacing: "0.1em",
                                fontSize: "10px",
                            }}
                        >
                            {search ? "No matching users online" : "No other users online"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
