import { useRef, useEffect, useCallback, useState } from "react";
import { MessageCircle, Users, Loader2, Menu, AlertTriangle } from "lucide-react";
import IdentitySelector from "./IdentitySelector";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import ChatSidebar from "./ChatSidebar";
import DMView from "./DMView";
import NewDMModal from "./NewDMModal";
import { useChat } from "../../hooks/useChat";
import { useDMList } from "../../hooks/useDMList";

const HACKCHAT_URL = import.meta.env.VITE_HACKCHAT_URL ?? "http://localhost:8787";

interface ChatLayoutProps {
    token: string;
    domains: string[];
    activeDomain: string;
    onSwitchDomain: (domain: string) => void;
}

interface ActiveView {
    type: "global" | "dm";
    roomId?: string;
    peerDomain?: string;
}

export default function ChatLayout({ token, domains, activeDomain, onSwitchDomain }: ChatLayoutProps) {
    const [activeView, setActiveView] = useState<ActiveView>({ type: "global" });
    const [showNewDM, setShowNewDM] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const {
        messages,
        isConnected,
        sendMessage,
        isLoading,
        loadMore,
        hasMore,
        onlineUsers,
        typingUsers,
        sendTyping,
        activeDomain: currentDomain,
        switchIdentity,
    } = useChat({ token, activeDomain, onIdentitySwitched: onSwitchDomain });

    const { conversations, totalUnread, refresh: refreshDMs } = useDMList({ token, activeDomain: currentDomain });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);

    // Track if user is near bottom
    const handleScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        shouldAutoScrollRef.current = distFromBottom < 100;

        // Load more when scrolled to top
        if (el.scrollTop < 50 && hasMore && !isLoading) {
            loadMore();
        }
    }, [hasMore, isLoading, loadMore]);

    // Auto-scroll on new messages (only if near bottom)
    useEffect(() => {
        if (shouldAutoScrollRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages.length]);

    // Close mobile sidebar on Escape
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape" && sidebarOpen) {
                setSidebarOpen(false);
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [sidebarOpen]);

    const filteredTyping = typingUsers.filter((d) => d !== currentDomain);

    const handleSelectGlobal = useCallback(() => {
        setActiveView({ type: "global" });
        setSidebarOpen(false);
    }, []);

    const handleSelectDM = useCallback((roomId: string, peerDomain: string) => {
        setActiveView({ type: "dm", roomId, peerDomain });
        setSidebarOpen(false);
    }, []);

    const handleStartDM = useCallback(async (targetDomain: string) => {
        setShowNewDM(false);
        try {
            const res = await fetch(`${HACKCHAT_URL}/dm/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "X-Active-Domain": currentDomain,
                },
                body: JSON.stringify({ targetDomain }),
            });
            if (!res.ok) return;
            const data = (await res.json()) as { roomId: string; targetDomain: string };
            setActiveView({ type: "dm", roomId: data.roomId, peerDomain: data.targetDomain });
            refreshDMs();
        } catch {
            // Silently fail
        }
    }, [token, refreshDMs]);

    const handleDMBack = useCallback(() => {
        setActiveView({ type: "global" });
        refreshDMs();
    }, [refreshDMs]);

    return (
        <div
            className="flex"
            style={{
                flex: "1 1 auto",
                fontFamily: "var(--font)",
                margin: "clamp(0px, 1vw, 8px)",
                border: "1px solid var(--border-2, #333)",
                overflow: "hidden",
            }}
        >
            <ChatSidebar
                onlineUsers={onlineUsers}
                activeView={activeView}
                conversations={conversations}
                onSelectGlobal={handleSelectGlobal}
                onSelectDM={handleSelectDM}
                onNewDM={() => setShowNewDM(true)}
                totalUnread={totalUnread}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            {/* Conditional: Global Chat or DM View */}
            {activeView.type === "dm" && activeView.roomId && activeView.peerDomain ? (
                <DMView
                    token={token}
                    activeDomain={currentDomain}
                    roomId={activeView.roomId}
                    peerDomain={activeView.peerDomain}
                    onBack={handleDMBack}
                />
            ) : (
                /* Main global chat area */
                <div className="flex flex-col flex-1 min-w-0">
                    {/* Header */}
                    <header
                        className="flex items-center justify-between px-4 md:px-5 shrink-0"
                        style={{
                            borderBottom: "1px solid var(--border-2, #333)",
                            minHeight: "56px",
                        }}
                    >
                        <div className="flex items-center gap-2 md:gap-3">
                            {/* Mobile hamburger */}
                            <button
                                type="button"
                                onClick={() => setSidebarOpen(true)}
                                className="inline-flex md:hidden items-center justify-center"
                                style={{
                                    width: "44px",
                                    height: "44px",
                                    color: "var(--fg-2, rgba(255,255,255,0.6))",
                                    cursor: "pointer",
                                    border: "none",
                                    background: "transparent",
                                }}
                                aria-label="Open navigation"
                            >
                                <Menu size={20} />
                            </button>
                            <MessageCircle size={18} style={{ color: "var(--accent, #00ffc8)" }} aria-hidden="true" />
                            <span
                                className="text-sm font-bold uppercase tracking-widest"
                                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
                            >
                                hack.tez chat
                            </span>
                            <span
                                className="flex items-center gap-1 text-xs uppercase tracking-wide"
                                style={{ color: "var(--fg-3, #888)", letterSpacing: "0.08em" }}
                                aria-label={`${onlineUsers.length} users online`}
                            >
                                <Users size={12} aria-hidden="true" />
                                {onlineUsers.length}
                            </span>
                        </div>
                        <IdentitySelector
                            domains={domains}
                            activeDomain={currentDomain}
                            onSwitch={switchIdentity}
                        />
                    </header>

                    {/* Reconnecting banner */}
                    {!isConnected && (
                        <div
                            role="alert"
                            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest shrink-0"
                            style={{
                                background: "var(--warn-bg, rgba(255,209,102,0.08))",
                                borderBottom: "1px solid var(--warn, #ffd166)",
                                color: "var(--warn, #ffd166)",
                                fontFamily: "var(--font-mono)",
                                letterSpacing: "0.1em",
                            }}
                        >
                            <AlertTriangle size={14} aria-hidden="true" />
                            Reconnecting…
                        </div>
                    )}

                    {/* Message list */}
                    <div
                        ref={messagesContainerRef}
                        onScroll={handleScroll}
                        role="log"
                        aria-label="Chat messages"
                        aria-live="polite"
                        className="flex-1 overflow-y-auto px-4 md:px-5 py-5 flex flex-col gap-4"
                    >
                        {/* Load more indicator */}
                        {isLoading && (
                            <div className="flex justify-center py-2" aria-label="Loading older messages">
                                <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-3, #888)" }} />
                            </div>
                        )}
                        {hasMore && !isLoading && (
                            <button
                                type="button"
                                onClick={loadMore}
                                className="text-xs self-center uppercase tracking-widest font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{
                                    color: "var(--accent, #00ffc8)",
                                    background: "transparent",
                                    fontFamily: "var(--font-mono)",
                                    cursor: "pointer",
                                    minHeight: "44px",
                                    padding: "8px 16px",
                                    border: "1px solid var(--border-2, #333)",
                                    outlineColor: "var(--accent, #00ffc8)",
                                    letterSpacing: "0.1em",
                                    fontSize: "10px",
                                }}
                            >
                                ↑ Load older messages
                            </button>
                        )}

                        {/* Empty state */}
                        {messages.length === 0 && !isLoading && (
                            <div className="flex-1 flex items-center justify-center px-4">
                                <div className="text-center" style={{ color: "var(--fg-3, #888)" }}>
                                    <MessageCircle size={48} className="mx-auto mb-4 opacity-20" aria-hidden="true" />
                                    <p
                                        className="text-xs uppercase tracking-widest font-bold"
                                        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
                                    >
                                        No messages yet
                                    </p>
                                    <p
                                        className="text-xs mt-2"
                                        style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3, #888)" }}
                                    >
                                        be the first to say something
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Messages */}
                        {messages.map((msg) => (
                            <MessageBubble
                                key={msg.id}
                                id={msg.id}
                                sender={msg.sender}
                                content={msg.content}
                                timestamp={msg.timestamp}
                                isOwn={msg.sender === currentDomain}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Typing indicator */}
                    {filteredTyping.length > 0 && (
                        <div
                            className="px-5 py-1.5 text-xs uppercase tracking-wide"
                            aria-live="polite"
                            style={{
                                color: "var(--fg-3, #888)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                letterSpacing: "0.08em",
                            }}
                        >
                            {filteredTyping.length === 1
                                ? `${filteredTyping[0]} is typing…`
                                : `${filteredTyping.join(", ")} are typing…`}
                        </div>
                    )}

                    {/* Message input */}
                    <MessageInput
                        onSend={sendMessage}
                        onTyping={sendTyping}
                        disabled={!isConnected}
                    />
                </div>
            )}

            {/* New DM Modal */}
            {showNewDM && (
                <NewDMModal
                    onlineUsers={onlineUsers}
                    activeDomain={currentDomain}
                    onStartDM={handleStartDM}
                    onClose={() => setShowNewDM(false)}
                />
            )}
        </div>
    );
}
