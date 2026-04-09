import { useRef, useEffect, useCallback, useState, useLayoutEffect } from "react";
import { MessageCircle, Users, Loader2, Menu, AlertTriangle } from "lucide-react";
import IdentitySelector from "./IdentitySelector";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import ChatSidebar from "./ChatSidebar";
import DMView from "./DMView";
import NewDMModal from "./NewDMModal";
import ChatNotificationSettingsMenu from "./ChatNotificationSettingsMenu";
import { useChat } from "../../hooks/useChat";
import { useDMList } from "../../hooks/useDMList";
import {
    getChatNotificationSoundCandidates,
    loadChatNotificationSettings,
    saveChatNotificationSettings,
    shouldPlayChatNotification,
} from "../../lib/chatNotifications";
import type { ChatNotificationEvent, ChatNotificationSettings } from "../../lib/chatNotifications";

const HACKCHAT_URL = import.meta.env.VITE_HACKCHAT_URL ?? "http://localhost:8787";
const HIDDEN_DMS_STORAGE_KEY = "hack-tez-hidden-dms";

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

interface PendingDMSelection {
    roomId: string;
    peerDomain: string;
    ownDomain: string;
}

interface DMConversation {
    roomId: string;
    ownDomain: string;
    peerDomain: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
}

export default function ChatLayout({ token, domains, activeDomain, onSwitchDomain }: ChatLayoutProps) {
    const [activeView, setActiveView] = useState<ActiveView>({ type: "global" });
    const [pendingDM, setPendingDM] = useState<PendingDMSelection | null>(null);
    const [showNewDM, setShowNewDM] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [hiddenDMs, setHiddenDMs] = useState<string[]>([]);
    const [notificationSettings, setNotificationSettings] = useState<ChatNotificationSettings>(() =>
        loadChatNotificationSettings(),
    );
    const [notificationSoundUrl, setNotificationSoundUrl] = useState<string | null>(null);

    const activeViewRef = useRef<ActiveView>(activeView);
    const currentDomainRef = useRef(activeDomain);
    const conversationsRef = useRef<DMConversation[]>([]);
    const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
    const refreshDMsRef = useRef<() => void>(() => {});

    useEffect(() => {
        activeViewRef.current = activeView;
    }, [activeView]);

    const playNotificationSound = useCallback(() => {
        const audio = notificationAudioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        void audio.play().catch(() => {
            // Autoplay can be blocked until user gesture.
        });
    }, []);

    const handleIncomingMessage = useCallback(
        (event: ChatNotificationEvent) => {
            if (event.source === "dm") {
                refreshDMsRef.current();
            }

            const knownDMRoomIds = new Set(conversationsRef.current.map((conv) => conv.roomId));
            const isDocumentHidden = typeof document === "undefined" ? true : document.hidden;

            const shouldPlay = shouldPlayChatNotification({
                settings: notificationSettings,
                event,
                activeView: activeViewRef.current,
                currentDomain: currentDomainRef.current,
                knownDMRoomIds,
                isDocumentHidden,
            });

            if (!shouldPlay) return;
            playNotificationSound();
        },
        [notificationSettings, playNotificationSound],
    );

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
    } = useChat({
        token,
        activeDomain,
        onIdentitySwitched: onSwitchDomain,
        onIncomingMessage: handleIncomingMessage,
    });

    const { conversations, totalUnread, refresh: refreshDMs } = useDMList({ token, activeDomain: currentDomain });

    useEffect(() => {
        refreshDMsRef.current = refreshDMs;
    }, [refreshDMs]);

    useEffect(() => {
        currentDomainRef.current = currentDomain;
    }, [currentDomain]);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    useEffect(() => {
        let cancelled = false;

        async function resolveNotificationSound() {
            if (typeof document === "undefined") return;
            const audio = document.createElement("audio");

            for (const candidate of getChatNotificationSoundCandidates()) {
                if (audio.canPlayType(candidate.mime) === "") continue;

                try {
                    const response = await fetch(candidate.url, {
                        method: "HEAD",
                        cache: "force-cache",
                    });

                    if (response.ok) {
                        if (!cancelled) setNotificationSoundUrl(candidate.url);
                        return;
                    }
                } catch {
                    // Try the next source.
                }
            }

            if (!cancelled) {
                setNotificationSoundUrl("/chatnotification.mp3");
            }
        }

        void resolveNotificationSound();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!notificationSoundUrl) {
            notificationAudioRef.current = null;
            return;
        }

        const audio = new Audio(notificationSoundUrl);
        audio.preload = "auto";
        notificationAudioRef.current = audio;

        return () => {
            audio.pause();
            notificationAudioRef.current = null;
        };
    }, [notificationSoundUrl]);

    const updateNotificationSettings = useCallback(
        (updater: (prev: ChatNotificationSettings) => ChatNotificationSettings) => {
            setNotificationSettings((prev) => {
                const next = updater(prev);
                saveChatNotificationSettings(next);
                return next;
            });
        },
        [],
    );

    const toggleGlobalNotifications = useCallback(() => {
        updateNotificationSettings((prev) => ({
            ...prev,
            globalEnabled: !prev.globalEnabled,
        }));
    }, [updateNotificationSettings]);

    const toggleMuteForegroundConversation = useCallback(() => {
        updateNotificationSettings((prev) => ({
            ...prev,
            muteForegroundConversation: !prev.muteForegroundConversation,
        }));
    }, [updateNotificationSettings]);

    const toggleMuteNewDMs = useCallback(() => {
        updateNotificationSettings((prev) => ({
            ...prev,
            muteNewDMs: !prev.muteNewDMs,
        }));
    }, [updateNotificationSettings]);

    const toggleMuteGlobalChannel = useCallback(() => {
        updateNotificationSettings((prev) => {
            const id = "global";
            const muted = prev.mutedChannelIds.includes(id)
                ? prev.mutedChannelIds.filter((channelId) => channelId !== id)
                : [...prev.mutedChannelIds, id];
            return { ...prev, mutedChannelIds: muted };
        });
    }, [updateNotificationSettings]);

    const toggleMuteActiveDM = useCallback(() => {
        if (activeView.type !== "dm" || !activeView.roomId) return;
        const roomId = activeView.roomId;
        updateNotificationSettings((prev) => {
            const muted = prev.mutedDMRoomIds.includes(roomId)
                ? prev.mutedDMRoomIds.filter((id) => id !== roomId)
                : [...prev.mutedDMRoomIds, roomId];
            return { ...prev, mutedDMRoomIds: muted };
        });
    }, [activeView, updateNotificationSettings]);

    const isGlobalChannelMuted = notificationSettings.mutedChannelIds.includes("global");
    const isActiveDMMuted = Boolean(
        activeView.type === "dm" &&
        activeView.roomId &&
        notificationSettings.mutedDMRoomIds.includes(activeView.roomId),
    );

    useEffect(() => {
        try {
            const raw = localStorage.getItem(HIDDEN_DMS_STORAGE_KEY);
            if (!raw) {
                setHiddenDMs([]);
                return;
            }
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                setHiddenDMs(parsed.filter((v): v is string => typeof v === "string"));
            }
        } catch {
            setHiddenDMs([]);
        }
    }, []);

    const persistHiddenDMs = useCallback((value: string[]) => {
        setHiddenDMs(value);
        try {
            localStorage.setItem(HIDDEN_DMS_STORAGE_KEY, JSON.stringify(value));
        } catch {
            // Ignore storage failures.
        }
    }, []);

    const visibleConversations = conversations.filter(
        (conv) => !hiddenDMs.includes(conv.roomId) || conv.unreadCount > 0,
    );

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);
    const isInitialLoadRef = useRef(true);

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

    // Reset pin-to-bottom state when entering global view.
    useEffect(() => {
        if (activeView.type !== "global") return;
        shouldAutoScrollRef.current = true;
        isInitialLoadRef.current = true;
    }, [activeView.type]);

    // Pin to latest before paint to avoid initial top->bottom visible motion.
    useLayoutEffect(() => {
        if (activeView.type !== "global") return;
        if (messages.length === 0 && isInitialLoadRef.current) return;
        if (!shouldAutoScrollRef.current) return;
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
        isInitialLoadRef.current = false;
    }, [activeView.type, messages.length]);

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

    const handleSelectDM = useCallback(
        (roomId: string, peerDomain: string, ownDomain: string) => {
            if (ownDomain !== currentDomain) {
                switchIdentity(ownDomain);
                setPendingDM({ roomId, peerDomain, ownDomain });
                setSidebarOpen(false);
                return;
            }
            setActiveView({ type: "dm", roomId, peerDomain });
            setPendingDM(null);
            setSidebarOpen(false);
        },
        [currentDomain, switchIdentity],
    );

    useEffect(() => {
        if (!pendingDM) return;
        if (pendingDM.ownDomain !== currentDomain) return;
        setActiveView({ type: "dm", roomId: pendingDM.roomId, peerDomain: pendingDM.peerDomain });
        setPendingDM(null);
    }, [pendingDM, currentDomain]);

    const handleStartDM = useCallback(
        async (targetDomain: string) => {
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
        },
        [token, currentDomain, refreshDMs],
    );

    const handleDMBack = useCallback(() => {
        setPendingDM(null);
        setActiveView({ type: "global" });
        refreshDMs();
    }, [refreshDMs]);

    const handleHideDM = useCallback(
        (roomId: string) => {
            if (!hiddenDMs.includes(roomId)) {
                persistHiddenDMs([...hiddenDMs, roomId]);
            }
            if (activeView.type === "dm" && activeView.roomId === roomId) {
                setActiveView({ type: "global" });
            }
        },
        [hiddenDMs, persistHiddenDMs, activeView],
    );

    const handleClearHiddenDMs = useCallback(() => {
        persistHiddenDMs([]);
    }, [persistHiddenDMs]);

    return (
        <div
            className="flex"
            style={{
                flex: "1 1 0",
                minHeight: 0,
                fontFamily: "var(--font)",
                margin: "clamp(0.5rem, 1.5vw, 1rem)",
                marginTop: "clamp(0.5rem, 1.5vw, 1rem)",
                marginBottom: 0,
                border: "1px solid var(--border-2, #333)",
                overflow: "hidden",
            }}
        >
            <ChatSidebar
                onlineUsers={onlineUsers}
                activeView={activeView}
                conversations={visibleConversations}
                onSelectGlobal={handleSelectGlobal}
                onSelectDM={handleSelectDM}
                onHideDM={handleHideDM}
                onClearHidden={handleClearHiddenDMs}
                hiddenCount={hiddenDMs.length}
                onNewDM={() => setShowNewDM(true)}
                totalUnread={totalUnread}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            {/* Conditional: Global Chat or DM View */}
            {activeView.type === "dm" && activeView.roomId && activeView.peerDomain ? (
                <DMView
                    key={`${activeView.roomId}:${activeView.peerDomain}`}
                    token={token}
                    activeDomain={currentDomain}
                    roomId={activeView.roomId}
                    peerDomain={activeView.peerDomain}
                    onBack={handleDMBack}
                    onIncomingMessage={handleIncomingMessage}
                    notificationSettings={notificationSettings}
                    isGlobalChannelMuted={isGlobalChannelMuted}
                    isActiveDMMuted={isActiveDMMuted}
                    onToggleGlobalEnabled={toggleGlobalNotifications}
                    onToggleMuteForegroundConversation={toggleMuteForegroundConversation}
                    onToggleMuteNewDMs={toggleMuteNewDMs}
                    onToggleMuteGlobalChannel={toggleMuteGlobalChannel}
                    onToggleMuteActiveDM={toggleMuteActiveDM}
                />
            ) : (
                /* Main global chat area */
                <div className="flex flex-col flex-1 min-w-0">
                    {/* Header */}
                    <header
                        className="flex items-center justify-between shrink-0 px-6"
                        style={{
                            borderBottom: "1px solid var(--border-2, #333)",
                            minHeight: "56px",
                        }}
                    >
                        <div className="flex items-center gap-3">
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
                                hackchat
                            </span>
                            <span
                                className="flex items-center text-xs uppercase tracking-wide gap-1"
                                style={{ color: "var(--fg-3, #888)", letterSpacing: "0.08em" }}
                                title={`${onlineUsers.length} users online`}
                            >
                                <Users size={12} aria-hidden="true" />
                                {onlineUsers.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <IdentitySelector
                                domains={domains}
                                activeDomain={currentDomain}
                                onSwitch={switchIdentity}
                            />
                            <ChatNotificationSettingsMenu
                                settings={notificationSettings}
                                isGlobalChannelMuted={isGlobalChannelMuted}
                                isActiveDMMuted={isActiveDMMuted}
                                hasActiveDM={activeView.type === "dm"}
                                onToggleGlobalEnabled={toggleGlobalNotifications}
                                onToggleMuteForegroundConversation={toggleMuteForegroundConversation}
                                onToggleMuteNewDMs={toggleMuteNewDMs}
                                onToggleMuteGlobalChannel={toggleMuteGlobalChannel}
                                onToggleMuteActiveDM={toggleMuteActiveDM}
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
                        aria-label="Chat messages"
                        aria-live="polite"
                        className="flex-1 overflow-y-auto flex flex-col px-6 py-5 gap-4"
                    >
                        {/* Load more indicator */}
                        {isLoading && (
                            <div className="flex justify-center py-2">
                                <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-3, #888)" }} />
                            </div>
                        )}
                        {/* Empty state */}
                        {messages.length === 0 && !isLoading && (
                            <div className="flex-1 flex items-center justify-center px-4">
                                <div className="text-center" style={{ color: "var(--fg-3, #888)" }}>
                                    <MessageCircle size={48} className="opacity-20 mx-auto mb-4" aria-hidden="true" />
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
                            className="text-xs uppercase tracking-wide px-7 py-1.5"
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
                    <MessageInput onSend={sendMessage} onTyping={sendTyping} disabled={!isConnected} />
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
