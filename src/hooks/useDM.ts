import { useState, useEffect, useRef, useCallback } from "react";
import PartySocket from "partysocket";
import type { ChatNotificationEvent } from "../lib/chatNotifications";
import { partykitHost } from "../config/tezos";
import type { ChatMessage, MediaAttachment } from "../types/chat";
import { fetchWsTicket } from "../lib/wsTicket";

interface UseDMConfig {
    token: string;
    activeDomain: string;
    roomId: string;
    peerDomain: string;
    onIncomingMessage?: (event: ChatNotificationEvent) => void;
}

interface UseDMReturn {
    messages: ChatMessage[];
    isConnected: boolean;
    sendMessage: (content: string, media?: MediaAttachment, replyTo?: string) => void;
    isLoading: boolean;
    loadMore: () => void;
    hasMore: boolean;
    peerTyping: boolean;
    sendTyping: (active: boolean) => void;
    markRead: () => void;
    peerOnline: boolean;
    reactToMessage: (messageId: string, emoji: string) => void;
    editMessage: (messageId: string, content: string) => void;
    deleteMessage: (messageId: string) => void;
}

export function useDM(config: UseDMConfig): UseDMReturn {
    const { activeDomain, roomId, peerDomain } = config;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [peerTyping, setPeerTyping] = useState(false);
    const [peerOnline, setPeerOnline] = useState(false);
    const [reconnectTick, setReconnectTick] = useState(0);
    const wsRef = useRef<PartySocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevRoomKeyRef = useRef<string>("");
    const onIncomingMessageRef = useRef(config.onIncomingMessage);
    onIncomingMessageRef.current = config.onIncomingMessage;
    const roomKey = `${roomId}|${peerDomain}`;
    const activeDomainRef = useRef(activeDomain);
    activeDomainRef.current = activeDomain;

    useEffect(() => {
        if (prevRoomKeyRef.current !== roomKey) {
            prevRoomKeyRef.current = roomKey;
            setMessages([]);
            setHasMore(false);
            setIsLoading(false);
            setPeerTyping(false);
            setPeerOnline(false);
        }

        let closedIntentionally = false;
        let backoffAttempt = 0;
        const ws = new PartySocket({
            host: partykitHost,
            party: "dm",
            room: roomId,
            query: async () => {
                const ticket = await fetchWsTicket();
                return { ticket: ticket ?? "", activeDomain, rt: String(reconnectTick) };
            },
        });
        wsRef.current = ws;

        ws.addEventListener("open", () => {
            setIsConnected(true);
            backoffAttempt = 0;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            ws.send(JSON.stringify({ type: "history" }));
        });

        // Heartbeat — Cloudflare closes idle WebSockets after ~100s.
        // Send a ping every 25s to keep the DM connection alive.
        const pingInterval = setInterval(() => {
            try {
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({ type: "ping" }));
                }
            } catch { /* ignore — close handler will fire if socket is dead */ }
        }, 25_000);

        ws.addEventListener("close", () => {
            setIsConnected(false);
            if (!closedIntentionally && !reconnectTimerRef.current) {
                // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, 30s cap.
                const base = Math.min(1000 * 2 ** backoffAttempt, 30_000);
                const jitter = Math.random() * 500;
                const delay = base + jitter;
                backoffAttempt = Math.min(backoffAttempt + 1, 5);
                reconnectTimerRef.current = setTimeout(() => {
                    reconnectTimerRef.current = null;
                    setReconnectTick((n) => n + 1);
                }, delay);
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
                        content: data.content as string,
                        timestamp: data.timestamp as string,
                        media: data.media as MediaAttachment | undefined,
                        replyTo: data.replyTo as string | undefined,
                        reactions: [],
                    };
                    let isNewMessage = false;
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === msg.id)) return prev;
                        isNewMessage = true;
                        return [...prev, msg];
                    });
                    if (isNewMessage && msg.sender === peerDomain) {
                        onIncomingMessageRef.current?.({
                            source: "dm",
                            senderDomain: msg.sender,
                            roomId,
                        });
                    }
                    break;
                }
                case "history": {
                    const histMsgs = (data.messages as Array<Record<string, unknown>>).reverse().map((m): ChatMessage => ({
                        id: m.id as string,
                        sender: m.sender as string,
                        content: m.content as string,
                        timestamp: m.timestamp as string,
                        media: m.media as MediaAttachment | undefined,
                        replyTo: m.replyTo as string | undefined,
                        editedAt: m.editedAt as string | undefined,
                        deleted: m.deleted as boolean | undefined,
                        reactions: Array.isArray(m.reactions)
                            ? (m.reactions as Array<{ emoji: string; count: number; domains?: string[] }>)
                                .map((r) => ({ emoji: r.emoji, count: r.count, domains: r.domains ?? [] }))
                            : [],
                    }));
                    setMessages((prev) => {
                        const existingIds = new Set(prev.map((m) => m.id));
                        const newMsgs = histMsgs.filter((m) => !existingIds.has(m.id));
                        return newMsgs.length > 0 ? [...newMsgs, ...prev] : prev;
                    });
                    setHasMore(data.hasMore as boolean);
                    setIsLoading(false);
                    break;
                }
                case "reaction-update": {
                    const messageId = data.messageId as string;
                    const emoji = data.emoji as string;
                    const domain = data.domain as string;
                    const action = data.action as "add" | "remove";
                    const serverReactions = data.reactions as Array<{ emoji: string; count: number }> | undefined;

                    setMessages((prev) => prev.map((msg) => {
                        if (msg.id !== messageId) return msg;
                        let reactions = [...(msg.reactions ?? [])];

                        if (serverReactions) {
                            const domainSets = new Map<string, string[]>();
                            for (const r of reactions) {
                                if (r.domains) domainSets.set(r.emoji, [...r.domains]);
                            }
                            reactions = serverReactions.map((sr) => {
                                const existing = domainSets.get(sr.emoji) ?? [];
                                if (sr.emoji === emoji) {
                                    if (action === "add" && !existing.includes(domain)) existing.push(domain);
                                    else if (action === "remove") {
                                        const idx = existing.indexOf(domain);
                                        if (idx >= 0) existing.splice(idx, 1);
                                    }
                                }
                                return { emoji: sr.emoji, count: sr.count, domains: existing };
                            });
                        } else {
                            const idx = reactions.findIndex((r) => r.emoji === emoji);
                            if (action === "add") {
                                if (idx >= 0) {
                                    const r = reactions[idx];
                                    if (!r.domains?.includes(domain)) {
                                        reactions[idx] = { ...r, count: r.count + 1, domains: [...(r.domains ?? []), domain] };
                                    }
                                } else {
                                    reactions.push({ emoji, count: 1, domains: [domain] });
                                }
                            } else if (idx >= 0) {
                                const r = reactions[idx];
                                if (r.domains?.includes(domain)) {
                                    const newCount = r.count - 1;
                                    if (newCount <= 0) reactions.splice(idx, 1);
                                    else reactions[idx] = { ...r, count: newCount, domains: r.domains.filter((d) => d !== domain) };
                                }
                            }
                        }

                        return { ...msg, reactions };
                    }));
                    break;
                }
                case "message-edited": {
                    const messageId = data.messageId as string;
                    const content = data.content as string;
                    const editedAt = data.editedAt as string;
                    setMessages((prev) => prev.map((msg) =>
                        msg.id === messageId ? { ...msg, content, editedAt } : msg
                    ));
                    break;
                }
                case "message-deleted": {
                    const messageId = data.messageId as string;
                    const selfDelete = data.selfDelete as boolean | undefined;
                    const deletedBy = data.deletedBy as string;
                    if (selfDelete) {
                        // Self-delete: remove from view
                        setMessages((prev) => prev.filter((m) => m.id !== messageId));
                    } else {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === messageId
                                    ? { ...m, content: null, deleted: true, deletedBy, deleteReason: undefined }
                                    : m
                            ),
                        );
                    }
                    break;
                }
                case "presence": {
                    const domain = data.domain as string;
                    const status = data.status as string;
                    if (domain === peerDomain) {
                        setPeerOnline(status === "online");
                        if (status === "offline") setPeerTyping(false);
                    }
                    break;
                }
                case "typing": {
                    const domain = data.domain as string;
                    const active = data.active as boolean;
                    if (domain === peerDomain) {
                        setPeerTyping(active);
                    }
                    break;
                }
                case "system": {
                    const sysMsg: ChatMessage = {
                        id: `sys-${Date.now()}`,
                        sender: "__system__",
                        content: data.content as string,
                        timestamp: (data.timestamp as string) ?? new Date().toISOString(),
                        reactions: [],
                    };
                    setMessages((prev) => [...prev, sysMsg]);
                    break;
                }
                case "read":
                case "unread":
                case "error":
                    break;
            }
        });

        return () => {
            closedIntentionally = true;
            clearInterval(pingInterval);
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            ws.close();
            wsRef.current = null;
            setIsConnected(false);
        };
    }, [roomId, peerDomain, roomKey, activeDomain, reconnectTick]);

    const sendMessage = useCallback((content: string, media?: MediaAttachment, replyTo?: string) => {
        const trimmed = content.trim();
        if (!trimmed && !media) return;
        if (!wsRef.current) return;
        const msg: Record<string, unknown> = { type: "message", content: trimmed };
        if (media) msg.media = media;
        if (replyTo) msg.replyTo = replyTo;
        wsRef.current.send(JSON.stringify(msg));
    }, []);

    const reactToMessage = useCallback((messageId: string, emoji: string) => {
        if (!wsRef.current) return;
        const domain = activeDomainRef.current;

        // Optimistic update
        setMessages((prev) => prev.map((msg) => {
            if (msg.id !== messageId) return msg;
            const reactions = [...(msg.reactions ?? [])];
            const idx = reactions.findIndex((r) => r.emoji === emoji);
            const alreadyReacted = idx >= 0 && reactions[idx].domains?.includes(domain);

            if (alreadyReacted) {
                const r = reactions[idx];
                const newCount = r.count - 1;
                if (newCount <= 0) reactions.splice(idx, 1);
                else reactions[idx] = { ...r, count: newCount, domains: r.domains!.filter((d) => d !== domain) };
            } else if (idx >= 0) {
                const r = reactions[idx];
                reactions[idx] = { ...r, count: r.count + 1, domains: [...(r.domains ?? []), domain] };
            } else {
                reactions.push({ emoji, count: 1, domains: [domain] });
            }
            return { ...msg, reactions };
        }));

        wsRef.current.send(JSON.stringify({ type: "react", messageId, emoji }));
    }, []);

    const editMessage = useCallback((messageId: string, content: string) => {
        if (!wsRef.current || !content.trim()) return;
        wsRef.current.send(JSON.stringify({ type: "edit-message", messageId, content: content.trim() }));
    }, []);

    const deleteMessage = useCallback((messageId: string) => {
        wsRef.current?.send(JSON.stringify({ type: "delete-message", messageId }));
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

    const markRead = useCallback(() => {
        wsRef.current?.send(JSON.stringify({ type: "read" }));
    }, []);

    return {
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
    };
}
