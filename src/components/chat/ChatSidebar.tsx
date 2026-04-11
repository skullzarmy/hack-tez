import { useEffect, useRef, useState } from "react";
import { Hash, MessageSquare, Plus, Users, X, Archive, RotateCcw, Check } from "lucide-react";
import ChatAvatar from "./ChatAvatar";

interface DMConversation {
    roomId: string;
    ownDomain: string;
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
    onSelectDM: (roomId: string, peerDomain: string, ownDomain: string) => void;
    onHideDM: (roomId: string) => void;
    onClearHidden: () => void;
    hiddenCount: number;
    onNewDM: () => void;
    totalUnread: number;
    globalMentionCount?: number;
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
    onHideDM,
    onClearHidden,
    hiddenCount,
    onNewDM,
    totalUnread,
    globalMentionCount = 0,
    isOpen,
    onClose,
}: ChatSidebarProps) {
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const [confirmHideRoomId, setConfirmHideRoomId] = useState<string | null>(null);

    // Focus close button when mobile drawer opens
    useEffect(() => {
        if (isOpen) {
            closeButtonRef.current?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!confirmHideRoomId) return;
        const timeout = setTimeout(() => {
            setConfirmHideRoomId(null);
        }, 3000);
        return () => clearTimeout(timeout);
    }, [confirmHideRoomId]);

    const sidebarContent = (
        <>
            {/* Mobile close button */}
            <div
                className="flex md:hidden items-center justify-between shrink-0 px-5"
                style={{ borderBottom: "1px solid var(--border-2, #333)", minHeight: "56px" }}
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
                className="text-[10px] font-bold tracking-widest uppercase px-5 py-3"
                style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
            >
                Rooms
            </div>
            <div className="px-3">
                <button
                    type="button"
                    onClick={onSelectGlobal}
                    className="flex items-center text-xs w-full text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 px-3 gap-2"
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
                    }}
                    aria-current={activeView.type === "global" ? "page" : undefined}
                >
                    <Hash size={14} aria-hidden="true" />
                    global
                    {globalMentionCount > 0 && (
                        <span
                            className="inline-flex items-center justify-center text-[10px] font-bold leading-none px-1.5 py-0.5"
                            style={{
                                background: activeView.type === "global" ? "var(--bg, #000)" : "var(--accent, #00ffc8)",
                                color: activeView.type === "global" ? "var(--accent, #00ffc8)" : "var(--bg, #000)",
                                minWidth: "16px",
                                marginLeft: "auto",
                            }}
                        >
                            @{globalMentionCount}
                            <span className="sr-only">{` mention${globalMentionCount === 1 ? "" : "s"}`}</span>
                        </span>
                    )}
                </button>
            </div>

            {/* DMs section */}
            <div
                className="flex items-center justify-between text-[10px] font-bold tracking-widest uppercase px-5 py-3"
                style={{
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    borderTop: "1px solid var(--border-2, #333)",
                    letterSpacing: "0.2em",
                }}
            >
                <span className="flex items-center gap-1.5">
                    <MessageSquare size={12} aria-hidden="true" />
                    DMs
                    {totalUnread > 0 && (
                        <span
                            className="inline-flex items-center justify-center text-[10px] font-bold leading-none px-1.5 py-0.5"
                            style={{
                                background: "var(--accent, #00ffc8)",
                                color: "var(--bg, #000)",
                                minWidth: "16px",
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

            {hiddenCount > 0 && (
                <div className="px-4 pb-2">
                    <button
                        type="button"
                        onClick={onClearHidden}
                        className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest gap-1"
                        style={{
                            color: "var(--fg-3, #888)",
                            fontFamily: "var(--font-mono)",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            minHeight: "32px",
                        }}
                    >
                        <RotateCcw size={12} aria-hidden="true" />
                        Show hidden ({hiddenCount})
                    </button>
                </div>
            )}

            <div className="flex flex-col overflow-y-auto flex-1 min-h-0 px-3">
                {conversations.length === 0 && (
                    <div
                        className="text-xs uppercase tracking-widest p-4"
                        style={{
                            color: "var(--fg-3, #888)",
                            fontFamily: "var(--font-mono)",
                            letterSpacing: "0.1em",
                            fontSize: "10px",
                        }}
                    >
                        No conversations yet
                    </div>
                )}
                {conversations.map((conv) => {
                    const isActive = activeView.type === "dm" && activeView.roomId === conv.roomId;
                    const isConfirmingHide = confirmHideRoomId === conv.roomId;
                    return (
                        <div
                            key={conv.roomId}
                            className="flex items-stretch w-full min-w-0"
                            style={{
                                background: isActive ? "rgba(0, 255, 200, 0.06)" : "transparent",
                                borderLeft: isActive ? "2px solid var(--accent, #00ffc8)" : "2px solid transparent",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => onSelectDM(conv.roomId, conv.peerDomain, conv.ownDomain)}
                                className="flex flex-col flex-1 min-w-0 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 px-4 py-2 gap-0.5"
                                style={{
                                    background: "transparent",
                                    cursor: "pointer",
                                    border: "none",
                                    minHeight: "52px",
                                    outlineColor: "var(--accent, #00ffc8)",
                                }}
                                aria-current={isActive ? "page" : undefined}
                            >
                                <div className="flex items-center justify-between w-full min-w-0 gap-2">
                                    <span
                                        className="text-[11px] font-bold truncate min-w-0 flex-1"
                                        style={{
                                            color: isActive ? "var(--accent, #00ffc8)" : "var(--fg, #eee)",
                                            fontFamily: "var(--font-mono)",
                                        }}
                                    >
                                        {conv.peerDomain}
                                    </span>
                                    <span className="flex items-center gap-1.5 shrink-0">
                                        {conv.lastMessageAt && (
                                            <span
                                                className="text-xs"
                                                style={{
                                                    color: "var(--fg-3, #888)",
                                                    fontFamily: "var(--font-mono)",
                                                    fontSize: "10px",
                                                }}
                                            >
                                                {formatRelativeShort(conv.lastMessageAt)}
                                            </span>
                                        )}
                                        {conv.unreadCount > 0 && (
                                            <span
                                                className="inline-flex items-center justify-center text-[10px] font-bold leading-none px-1.5 py-0.5"
                                                style={{
                                                    background: "var(--accent, #00ffc8)",
                                                    color: "var(--bg, #000)",
                                                    minWidth: "16px",
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
                                        className="text-[10px] leading-tight truncate w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap block"
                                        style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)" }}
                                    >
                                        {truncate(conv.lastMessage, 34)}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (isConfirmingHide) {
                                        onHideDM(conv.roomId);
                                        setConfirmHideRoomId(null);
                                        return;
                                    }
                                    setConfirmHideRoomId(conv.roomId);
                                }}
                                className="inline-flex items-center justify-center shrink-0 self-center"
                                style={{
                                    width: "32px",
                                    height: "32px",
                                    marginRight: "8px",
                                    border: "none",
                                    background: "transparent",
                                    color: isConfirmingHide ? "var(--warn, #ffd166)" : "var(--fg-3, #888)",
                                    cursor: "pointer",
                                }}
                                aria-label={
                                    isConfirmingHide
                                        ? `Confirm hide DM with ${conv.peerDomain}`
                                        : `Hide DM with ${conv.peerDomain}`
                                }
                                title={isConfirmingHide ? "Click again to confirm" : "Hide DM"}
                            >
                                {isConfirmingHide ? (
                                    <Check size={12} aria-hidden="true" />
                                ) : (
                                    <Archive size={12} aria-hidden="true" />
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Online users section */}
            <div
                className="text-[10px] font-bold tracking-widest uppercase px-5 py-3"
                style={{
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    borderTop: "1px solid var(--border-2, #333)",
                    letterSpacing: "0.2em",
                }}
            >
                <span className="flex items-center gap-1.5">
                    <Users size={12} aria-hidden="true" />
                    Online — {onlineUsers.length}
                </span>
            </div>
            <div className="flex flex-col overflow-y-auto px-5 pb-4 gap-1.5" style={{ maxHeight: "160px" }}>
                {onlineUsers.map((d) => (
                    <div
                        key={d}
                        className="flex items-center text-xs gap-2"
                        style={{ fontFamily: "var(--font-mono)", minHeight: "28px" }}
                    >
                        <ChatAvatar
                            label={d.split(".")[0]}
                            size={20}
                            hoverAnimate
                            borderRadius="3px"
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
