import { useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, MessageCircle, AlertTriangle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { useDM } from "../../hooks/useDM";

interface DMViewProps {
    token: string;
    activeDomain: string;
    roomId: string;
    peerDomain: string;
    onBack: () => void;
}

export default function DMView({ token, activeDomain, roomId, peerDomain, onBack }: DMViewProps) {
    const {
        messages,
        isConnected,
        sendMessage,
        isLoading,
        loadMore,
        hasMore,
        peerTyping,
        sendTyping,
        markRead,
        peerOnline,
    } = useDM({ token, activeDomain, roomId, peerDomain });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);

    const handleScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        shouldAutoScrollRef.current = distFromBottom < 100;

        if (el.scrollTop < 50 && hasMore && !isLoading) {
            loadMore();
        }
    }, [hasMore, isLoading, loadMore]);

    // Auto-scroll on new messages
    useEffect(() => {
        if (shouldAutoScrollRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages.length]);

    // Mark as read when messages arrive while viewing
    useEffect(() => {
        if (messages.length > 0 && isConnected) {
            markRead();
        }
    }, [messages.length, isConnected, markRead]);

    return (
        <div className="flex flex-col flex-1 min-w-0">
            {/* Header */}
            <header
                className="flex items-center gap-2 md:gap-3 px-3 md:px-4 shrink-0"
                style={{
                    borderBottom: "1px solid var(--border-2, #333)",
                    minHeight: "52px",
                }}
            >
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                        width: "44px",
                        height: "44px",
                        color: "var(--fg-2, rgba(255,255,255,0.6))",
                        cursor: "pointer",
                        border: "none",
                        background: "transparent",
                        outlineColor: "var(--accent, #00ffc8)",
                    }}
                    aria-label="Back to chat"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                    <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: peerOnline ? "var(--accent, #00ffc8)" : "var(--fg-3, #555)" }}
                        aria-hidden="true"
                    />
                    <span
                        className="text-sm font-bold tracking-wide"
                        style={{ fontFamily: "var(--font-mono)" }}
                    >
                        {peerDomain}
                    </span>
                    <span
                        className="text-xs"
                        style={{ color: "var(--fg-2, rgba(255,255,255,0.6))", fontFamily: "var(--font-mono)" }}
                    >
                        {peerOnline ? "online" : "offline"}
                    </span>
                    <span className="sr-only">
                        {peerDomain} is {peerOnline ? "online" : "offline"}
                    </span>
                </div>
            </header>

            {/* Reconnecting banner */}
            {!isConnected && (
                <div
                    role="alert"
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold shrink-0"
                    style={{
                        background: "var(--warn-bg, rgba(255,209,102,0.08))",
                        borderBottom: "1px solid var(--warn, #ffd166)",
                        color: "var(--warn, #ffd166)",
                        fontFamily: "var(--font-mono)",
                    }}
                >
                    <AlertTriangle size={16} aria-hidden="true" />
                    Reconnecting…
                </div>
            )}

            {/* Message list */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                role="log"
                aria-label={`DM with ${peerDomain}`}
                aria-live="polite"
                className="flex-1 overflow-y-auto px-3 md:px-4 py-4 flex flex-col gap-3"
            >
                {isLoading && (
                    <div className="flex justify-center py-2" aria-label="Loading older messages">
                        <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-2, rgba(255,255,255,0.6))" }} />
                    </div>
                )}
                {hasMore && !isLoading && (
                    <button
                        type="button"
                        onClick={loadMore}
                        className="text-xs self-center rounded focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                            color: "var(--accent, #00ffc8)",
                            background: "rgba(0,255,200,0.05)",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                            minHeight: "44px",
                            padding: "8px 16px",
                            outlineColor: "var(--accent, #00ffc8)",
                        }}
                    >
                        Load older messages
                    </button>
                )}

                {messages.length === 0 && !isLoading && (
                    <div className="flex-1 flex items-center justify-center px-4">
                        <div className="text-center" style={{ color: "var(--fg-2, rgba(255,255,255,0.6))" }}>
                            <MessageCircle size={48} className="mx-auto mb-4 opacity-30" aria-hidden="true" />
                            <p className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
                                Start a conversation with {peerDomain}
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <MessageBubble
                        key={msg.id}
                        id={msg.id}
                        sender={msg.sender}
                        content={msg.content}
                        timestamp={msg.timestamp}
                        isOwn={msg.sender === activeDomain}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            {peerTyping && (
                <div
                    className="px-4 py-1 text-xs"
                    aria-live="polite"
                    style={{
                        color: "var(--fg-2, rgba(255,255,255,0.6))",
                        fontFamily: "var(--font-mono)",
                    }}
                >
                    {peerDomain} is typing…
                </div>
            )}

            {/* Message input */}
            <MessageInput
                onSend={sendMessage}
                onTyping={sendTyping}
                disabled={!isConnected}
            />
        </div>
    );
}
