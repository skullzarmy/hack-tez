import { useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { ArrowLeft, Loader2, MessageCircle, AlertTriangle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import ChatNotificationSettingsMenu from "./ChatNotificationSettingsMenu";
import { useDM } from "../../hooks/useDM";
import type { ChatNotificationEvent, ChatNotificationSettings } from "../../lib/chatNotifications";

interface DMViewProps {
    token: string;
    activeDomain: string;
    roomId: string;
    peerDomain: string;
    onBack: () => void;
    onIncomingMessage?: (event: ChatNotificationEvent) => void;
    notificationSettings: ChatNotificationSettings;
    isGlobalChannelMuted: boolean;
    isActiveDMMuted: boolean;
    onToggleGlobalEnabled: () => void;
    onToggleMuteForegroundConversation: () => void;
    onToggleMuteNewDMs: () => void;
    onToggleMuteGlobalChannel: () => void;
    onToggleMuteActiveDM: () => void;
}

export default function DMView({
    token,
    activeDomain,
    roomId,
    peerDomain,
    onBack,
    onIncomingMessage,
    notificationSettings,
    isGlobalChannelMuted,
    isActiveDMMuted,
    onToggleGlobalEnabled,
    onToggleMuteForegroundConversation,
    onToggleMuteNewDMs,
    onToggleMuteGlobalChannel,
    onToggleMuteActiveDM,
}: DMViewProps) {
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
    } = useDM({ token, activeDomain, roomId, peerDomain, onIncomingMessage });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);
    const isInitialLoadRef = useRef(true);

    const handleScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        shouldAutoScrollRef.current = distFromBottom < 100;

        if (el.scrollTop < 50 && hasMore && !isLoading) {
            loadMore();
        }
    }, [hasMore, isLoading, loadMore]);

    // Pin to latest without animation to avoid visible top->bottom movement.
    useLayoutEffect(() => {
        if (messages.length === 0 && isInitialLoadRef.current) return;
        if (!shouldAutoScrollRef.current) return;
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
        isInitialLoadRef.current = false;
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
                className="flex items-center justify-between shrink-0 px-6 gap-3"
                style={{
                    borderBottom: "1px solid var(--border-2, #333)",
                    minHeight: "56px",
                }}
            >
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onBack}
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
                        aria-label="Back to chat"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <span
                            className="inline-block w-1.5 h-1.5 shrink-0"
                            style={{ background: peerOnline ? "var(--accent, #00ffc8)" : "var(--fg-3, #555)" }}
                            aria-hidden="true"
                        />
                        <span
                            className="text-sm font-bold uppercase tracking-widest"
                            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}
                        >
                            {peerDomain}
                        </span>
                        <span
                            className="text-[10px] uppercase tracking-widest"
                            style={{
                                color: "var(--fg-3, #888)",
                                fontFamily: "var(--font-mono)",
                                letterSpacing: "0.12em",
                            }}
                        >
                            {peerOnline ? "online" : "offline"}
                        </span>
                        <span className="sr-only">
                            {peerDomain} is {peerOnline ? "online" : "offline"}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <ChatNotificationSettingsMenu
                        settings={notificationSettings}
                        isGlobalChannelMuted={isGlobalChannelMuted}
                        isActiveDMMuted={isActiveDMMuted}
                        hasActiveDM={true}
                        onToggleGlobalEnabled={onToggleGlobalEnabled}
                        onToggleMuteForegroundConversation={onToggleMuteForegroundConversation}
                        onToggleMuteNewDMs={onToggleMuteNewDMs}
                        onToggleMuteGlobalChannel={onToggleMuteGlobalChannel}
                        onToggleMuteActiveDM={onToggleMuteActiveDM}
                    />
                </div>
            </header>

            {/* Reconnecting banner */}
            {!isConnected && (
                <div
                    role="alert"
                    className="flex items-center justify-center text-xs font-bold uppercase tracking-widest shrink-0 px-4 py-2 gap-2"
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
                aria-label={`DM with ${peerDomain}`}
                aria-live="polite"
                className="flex-1 overflow-y-auto flex flex-col px-6 py-5 gap-4"
            >
                {isLoading && (
                    <div className="flex justify-center py-2">
                        <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-3, #888)" }} />
                    </div>
                )}
                {messages.length === 0 && !isLoading && (
                    <div className="flex-1 flex items-center justify-center px-4">
                        <div className="text-center" style={{ color: "var(--fg-3, #888)" }}>
                            <MessageCircle size={48} className="opacity-20 mx-auto mb-4" aria-hidden="true" />
                            <p
                                className="text-xs uppercase tracking-widest font-bold"
                                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
                            >
                                Start a conversation
                            </p>
                            <p
                                className="text-xs mt-2"
                                style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3, #888)" }}
                            >
                                with {peerDomain}
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
                    className="text-xs uppercase tracking-wide px-7 py-1.5"
                    aria-live="polite"
                    style={{
                        color: "var(--fg-3, #888)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        letterSpacing: "0.08em",
                    }}
                >
                    {peerDomain} is typing…
                </div>
            )}

            {/* Message input */}
            <MessageInput onSend={sendMessage} onTyping={sendTyping} disabled={!isConnected} />
        </div>
    );
}
