import { useRef, useEffect, useCallback } from "react";
import { MessageCircle, Hash, Users, Loader2 } from "lucide-react";
import IdentitySelector from "./IdentitySelector";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { useChat } from "../../hooks/useChat";

interface ChatLayoutProps {
    token: string;
    domains: string[];
    activeDomain: string;
    onSwitchDomain: (domain: string) => void;
}

export default function ChatLayout({ token, domains, activeDomain, onSwitchDomain }: ChatLayoutProps) {
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

    const filteredTyping = typingUsers.filter((d) => d !== currentDomain);

    return (
        <div
            className="flex"
            style={{
                height: "calc(100dvh - 60px)",
                fontFamily: "var(--font)",
            }}
        >
            {/* Sidebar — hidden on mobile */}
            <aside
                className="hidden md:flex flex-col shrink-0"
                style={{
                    width: "220px",
                    borderRight: "1px solid var(--border-2, #333)",
                    background: "var(--bg-2, #0a0a0a)",
                }}
            >
                <div
                    className="px-4 py-3 text-xs font-bold tracking-widest uppercase"
                    style={{ color: "var(--fg-muted, #888)", fontFamily: "var(--font-mono)" }}
                >
                    Rooms
                </div>
                <div
                    className="flex items-center gap-2 px-4 py-2 text-sm cursor-default"
                    style={{
                        background: "var(--accent, #00ffc8)",
                        color: "var(--bg, #000)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                    }}
                >
                    <Hash size={14} />
                    global
                </div>

                {/* Online users */}
                <div
                    className="px-4 py-3 text-xs font-bold tracking-widest uppercase"
                    style={{
                        color: "var(--fg-muted, #888)",
                        fontFamily: "var(--font-mono)",
                        borderTop: "1px solid var(--border-2, #333)",
                        marginTop: "auto",
                    }}
                >
                    Online — {onlineUsers.length}
                </div>
                <div className="px-4 pb-3 flex flex-col gap-1 overflow-y-auto max-h-40">
                    {onlineUsers.map((d) => (
                        <div
                            key={d}
                            className="flex items-center gap-2 text-xs"
                            style={{ fontFamily: "var(--font-mono)" }}
                        >
                            <span
                                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: "var(--accent, #00ffc8)" }}
                            />
                            <span className="truncate" style={{ color: "var(--fg, #eee)" }}>
                                {d}
                            </span>
                        </div>
                    ))}
                </div>
                <div
                    className="px-4 py-3 text-xs"
                    style={{ color: "var(--fg-muted, #888)", borderTop: "1px solid var(--border-2, #333)" }}
                >
                    DMs coming soon
                </div>
            </aside>

            {/* Main chat area */}
            <div className="flex flex-col flex-1 min-w-0">
                {/* Header */}
                <header
                    className="flex items-center justify-between px-4 py-3 shrink-0"
                    style={{ borderBottom: "1px solid var(--border-2, #333)" }}
                >
                    <div className="flex items-center gap-3">
                        <MessageCircle size={18} style={{ color: "var(--accent, #00ffc8)" }} />
                        <span
                            className="text-sm font-bold tracking-wide"
                            style={{ fontFamily: "var(--font-mono)" }}
                        >
                            hack.tez chat
                        </span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--fg-muted, #888)" }}>
                            <Users size={12} />
                            {onlineUsers.length}
                        </span>
                        {!isConnected && (
                            <span
                                className="text-xs px-2 py-0.5 rounded"
                                style={{
                                    background: "rgba(255,107,107,0.15)",
                                    color: "var(--err, #ff6b6b)",
                                    fontFamily: "var(--font-mono)",
                                }}
                            >
                                offline
                            </span>
                        )}
                    </div>
                    <IdentitySelector
                        domains={domains}
                        activeDomain={currentDomain}
                        onSwitch={switchIdentity}
                    />
                </header>

                {/* Reconnection banner */}
                {!isConnected && (
                    <div
                        className="flex items-center justify-center gap-2 px-4 py-2 shrink-0"
                        style={{
                            background: "rgba(255,107,107,0.1)",
                            borderBottom: "1px solid rgba(255,107,107,0.2)",
                            color: "var(--err, #ff6b6b)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.75rem",
                        }}
                    >
                        <Loader2 size={12} className="animate-spin" />
                        Connection lost — reconnecting automatically…
                    </div>
                )}

                {/* Message list */}
                <div
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
                >
                    {/* Load more indicator */}
                    {isLoading && (
                        <div className="flex justify-center py-2">
                            <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-muted, #888)" }} />
                        </div>
                    )}
                    {hasMore && !isLoading && (
                        <button
                            type="button"
                            onClick={loadMore}
                            className="text-xs self-center py-1 px-3 rounded"
                            style={{
                                color: "var(--accent, #00ffc8)",
                                background: "rgba(0,255,200,0.05)",
                                fontFamily: "var(--font-mono)",
                                cursor: "pointer",
                            }}
                        >
                            Load older messages
                        </button>
                    )}

                    {/* Empty state */}
                    {messages.length === 0 && !isLoading && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center" style={{ color: "var(--fg-muted, #888)" }}>
                                <MessageCircle size={48} className="mx-auto mb-4 opacity-30" />
                                <p className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
                                    No messages yet — be the first to say something!
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
                        className="px-4 py-1 text-xs"
                        style={{
                            color: "var(--fg-muted, #888)",
                            fontFamily: "var(--font-mono)",
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
        </div>
    );
}
