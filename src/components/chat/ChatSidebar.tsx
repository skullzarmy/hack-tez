import { useEffect, useRef } from "react";
import { Hash, MessageSquare, Plus, Users, X } from "lucide-react";

interface DMConversation {
    roomId: string;
    peerDomain: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
}

interface ActiveView {
    type: "global" | "dm";
    roomId?: string;
    peerDomain?: string;
}

interface ChatSidebarProps {
    onlineUsers: string[];
    activeView: ActiveView;
    conversations: DMConversation[];
    onSelectGlobal: () => void;
    onSelectDM: (roomId: string, peerDomain: string) => void;
    onNewDM: () => void;
    totalUnread: number;
    isOpen: boolean;
    onClose: () => void;
}

function formatRelativeShort(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "…";
}

export default function ChatSidebar({
    onlineUsers,
    activeView,
    conversations,
    onSelectGlobal,
    onSelectDM,
    onNewDM,
    totalUnread,
    isOpen,
    onClose,
}: ChatSidebarProps) {
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    // Focus close button when mobile drawer opens
    useEffect(() => {
        if (isOpen) {
            closeButtonRef.current?.focus();
        }
    }, [isOpen]);

    const sidebarContent = (
        <>
            {/* Mobile close button */}
            <div className="flex md:hidden items-center justify-between shrink-0"
                style={{ borderBottom: "1px solid var(--border-2, #333)", minHeight: "56px", padding: "0 20px" }}
            >
                <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
                >
                    Navigation
                </span>
                <button
                    ref={closeButtonRef}
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
                    aria-label="Close navigation"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Rooms section */}
            <div
                className="text-[10px] font-bold tracking-widest uppercase"
                style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", letterSpacing: "0.2em", padding: "12px 20px" }}
            >
                Rooms
            </div>
            <div style={{ padding: "0 12px" }}>
                <button
                    type="button"
                    onClick={onSelectGlobal}
                    className="flex items-center text-xs w-full text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                        background: activeView.type === "global" ? "var(--accent, #00ffc8)" : "transparent",
                        color: activeView.type === "global" ? "var(--bg, #000)" : "var(--fg, #eee)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: "none",
                        minHeight: "44px",
                        outlineColor: "var(--accent, #00ffc8)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        padding: "0 12px",
                        gap: "8px",
                    }}
                    aria-current={activeView.type === "global" ? "page" : undefined}
                >
                    <Hash size={14} aria-hidden="true" />
                    global
                </button>
            </div>

            {/* DMs section */}
            <div
                className="flex items-center justify-between text-[10px] font-bold tracking-widest uppercase"
                style={{
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    borderTop: "1px solid var(--border-2, #333)",
                    letterSpacing: "0.2em",
                    padding: "12px 20px",
                }}
            >
                <span className="flex items-center" style={{ gap: "6px" }}>
                    <MessageSquare size={12} aria-hidden="true" />
                    DMs
                    {totalUnread > 0 && (
                        <span
                            className="inline-flex items-center justify-center text-[10px] font-bold leading-none"
                            style={{
                                background: "var(--accent, #00ffc8)",
                                color: "var(--bg, #000)",
                                minWidth: "16px",
                                padding: "2px 6px",
                            }}
                        >
                            {totalUnread}
                            <span className="sr-only"> unread messages</span>
                        </span>
                    )}
                </span>
                <button
                    type="button"
                    onClick={onNewDM}
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
                    aria-label="New DM"
                    title="New DM"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="flex flex-col overflow-y-auto flex-1 min-h-0" style={{ padding: "0 12px" }}>
                {conversations.length === 0 && (
                    <div
                        className="text-xs uppercase tracking-widest"
                        style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", fontSize: "10px", padding: "16px" }}
                    >
                        No conversations yet
                    </div>
                )}
                {conversations.map((conv) => {
                    const isActive = activeView.type === "dm" && activeView.roomId === conv.roomId;
                    return (
                        <button
                            key={conv.roomId}
                            type="button"
                            onClick={() => onSelectDM(conv.roomId, conv.peerDomain)}
                            className="flex flex-col text-left w-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{
                                background: isActive ? "rgba(0, 255, 200, 0.06)" : "transparent",
                                borderLeft: isActive ? "2px solid var(--accent, #00ffc8)" : "2px solid transparent",
                                cursor: "pointer",
                                borderTop: "none",
                                borderRight: "none",
                                borderBottom: "none",
                                minHeight: "48px",
                                padding: "10px 16px",
                                gap: "2px",
                                outlineColor: "var(--accent, #00ffc8)",
                            }}
                            aria-current={isActive ? "page" : undefined}
                        >
                            <div className="flex items-center justify-between w-full">
                                <span
                                    className="text-xs font-bold truncate"
                                    style={{
                                        color: isActive ? "var(--accent, #00ffc8)" : "var(--fg, #eee)",
                                        fontFamily: "var(--font-mono)",
                                        maxWidth: "140px",
                                    }}
                                >
                                    {conv.peerDomain}
                                </span>
                                <span className="flex items-center" style={{ gap: "6px" }}>
                                    {conv.lastMessageAt && (
                                        <span
                                            className="text-xs"
                                            style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", fontSize: "10px" }}
                                        >
                                            {formatRelativeShort(conv.lastMessageAt)}
                                        </span>
                                    )}
                                    {conv.unreadCount > 0 && (
                                        <span
                                            className="inline-flex items-center justify-center text-[10px] font-bold leading-none"
                                            style={{
                                                background: "var(--accent, #00ffc8)",
                                                color: "var(--bg, #000)",
                                                minWidth: "16px",
                                                padding: "2px 6px",
                                            }}
                                        >
                                            {conv.unreadCount}
                                            <span className="sr-only">
                                                {` unread message${conv.unreadCount === 1 ? "" : "s"}`}
                                            </span>
                                        </span>
                                    )}
                                </span>
                            </div>
                            {conv.lastMessage && (
                                <span
                                    className="text-xs truncate w-full block"
                                    style={{ color: "var(--fg-3, #888)", fontSize: "11px" }}
                                >
                                    {truncate(conv.lastMessage, 34)}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Online users section */}
            <div
                className="text-[10px] font-bold tracking-widest uppercase"
                style={{
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    borderTop: "1px solid var(--border-2, #333)",
                    letterSpacing: "0.2em",
                    padding: "12px 20px",
                }}
            >
                <span className="flex items-center" style={{ gap: "6px" }}>
                    <Users size={12} aria-hidden="true" />
                    Online — {onlineUsers.length}
                </span>
            </div>
            <div className="flex flex-col overflow-y-auto" style={{ padding: "0 20px 16px", gap: "6px", maxHeight: "160px" }}>
                {onlineUsers.map((d) => (
                    <div
                        key={d}
                        className="flex items-center text-xs"
                        style={{ fontFamily: "var(--font-mono)", minHeight: "28px", gap: "8px" }}
                    >
                        <span
                            className="inline-block w-1.5 h-1.5 shrink-0"
                            style={{ background: "var(--accent, #00ffc8)" }}
                            aria-hidden="true"
                        />
                        <span className="truncate" style={{ color: "var(--fg-2, rgba(255,255,255,0.6))" }}>
                            {d}
                        </span>
                        <span className="sr-only">(online)</span>
                    </div>
                ))}
            </div>
        </>
    );

    return (
        <>
            {/* Desktop sidebar */}
            <aside
                className="hidden md:flex flex-col shrink-0"
                role="navigation"
                aria-label="Chat navigation"
                style={{
                    width: "240px",
                    borderRight: "1px solid var(--border-2, #333)",
                    background: "var(--bg-2, #0a0a0a)",
                }}
            >
                {sidebarContent}
            </aside>

            {/* Mobile drawer backdrop */}
            {/* Always render for CSS transition; visibility controlled by opacity + pointer-events */}
            <div
                className="fixed inset-0 z-40 md:hidden"
                style={{
                    background: "rgba(0, 0, 0, 0.6)",
                    opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? "auto" : "none",
                    transition: "opacity 200ms ease",
                }}
                aria-hidden="true"
                onClick={onClose}
            />

            {/* Mobile drawer */}
            <aside
                className="fixed inset-y-0 left-0 z-50 flex flex-col md:hidden"
                role="navigation"
                aria-label="Chat navigation"
                style={{
                    width: "280px",
                    maxWidth: "85vw",
                    background: "var(--bg-2, #0a0a0a)",
                    borderRight: "1px solid var(--border-2, #333)",
                    transform: isOpen ? "translateX(0)" : "translateX(-100%)",
                    transition: "transform 250ms ease",
                    willChange: "transform",
                }}
            >
                {sidebarContent}
            </aside>
        </>
    );
}
