import { useState, useMemo } from "react";
import { X, Search, MessageSquare } from "lucide-react";

interface NewDMModalProps {
    onlineUsers: string[];
    activeDomain: string;
    onStartDM: (targetDomain: string) => void;
    onClose: () => void;
}

export default function NewDMModal({ onlineUsers, activeDomain, onStartDM, onClose }: NewDMModalProps) {
    const [search, setSearch] = useState("");

    const filteredUsers = useMemo(() => {
        const others = onlineUsers.filter((d) => d !== activeDomain);
        if (!search.trim()) return others;
        const q = search.trim().toLowerCase();
        return others.filter((d) => d.toLowerCase().includes(q));
    }, [onlineUsers, activeDomain, search]);

    const canSendManual = search.trim().length > 0
        && search.trim() !== activeDomain
        && !filteredUsers.includes(search.trim());

    function handleManualSend() {
        const domain = search.trim();
        if (domain && domain !== activeDomain) {
            onStartDM(domain);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0, 0, 0, 0.7)" }}
            onClick={onClose}
        >
            <div
                className="rounded-lg w-full max-w-sm mx-4 overflow-hidden flex flex-col"
                style={{
                    background: "var(--bg-2, #0a0a0a)",
                    border: "1px solid var(--border-2, #333)",
                    maxHeight: "70vh",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: "1px solid var(--border-2, #333)" }}
                >
                    <span
                        className="text-sm font-bold tracking-wide flex items-center gap-2"
                        style={{ fontFamily: "var(--font-mono)" }}
                    >
                        <MessageSquare size={16} style={{ color: "var(--accent, #00ffc8)" }} />
                        New DM
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded"
                        style={{ color: "var(--fg-muted, #888)", cursor: "pointer", border: "none", background: "transparent" }}
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Search input */}
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-2, #222)" }}>
                    <div
                        className="flex items-center gap-2 rounded px-3 py-2"
                        style={{
                            background: "var(--bg, #000)",
                            border: "1px solid var(--border, #555)",
                        }}
                    >
                        <Search size={14} style={{ color: "var(--fg-muted, #888)" }} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search or enter domain name…"
                            className="flex-1 bg-transparent text-sm outline-none border-0"
                            style={{
                                color: "var(--fg, #eee)",
                                fontFamily: "var(--font-mono)",
                            }}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && canSendManual) {
                                    handleManualSend();
                                }
                            }}
                        />
                    </div>
                </div>

                {/* User list */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {filteredUsers.map((domain) => (
                        <button
                            key={domain}
                            type="button"
                            onClick={() => onStartDM(domain)}
                            className="flex items-center gap-3 px-4 py-2.5 w-full text-left"
                            style={{
                                cursor: "pointer",
                                border: "none",
                                borderBottom: "1px solid var(--border-2, #222)",
                                background: "transparent",
                            }}
                        >
                            <span
                                className="inline-block w-2 h-2 rounded-full shrink-0"
                                style={{ background: "var(--accent, #00ffc8)" }}
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
                            className="flex items-center gap-3 px-4 py-2.5 w-full text-left"
                            style={{
                                cursor: "pointer",
                                border: "none",
                                borderBottom: "1px solid var(--border-2, #222)",
                                background: "rgba(0, 255, 200, 0.05)",
                            }}
                        >
                            <MessageSquare size={14} style={{ color: "var(--accent, #00ffc8)" }} />
                            <span
                                className="text-xs"
                                style={{ color: "var(--fg-muted, #888)", fontFamily: "var(--font-mono)" }}
                            >
                                Message <span style={{ color: "var(--accent, #00ffc8)", fontWeight: 700 }}>{search.trim()}</span>
                            </span>
                        </button>
                    )}

                    {filteredUsers.length === 0 && !canSendManual && (
                        <div
                            className="px-4 py-6 text-center text-xs"
                            style={{ color: "var(--fg-muted, #666)", fontFamily: "var(--font-mono)" }}
                        >
                            {search ? "No matching users online" : "No other users online"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
