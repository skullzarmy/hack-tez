import { useState, useEffect, useRef, useCallback } from "react";
import PartySocket from "partysocket";
import type { ChatNotificationEvent } from "../lib/chatNotifications";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? "localhost:1999";

interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    timestamp: string;
}

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
    sendMessage: (content: string) => void;
    isLoading: boolean;
    loadMore: () => void;
    hasMore: boolean;
    peerTyping: boolean;
    sendTyping: (active: boolean) => void;
    markRead: () => void;
    peerOnline: boolean;
}

export function useDM(config: UseDMConfig): UseDMReturn {
    const { token, activeDomain, roomId, peerDomain } = config;
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
        const ws = new PartySocket({
            host: PARTYKIT_HOST,
            party: "dm",
            room: roomId,
            query: { token, activeDomain, rt: String(reconnectTick) },
        });
        wsRef.current = ws;

        ws.addEventListener("open", () => {
            setIsConnected(true);
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            // Always load history on connect/reconnect, dedup handled by ID
            ws.send(JSON.stringify({ type: "history" }));
        });

        ws.addEventListener("close", () => {
            setIsConnected(false);
            if (!closedIntentionally && !reconnectTimerRef.current) {
                reconnectTimerRef.current = setTimeout(() => {
                    reconnectTimerRef.current = null;
                    setReconnectTick((n) => n + 1);
                }, 1500);
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
                    const histMsgs = (data.messages as ChatMessage[]).reverse();
                    setMessages((prev) => {
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
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            ws.close();
            wsRef.current = null;
            setIsConnected(false);
        };
    }, [roomId, peerDomain, roomKey, token, activeDomain, reconnectTick]);

    const sendMessage = useCallback((content: string) => {
        const trimmed = content.trim();
        if (!trimmed || !wsRef.current) return;
        wsRef.current.send(JSON.stringify({ type: "message", content: trimmed }));
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
    };
}
