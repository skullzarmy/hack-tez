const CHAT_NOTIFICATION_STORAGE_KEY = "hack-tez-chat-notifications";

export interface ChatNotificationSettings {
    globalEnabled: boolean;
    muteForegroundConversation: boolean;
    muteNewDMs: boolean;
    mutedDMRoomIds: string[];
    mutedChannelIds: string[];
}

export interface ChatNotificationEvent {
    source: "global" | "dm" | "channel";
    senderDomain: string;
    roomId?: string;
    channelId?: string;
    mentionsMe?: boolean;
}

export interface ActiveChatView {
    type: "global" | "dm";
    roomId?: string;
}

interface ShouldPlayChatNotificationArgs {
    settings: ChatNotificationSettings;
    event: ChatNotificationEvent;
    activeView: ActiveChatView;
    currentDomain: string;
    knownDMRoomIds: Set<string>;
    isDocumentHidden: boolean;
}

const DEFAULT_CHAT_NOTIFICATION_SETTINGS: ChatNotificationSettings = {
    globalEnabled: true,
    muteForegroundConversation: true,
    muteNewDMs: false,
    mutedDMRoomIds: [],
    mutedChannelIds: [],
};

export function getDefaultChatNotificationSettings(): ChatNotificationSettings {
    return { ...DEFAULT_CHAT_NOTIFICATION_SETTINGS };
}

function sanitizeSettings(raw: unknown): ChatNotificationSettings {
    if (!raw || typeof raw !== "object") return getDefaultChatNotificationSettings();
    const candidate = raw as Partial<ChatNotificationSettings>;
    return {
        globalEnabled:
            typeof candidate.globalEnabled === "boolean"
                ? candidate.globalEnabled
                : DEFAULT_CHAT_NOTIFICATION_SETTINGS.globalEnabled,
        muteForegroundConversation:
            typeof candidate.muteForegroundConversation === "boolean"
                ? candidate.muteForegroundConversation
                : DEFAULT_CHAT_NOTIFICATION_SETTINGS.muteForegroundConversation,
        muteNewDMs:
            typeof candidate.muteNewDMs === "boolean"
                ? candidate.muteNewDMs
                : DEFAULT_CHAT_NOTIFICATION_SETTINGS.muteNewDMs,
        mutedDMRoomIds: Array.isArray(candidate.mutedDMRoomIds)
            ? candidate.mutedDMRoomIds.filter((v): v is string => typeof v === "string")
            : [],
        mutedChannelIds: Array.isArray(candidate.mutedChannelIds)
            ? candidate.mutedChannelIds.filter((v): v is string => typeof v === "string")
            : [],
    };
}

export function loadChatNotificationSettings(): ChatNotificationSettings {
    if (typeof window === "undefined") return getDefaultChatNotificationSettings();
    try {
        const raw = localStorage.getItem(CHAT_NOTIFICATION_STORAGE_KEY);
        if (!raw) return getDefaultChatNotificationSettings();
        return sanitizeSettings(JSON.parse(raw));
    } catch {
        return getDefaultChatNotificationSettings();
    }
}

export function saveChatNotificationSettings(settings: ChatNotificationSettings): void {
    if (typeof window === "undefined") return;
    const sanitized = sanitizeSettings(settings);
    try {
        localStorage.setItem(CHAT_NOTIFICATION_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
        // Ignore storage quota failures.
    }
}

export function shouldPlayChatNotification({
    settings,
    event,
    activeView,
    currentDomain,
    knownDMRoomIds,
    isDocumentHidden,
}: ShouldPlayChatNotificationArgs): boolean {
    if (!settings.globalEnabled) return false;
    if (event.senderDomain === currentDomain) return false;

    // Mentions always notify — skip mute checks
    if (event.mentionsMe) return true;

    if (event.source === "global" && settings.mutedChannelIds.includes("global")) {
        return false;
    }

    if (settings.muteForegroundConversation && !isDocumentHidden) {
        if (event.source === "global" && activeView.type === "global") return false;
        if (
            event.source === "dm" &&
            activeView.type === "dm" &&
            Boolean(event.roomId) &&
            activeView.roomId === event.roomId
        ) {
            return false;
        }
    }

    if (event.source === "dm") {
        if (event.roomId && settings.mutedDMRoomIds.includes(event.roomId)) return false;
        if (settings.muteNewDMs && event.roomId && !knownDMRoomIds.has(event.roomId)) return false;
    }

    if (event.source === "channel" && event.channelId && settings.mutedChannelIds.includes(event.channelId)) {
        return false;
    }

    return true;
}

interface ChatNotificationSoundCandidate {
    url: string;
    mime: string;
}

export function getChatNotificationSoundCandidates(): ChatNotificationSoundCandidate[] {
    return [
        { url: "/chatnotification.webm", mime: 'audio/webm; codecs="opus"' },
        { url: "/chatnotification.ogg", mime: 'audio/ogg; codecs="opus"' },
        { url: "/chatnotification.mp3", mime: "audio/mpeg" },
    ];
}
