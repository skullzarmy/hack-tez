import { useState, useEffect, useRef, useCallback } from "react";
import PartySocket from "partysocket";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? "localhost:1999";

interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    timestamp: string;
}

interface UseChatConfig {
    token: string;
    activeDomain: string;
    onIdentitySwitched?: (domain: string) => void;
}

interface UseChatReturn {
    messages: ChatMessage[];
    isConnected: boolean;
    sendMessage: (content: string) => void;
    isLoading: boolean;
    loadMore: () => void;
    hasMore: boolean;
    onlineUsers: string[];
    typingUsers: string[];
    sendTyping: (active: boolean) => void;
    activeDomain: string;
    switchIdentity: (domain: string) => void;
}

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
    const tokenRef = useRef(token);
    const onSwitchRef = useRef(config.onIdentitySwitched);
    onSwitchRef.current = config.onIdentitySwitched;

    // Keep token ref current for reconnects without triggering effect
    useEffect(() => { tokenRef.current = token; }, [token]);

    // Stable connection key — only changes on first auth, not refreshes
    const [connectionKey] = useState(() => token);

    // Sync local identity when parent session identity changes.
    useEffect(() => {
        setCurrentDomain(activeDomain);
    }, [activeDomain]);

    useEffect(() => {
        const ws = new PartySocket({
            host: PARTYKIT_HOST,
            room: "global",
            query: { token: tokenRef.current, activeDomain },
        });
        wsRef.current = ws;

        ws.addEventListener("open", () => {
            setIsConnected(true);
            // Always load history on connect/reconnect, dedup handled by ID
            ws.send(JSON.stringify({ type: "history" }));
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
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === msg.id)) return prev;
                        return [...prev, msg];
                    });
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
                        timestamp: data.timestamp as string ?? new Date().toISOString(),
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
                case "error":
                    break;
            }
        });

        return () => {
            ws.close();
            wsRef.current = null;
            setIsConnected(false);
            historyLoadedRef.current = false;
        };
    }, [connectionKey, activeDomain]);

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

    // Include own domain in online users for display
    useEffect(() => {
        if (isConnected) {
            setOnlineUsers((prev) =>
                prev.includes(currentDomain) ? prev : [...prev, currentDomain],
            );
        }
    }, [isConnected, currentDomain]);

    const switchIdentity = useCallback(
        (domain: string) => {
            wsRef.current?.send(JSON.stringify({ type: "switch-identity", domain }));
        },
        [],
    );

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
    };
}
