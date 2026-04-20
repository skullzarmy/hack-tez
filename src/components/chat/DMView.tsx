import { useRef, useEffect } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import ChatMessagePanel from "./ChatMessagePanel";
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
    hasMultipleDomains?: boolean;
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
    hasMultipleDomains,
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
        reactToMessage,
        editMessage,
        deleteMessage,
    } = useDM({ token, activeDomain, roomId, peerDomain, onIncomingMessage });

    const prevPeerRef = useRef(peerDomain);

    // Mark as read when messages arrive while viewing
    useEffect(() => {
        if (messages.length > 0 && isConnected) {
            markRead();
        }
    }, [messages.length, isConnected, markRead]);

    // Reset on peer change
    useEffect(() => {
        prevPeerRef.current = peerDomain;
    }, [peerDomain]);

    const typingUsers = peerTyping ? [peerDomain] : [];

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
                    <div className="flex flex-col">
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
                        {hasMultipleDomains && (
                            <span
                                style={{
                                    color: "var(--fg-3, #666)",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "9px",
                                    letterSpacing: "0.08em",
                                    marginLeft: "14px",
                                }}
                            >
                                as {activeDomain}
                            </span>
                        )}
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

            <ChatMessagePanel
                messages={messages}
                activeDomain={activeDomain}
                isConnected={isConnected}
                isLoading={isLoading}
                hasMore={hasMore}
                loadMore={loadMore}
                sendMessage={sendMessage}
                sendTyping={sendTyping}
                reactToMessage={reactToMessage}
                editMessage={editMessage}
                deleteMessage={deleteMessage}
                typingUsers={typingUsers}
                emptyLabel="Start a conversation"
                emptySubLabel={`with ${peerDomain}`}
                ariaLabel={`DM with ${peerDomain}`}
                token={token}
            />
        </div>
    );
}
