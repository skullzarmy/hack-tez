import { useState, useEffect, useRef, useCallback } from "react";
import PartySocket from "partysocket";
import type { ChatNotificationEvent } from "../lib/chatNotifications";
import type { ChatMessage, MediaAttachment } from "../types/chat";
import { partykitHost } from "../config/tezos";

interface BanInfo {
    type: "soft" | "hard";
    scope: "global" | "platform";
    reason: string;
    adminDomain: string;
    expiresAt: string | null;
}

interface UseChatConfig {
    token: string;
    activeDomain: string;
    onIdentitySwitched?: (domain: string) => void;
    onIncomingMessage?: (event: ChatNotificationEvent) => void;
    onBanned?: (ban: BanInfo) => void;
    onAuthFailure?: () => void | Promise<void>;
}

interface UseChatReturn {
    messages: ChatMessage[];
    isConnected: boolean;
    sendMessage: (content: string, media?: MediaAttachment, replyTo?: string) => void;
    isLoading: boolean;
    loadMore: () => void;
    hasMore: boolean;
    onlineUsers: string[];
    typingUsers: string[];
    sendTyping: (active: boolean) => void;
    activeDomain: string;
    switchIdentity: (domain: string) => void;
    // Edit + react
    editMessage: (messageId: string, content: string) => void;
    deleteMessage: (messageId: string) => void;
    reactToMessage: (messageId: string, emoji: string) => void;
    // Admin commands
    adminDeleteMessage: (messageId: string, reason: string, visible: boolean) => void;
    adminBanUser: (opts: {
        domain: string;
        banType: "soft" | "hard";
        scope: "global" | "platform";
        reason: string;
        duration?: number;
        notes?: string;
        banWallet?: boolean;
    }) => void;
    adminUnbanUser: (domain: string, reason?: string) => void;
    reconnect: () => void;
}

export type { BanInfo };
export type { ChatMessage, MediaAttachment, ReactionCount } from "../types/chat";

export function useChat(config: UseChatConfig): UseChatReturn {
    const { token, activeDomain } = config;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const [currentDomain, setCurrentDomain] = useState(activeDomain);
    const wsRef = useRef<PartySocket | null>(null);
    const historyLoadedRef = useRef(false);
    const currentDomainRef = useRef(activeDomain);
    const bannedRef = useRef(false);
    const authFailureHandledRef = useRef(false);
    const onSwitchRef = useRef(config.onIdentitySwitched);
    const onIncomingMessageRef = useRef(config.onIncomingMessage);
    const onBannedRef = useRef(config.onBanned);
    const onAuthFailureRef = useRef(config.onAuthFailure);
    onSwitchRef.current = config.onIdentitySwitched;
    onIncomingMessageRef.current = config.onIncomingMessage;
    onBannedRef.current = config.onBanned;
    onAuthFailureRef.current = config.onAuthFailure;
    currentDomainRef.current = currentDomain;

    // Sync local identity when parent session identity changes.
    useEffect(() => {
        setCurrentDomain(activeDomain);
    }, [activeDomain]);

    useEffect(() => {
        const ws = new PartySocket({
            host: partykitHost,
            room: "global",
            query: { token, activeDomain },
            connectionTimeout: 15_000,
            minReconnectionDelay: 1_500,
            maxReconnectionDelay: 10_000,
        });
        wsRef.current = ws;

        ws.addEventListener("open", () => {
            setIsConnected(true);
            authFailureHandledRef.current = false;
            // Always load history on connect/reconnect, dedup handled by ID
            ws.send(JSON.stringify({ type: "history" }));
        });

        ws.addEventListener("close", (event) => {
            setIsConnected(false);
            if (event.code === 4010) {
                bannedRef.current = true;
                ws.close(event.code, event.reason);
                return;
            }

            if ((event.code === 4001 || event.code === 4003) && !authFailureHandledRef.current) {
                authFailureHandledRef.current = true;
                ws.close(event.code, event.reason);
                void onAuthFailureRef.current?.();
            }
        });

        ws.addEventListener("message", (event) => {
            let data: Record<string, unknown>;
            try {
                data = JSON.parse(event.data as string) as Record<string, unknown>;
            } catch {
                return;
            }

            switch (data.type) {
                case "message": {
                    const msg: ChatMessage = {
                        id: data.id as string,
                        sender: data.sender as string,
                        content: data.content as string | null,
                        timestamp: data.timestamp as string,
                        deleted: (data.deleted as boolean) ?? false,
                        deletedBy: data.deletedBy as string | undefined,
                        deleteReason: data.deleteReason as string | undefined,
                        media: data.media as MediaAttachment | undefined,
                        replyTo: data.replyTo as string | undefined,
                        editedAt: data.editedAt as string | undefined,
                    };
                    let isNewMessage = false;
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === msg.id)) return prev;
                        isNewMessage = true;
                        return [...prev, msg];
                    });
                    if (isNewMessage && msg.sender !== currentDomainRef.current) {
                        // Check if message mentions the current user
                        const myLabel = currentDomainRef.current.split(".")[0];
                        const mentionPattern = new RegExp(`@${myLabel}\\b`, "i");
                        const mentionsMe = Boolean(msg.content && mentionPattern.test(msg.content));
                        onIncomingMessageRef.current?.({
                            source: "global",
                            senderDomain: msg.sender,
                            mentionsMe,
                        });
                    }
                    break;
                }
                case "history": {
                    const histMsgs = (data.messages as ChatMessage[]).reverse();
                    setMessages((prev) => {
                        // Deduplicate: only prepend messages not already present
                        const existingIds = new Set(prev.map((m) => m.id));
                        const newMsgs = histMsgs.filter((m) => !existingIds.has(m.id));
                        return newMsgs.length > 0 ? [...newMsgs, ...prev] : prev;
                    });
                    setHasMore(data.hasMore as boolean);
                    setIsLoading(false);
                    break;
                }
                case "presence": {
                    const domain = data.domain as string;
                    const status = data.status as string;
                    setOnlineUsers((prev) => {
                        if (status === "online") {
                            return prev.includes(domain) ? prev : [...prev, domain];
                        }
                        return prev.filter((d) => d !== domain);
                    });
                    // Clear typing when user goes offline
                    if (status === "offline") {
                        setTypingUsers((prev) => prev.filter((d) => d !== domain));
                    }
                    break;
                }
                case "typing": {
                    const domain = data.domain as string;
                    const active = data.active as boolean;
                    setTypingUsers((prev) => {
                        if (active) {
                            return prev.includes(domain) ? prev : [...prev, domain];
                        }
                        return prev.filter((d) => d !== domain);
                    });
                    break;
                }
                case "system": {
                    const sysMsg: ChatMessage = {
                        id: `sys-${Date.now()}`,
                        sender: "__system__",
                        content: data.content as string,
                        timestamp: (data.timestamp as string) ?? new Date().toISOString(),
                    };
                    setMessages((prev) => [...prev, sysMsg]);
                    break;
                }
                case "identity-switched": {
                    const newDomain = data.domain as string;
                    setCurrentDomain(newDomain);
                    onSwitchRef.current?.(newDomain);
                    break;
                }

                // Moderation events
                case "message-deleted": {
                    const messageId = data.messageId as string;
                    const selfDelete = data.selfDelete as boolean | undefined;
                    const visible = data.visible as boolean | undefined;
                    const deletedBy = data.deletedBy as string;
                    const reason = data.reason as string | undefined;
                    setMessages((prev) =>
                        prev.map((m) => {
                            if (m.id !== messageId) return m;
                            if (selfDelete) {
                                // Self-delete: remove from view entirely
                                return { ...m, content: null, deleted: true, deletedBy, _hidden: true } as ChatMessage & { _hidden: boolean };
                            }
                            if (visible === false) {
                                // Admin invisible delete
                                return { ...m, content: null, deleted: true, deletedBy, deleteReason: reason, _hidden: true } as ChatMessage & { _hidden: boolean };
                            }
                            return { ...m, content: null, deleted: true, deletedBy, deleteReason: reason };
                        }).filter((m) => !(m as ChatMessage & { _hidden?: boolean })._hidden),
                    );
                    break;
                }

                // Edit + reaction events
                case "message-edited": {
                    const editedId = data.messageId as string;
                    const editedContent = data.content as string;
                    const editedAt = data.editedAt as string;
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === editedId ? { ...m, content: editedContent, editedAt } : m,
                        ),
                    );
                    break;
                }
                case "reaction-update": {
                    const reactMsgId = data.messageId as string;
                    const reactEmoji = data.emoji as string;
                    const reactDomain = data.domain as string;
                    const reactAction = data.action as "add" | "remove";
                    setMessages((prev) =>
                        prev.map((m) => {
                            if (m.id !== reactMsgId) return m;
                            const existing = m.reactions ?? [];
                            if (reactAction === "add") {
                                const idx = existing.findIndex((r) => r.emoji === reactEmoji);
                                if (idx >= 0) {
                                    const updated = [...existing];
                                    const entry = updated[idx];
                                    if (!entry.domains.includes(reactDomain)) {
                                        updated[idx] = { ...entry, count: entry.count + 1, domains: [...entry.domains, reactDomain] };
                                    }
                                    return { ...m, reactions: updated };
                                }
                                return { ...m, reactions: [...existing, { emoji: reactEmoji, count: 1, domains: [reactDomain] }] };
                            } else {
                                // Idempotent: only decrement if domain is still present
                                const updated = existing.map((r) => {
                                    if (r.emoji !== reactEmoji) return r;
                                    if (!r.domains.includes(reactDomain)) return r;
                                    return { ...r, count: r.count - 1, domains: r.domains.filter((d) => d !== reactDomain) };
                                }).filter((r) => r.count > 0);
                                return { ...m, reactions: updated.length > 0 ? updated : undefined };
                            }
                        }),
                    );
                    break;
                }

                case "user-banned": {
                    const bannedDomain = data.domain as string;
                    const sysMsg: ChatMessage = {
                        id: `sys-ban-${Date.now()}`,
                        sender: "__system__",
                        content: `${bannedDomain} has been banned. Reason: ${data.reason as string}`,
                        timestamp: (data.timestamp as string) ?? new Date().toISOString(),
                    };
                    setMessages((prev) => [...prev, sysMsg]);
                    break;
                }
                case "user-unbanned": {
                    const unbannedDomain = data.domain as string;
                    const sysMsg: ChatMessage = {
                        id: `sys-unban-${Date.now()}`,
                        sender: "__system__",
                        content: `${unbannedDomain} has been unbanned.`,
                        timestamp: (data.timestamp as string) ?? new Date().toISOString(),
                    };
                    setMessages((prev) => [...prev, sysMsg]);
                    break;
                }
                case "error": {
                    // Handle ban error specifically
                    if (data.code === "BANNED" && data.ban) {
                        bannedRef.current = true;
                        onBannedRef.current?.(data.ban as BanInfo);
                        ws.close(4010, "Banned");
                        break;
                    }

                    if (
                        (data.code === "AUTH_INVALID" ||
                            data.code === "AUTH_REQUIRED" ||
                            data.code === "OWNERSHIP_CHANGED") &&
                        !authFailureHandledRef.current
                    ) {
                        authFailureHandledRef.current = true;
                        ws.close(4001, String(data.code));
                        void onAuthFailureRef.current?.();
                    }
                    break;
                }
            }
        });

        return () => {
            ws.close();
            wsRef.current = null;
            setIsConnected(false);
            historyLoadedRef.current = false;
        };
    }, [token, activeDomain]);

    const sendMessage = useCallback((content: string, media?: MediaAttachment, replyTo?: string) => {
        const trimmed = content.trim();
        if (!trimmed && !media) return;
        if (!wsRef.current) return;
        const msg: Record<string, unknown> = { type: "message", content: trimmed };
        if (media) msg.media = media;
        if (replyTo) msg.replyTo = replyTo;
        wsRef.current.send(JSON.stringify(msg));
    }, []);

    const sendTyping = useCallback((active: boolean) => {
        wsRef.current?.send(JSON.stringify({ type: "typing", active }));
    }, []);

    const loadMore = useCallback(() => {
        if (isLoading || !hasMore || !wsRef.current || messages.length === 0) return;
        setIsLoading(true);
        const oldest = messages[0];
        wsRef.current.send(JSON.stringify({ type: "history", before: oldest.timestamp }));
    }, [isLoading, hasMore, messages]);

    // Include own domain in online users for display
    useEffect(() => {
        if (isConnected) {
            setOnlineUsers((prev) => (prev.includes(currentDomain) ? prev : [...prev, currentDomain]));
        }
    }, [isConnected, currentDomain]);

    const switchIdentity = useCallback((domain: string) => {
        wsRef.current?.send(JSON.stringify({ type: "switch-identity", domain }));
    }, []);

    // Edit + delete + react
    const editMessage = useCallback((messageId: string, content: string) => {
        wsRef.current?.send(JSON.stringify({ type: "edit-message", messageId, content }));
    }, []);

    const deleteMessage = useCallback((messageId: string) => {
        wsRef.current?.send(JSON.stringify({ type: "delete-message", messageId }));
    }, []);

    const reactToMessage = useCallback((messageId: string, emoji: string) => {
        const domain = currentDomainRef.current;

        // Optimistic update — apply locally before round-trip
        setMessages((prev) =>
            prev.map((m) => {
                if (m.id !== messageId) return m;
                const existing = m.reactions ?? [];
                const idx = existing.findIndex((r) => r.emoji === emoji);
                const alreadyReacted = idx >= 0 && existing[idx].domains.includes(domain);

                if (alreadyReacted) {
                    // Remove own reaction
                    const updated = existing.map((r) => {
                        if (r.emoji !== emoji) return r;
                        return { ...r, count: r.count - 1, domains: r.domains.filter((d) => d !== domain) };
                    }).filter((r) => r.count > 0);
                    return { ...m, reactions: updated.length > 0 ? updated : undefined };
                } else if (idx >= 0) {
                    // Add to existing emoji
                    const updated = [...existing];
                    const entry = updated[idx];
                    updated[idx] = { ...entry, count: entry.count + 1, domains: [...entry.domains, domain] };
                    return { ...m, reactions: updated };
                } else {
                    // New emoji
                    return { ...m, reactions: [...existing, { emoji, count: 1, domains: [domain] }] };
                }
            }),
        );

        wsRef.current?.send(JSON.stringify({ type: "react", messageId, emoji }));
    }, []);

    // Admin commands
    const adminDeleteMessage = useCallback((messageId: string, reason: string, visible: boolean) => {
        wsRef.current?.send(JSON.stringify({
            type: "admin:delete-message", messageId, reason, visible,
        }));
    }, []);

    const adminBanUser = useCallback((opts: {
        domain: string; banType: "soft" | "hard"; scope: "global" | "platform";
        reason: string; duration?: number; notes?: string; banWallet?: boolean;
    }) => {
        wsRef.current?.send(JSON.stringify({ type: "admin:ban-user", ...opts }));
    }, []);

    const adminUnbanUser = useCallback((domain: string, reason?: string) => {
        wsRef.current?.send(JSON.stringify({
            type: "admin:unban-user", domain, reason: reason ?? "Unbanned by admin",
        }));
    }, []);

    // Force reconnect (used after ban expiry)
    const reconnect = useCallback(() => {
        bannedRef.current = false;
        authFailureHandledRef.current = false;
        if (wsRef.current) {
            wsRef.current.reconnect();
            return;
        }
    }, []);

    return {
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
        adminUnbanUser,
        reconnect,
    };
}
