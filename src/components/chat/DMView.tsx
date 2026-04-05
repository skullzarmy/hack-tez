import { useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, MessageCircle } from "lucide-react";
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
                className="flex items-center gap-3 px-4 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--border-2, #333)" }}
            >
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1 rounded md:hidden"
                    style={{ color: "var(--fg-muted, #888)", cursor: "pointer", border: "none", background: "transparent" }}
                    aria-label="Back"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                    <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: peerOnline ? "var(--accent, #00ffc8)" : "var(--fg-muted, #555)" }}
                    />
                    <span
                        className="text-sm font-bold tracking-wide"
                        style={{ fontFamily: "var(--font-mono)" }}
                    >
                        {peerDomain}
                    </span>
                    <span
                        className="text-[10px]"
                        style={{ color: "var(--fg-muted, #888)", fontFamily: "var(--font-mono)" }}
                    >
                        {peerOnline ? "online" : "offline"}
                    </span>
                </div>
                {!isConnected && (
                    <span
                        className="text-xs px-2 py-0.5 rounded ml-auto"
                        style={{
                            background: "rgba(255,107,107,0.15)",
                            color: "var(--err, #ff6b6b)",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        reconnecting…
                    </span>
                )}
            </header>

            {/* Message list */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
            >
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

                {messages.length === 0 && !isLoading && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center" style={{ color: "var(--fg-muted, #888)" }}>
                            <MessageCircle size={48} className="mx-auto mb-4 opacity-30" />
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
                    style={{
                        color: "var(--fg-muted, #888)",
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
