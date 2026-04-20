import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { Users, Menu, AlertTriangle, Megaphone, MessageCircle } from "lucide-react";
import IdentitySelector from "./IdentitySelector";
import ChatMessagePanel from "./ChatMessagePanel";
import ChatSidebar from "./ChatSidebar";
import DMView from "./DMView";
import NewDMModal from "./NewDMModal";
import DeleteMessageModal from "./DeleteMessageModal";
import BanUserModal from "./BanUserModal";
import BanBanner from "./BanBanner";
import ProfilePopout from "./ProfilePopout";
import AdminBroadcastPanel from "./AdminBroadcastPanel";
import ChatNotificationSettingsMenu from "./ChatNotificationSettingsMenu";
import { useChat } from "../../hooks/useChat";
import type { BanInfo } from "../../hooks/useChat";
import { useDMList } from "../../hooks/useDMList";
import {
    getChatNotificationSoundCandidates,
    loadChatNotificationSettings,
    saveChatNotificationSettings,
    shouldPlayChatNotification,
} from "../../lib/chatNotifications";
import type { ChatNotificationEvent, ChatNotificationSettings } from "../../lib/chatNotifications";
import { hackchatUrl } from "../../config/tezos";

const HIDDEN_DMS_STORAGE_KEY = "hack-tez-hidden-dms";

interface ChatLayoutProps {
    token: string;
    domains: string[];
    activeDomain: string;
    onSwitchDomain: (domain: string) => void;
    onAuthFailure?: () => void | Promise<void>;
    onPinImage?: (file: File) => Promise<{ url: string; width: number; height: number } | null>;
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

export default function ChatLayout({ token, domains, activeDomain, onSwitchDomain, onAuthFailure, onPinImage }: ChatLayoutProps) {
    const [activeView, setActiveView] = useState<ActiveView>({ type: "global" });
    const [pendingDM, setPendingDM] = useState<PendingDMSelection | null>(null);
    const [showNewDM, setShowNewDM] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [hiddenDMs, setHiddenDMs] = useState<string[]>([]);
    const [notificationSettings, setNotificationSettings] = useState<ChatNotificationSettings>(() =>
        loadChatNotificationSettings(),
    );
    const [notificationSoundUrl, setNotificationSoundUrl] = useState<string | null>(null);

    // Admin state
    const [deleteModal, setDeleteModal] = useState<{ messageId: string; senderDomain: string } | null>(null);
    const [banModal, setBanModal] = useState<{ domain: string } | null>(null);
    const [broadcastPanel, setBroadcastPanel] = useState(false);
    const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
    const [profilePopout, setProfilePopout] = useState<{ domain: string; anchorRect: DOMRect } | null>(null);
    const [globalMentionCount, setGlobalMentionCount] = useState(0);

    const activeViewRef = useRef<ActiveView>(activeView);
    const currentDomainRef = useRef(activeDomain);
    const conversationsRef = useRef<DMConversation[]>([]);
    const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
    const refreshDMsRef = useRef<() => void>(() => {});
    const authFailureInFlightRef = useRef(false);

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

            // Track mention badge when not viewing global
            if (event.mentionsMe && event.source === "global") {
                const viewingGlobal = activeViewRef.current.type === "global";
                const isDocHidden = typeof document === "undefined" ? true : document.hidden;
                if (!viewingGlobal || isDocHidden) {
                    setGlobalMentionCount((c) => c + 1);
                }
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

    const handleBanned = useCallback((ban: BanInfo) => {
        setBanInfo(ban);
    }, []);

    const handleAuthFailure = useCallback(() => {
        if (authFailureInFlightRef.current) return;
        authFailureInFlightRef.current = true;
        void onAuthFailure?.();
    }, [onAuthFailure]);

    useEffect(() => {
        authFailureInFlightRef.current = false;
    }, [token]);

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
        editMessage,
        deleteMessage,
        reactToMessage,
        adminDeleteMessage,
        adminBanUser,
        reconnect,
    } = useChat({
        token,
        activeDomain,
        onIdentitySwitched: onSwitchDomain,
        onIncomingMessage: handleIncomingMessage,
        onBanned: handleBanned,
        onAuthFailure: handleAuthFailure,
    });

    // Admin tools only active when speaking AS admin identity
    const isAdmin = useMemo(() => /^admin\.hack\.(tez|gho)$/.test(currentDomain), [currentDomain]);

    // Combine online users with all unique senders from message history for @mention candidates
    const mentionCandidates = useMemo(() => {
        const senders = new Set(onlineUsers);
        for (const m of messages) {
            if (m.sender && m.sender !== "__system__" && m.sender !== currentDomain) {
                senders.add(m.sender);
            }
        }
        return Array.from(senders);
    }, [onlineUsers, messages, currentDomain]);

    const handleBanExpired = useCallback(() => {
        setBanInfo(null);
        reconnect();
    }, [reconnect]);

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

    // Deep link from push notification clicks
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const dmRoom = params.get("dm");
        if (dmRoom) {
            // Extract peer domain from room ID (dm:domainA+domainB)
            const parts = dmRoom.replace(/^dm:/, "").split("+");
            const peer = parts.find((d) => d !== currentDomain) ?? parts[0];
            if (peer) {
                setActiveView({ type: "dm", roomId: dmRoom, peerDomain: peer });
            }
            // Clean up URL
            const url = new URL(window.location.href);
            url.searchParams.delete("dm");
            window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }

        // Listen for push-navigate messages from service worker
        const handler = (event: MessageEvent) => {
            if (event.data?.type === "push-navigate" && event.data.url) {
                const navUrl = new URL(event.data.url, window.location.origin);
                const navDm = navUrl.searchParams.get("dm");
                if (navDm) {
                    const navParts = navDm.replace(/^dm:/, "").split("+");
                    const navPeer = navParts.find((d) => d !== currentDomain) ?? navParts[0];
                    if (navPeer) setActiveView({ type: "dm", roomId: navDm, peerDomain: navPeer });
                }
            }
        };
        navigator.serviceWorker?.addEventListener("message", handler);
        return () => { navigator.serviceWorker?.removeEventListener("message", handler); };
    }, [currentDomain]);

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
        setGlobalMentionCount(0);
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
                const res = await fetch(`${hackchatUrl}/dm/create`, {
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
                globalMentionCount={globalMentionCount}
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
                    onAuthFailure={handleAuthFailure}
                    hasMultipleDomains={domains.length > 1}
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
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={() => setBroadcastPanel(true)}
                                    title="Admin Broadcast"
                                    style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--fg-2, rgba(255,255,255,0.6))",
                                        cursor: "pointer",
                                        padding: "6px",
                                        borderRadius: "6px",
                                        display: "flex",
                                        alignItems: "center",
                                    }}
                                >
                                    <Megaphone size={16} />
                                </button>
                            )}
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
                    {!isConnected && !banInfo && (
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

                    {/* Banned banner */}
                    {banInfo && (
                        <BanBanner ban={banInfo} onExpired={handleBanExpired} />
                    )}

                    <ChatMessagePanel
                        messages={messages}
                        activeDomain={currentDomain}
                        isConnected={isConnected}
                        isLoading={isLoading}
                        hasMore={hasMore}
                        loadMore={loadMore}
                        sendMessage={sendMessage}
                        sendTyping={sendTyping}
                        reactToMessage={reactToMessage}
                        editMessage={editMessage}
                        deleteMessage={deleteMessage}
                        typingUsers={filteredTyping}
                        disabled={!isConnected || !!banInfo}
                        isAdmin={isAdmin}
                        token={token}
                        gifEnabled
                        onImageUpload={onPinImage ? async (file) => {
                            const result = await onPinImage(file);
                            return result;
                        } : undefined}
                        mentionCandidates={mentionCandidates}
                        onAdminDelete={(messageId, senderDomain) => setDeleteModal({ messageId, senderDomain })}
                        onAdminBan={(domain) => setBanModal({ domain })}
                        onShowProfile={(domain, rect) => setProfilePopout({ domain, anchorRect: rect })}
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

            {/* Admin: Delete Message Modal */}
            {deleteModal && (
                <DeleteMessageModal
                    messageId={deleteModal.messageId}
                    senderDomain={deleteModal.senderDomain}
                    onConfirm={adminDeleteMessage}
                    onClose={() => setDeleteModal(null)}
                />
            )}

            {/* Admin: Ban User Modal */}
            {banModal && (
                <BanUserModal
                    domain={banModal.domain}
                    onConfirm={adminBanUser}
                    onClose={() => setBanModal(null)}
                />
            )}

            {/* Profile Popout */}
            {profilePopout && (
                <ProfilePopout
                    domain={profilePopout.domain}
                    anchorRect={profilePopout.anchorRect}
                    onClose={() => setProfilePopout(null)}
                    onStartDM={(peerDomain) => handleStartDM(peerDomain)}
                />
            )}

            {/* Admin: Broadcast Panel */}
            {broadcastPanel && (
                <AdminBroadcastPanel
                    token={token}
                    onClose={() => setBroadcastPanel(false)}
                />
            )}
        </div>
    );
}
