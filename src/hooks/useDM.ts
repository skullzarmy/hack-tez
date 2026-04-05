import { useState, useEffect, useRef, useCallback } from "react";
import PartySocket from "partysocket";

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
    const wsRef = useRef<PartySocket | null>(null);
    const historyLoadedRef = useRef(false);

    useEffect(() => {
        const ws = new PartySocket({
            host: PARTYKIT_HOST,
            party: "dm",
            room: roomId,
            query: { token },
        });
        wsRef.current = ws;

        ws.addEventListener("open", () => {
            setIsConnected(true);
            if (!historyLoadedRef.current) {
                ws.send(JSON.stringify({ type: "history" }));
                historyLoadedRef.current = true;
            }
        });

        ws.addEventListener("close", () => {
            setIsConnected(false);
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
                    setMessages((prev) => [...prev, msg]);
                    break;
                }
                case "history": {
                    const histMsgs = (data.messages as ChatMessage[]).reverse();
                    setMessages((prev) => [...histMsgs, ...prev]);
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
            ws.close();
            wsRef.current = null;
            setIsConnected(false);
            setMessages([]);
            setHasMore(false);
            setPeerTyping(false);
            setPeerOnline(false);
            historyLoadedRef.current = false;
        };
    }, [token, roomId, peerDomain]);

    const sendMessage = useCallback(
        (content: string) => {
            const trimmed = content.trim();
            if (!trimmed || !wsRef.current) return;
            wsRef.current.send(JSON.stringify({ type: "message", content: trimmed }));
        },
        [],
    );

    const sendTyping = useCallback(
        (active: boolean) => {
            wsRef.current?.send(JSON.stringify({ type: "typing", active }));
        },
        [],
    );

    const loadMore = useCallback(() => {
        if (isLoading || !hasMore || !wsRef.current || messages.length === 0) return;
        setIsLoading(true);
        const oldest = messages[0];
        wsRef.current.send(JSON.stringify({ type: "history", before: oldest.timestamp }));
    }, [isLoading, hasMore, messages]);

    const markRead = useCallback(() => {
        wsRef.current?.send(JSON.stringify({ type: "read" }));
    }, []);

    // Suppress lint: activeDomain is part of the config identity but not directly used in logic
    void activeDomain;

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
