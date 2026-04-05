import { useState, useEffect, useCallback, useRef } from "react";

const HACKCHAT_URL = import.meta.env.VITE_HACKCHAT_URL ?? "http://localhost:8787";

interface DMConversation {
    roomId: string;
    peerDomain: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
}

interface UseDMListConfig {
    token: string;
    activeDomain: string;
}

interface UseDMListReturn {
    conversations: DMConversation[];
    isLoading: boolean;
    refresh: () => void;
    totalUnread: number;
}

export function useDMList(config: UseDMListConfig): UseDMListReturn {
    const { token, activeDomain } = config;
    const [conversations, setConversations] = useState<DMConversation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchConversations = useCallback(async () => {
        try {
            const res = await fetch(`${HACKCHAT_URL}/dm/list`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "X-Active-Domain": activeDomain,
                },
            });
            if (!res.ok) return;
            const data = (await res.json()) as { conversations: DMConversation[] };
            setConversations(data.conversations);
        } catch {
            // Silently fail on poll errors
        }
    }, [token, activeDomain]);

    const refresh = useCallback(() => {
        setIsLoading(true);
        fetchConversations().finally(() => setIsLoading(false));
    }, [fetchConversations]);

    // Initial load
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Poll every 30 seconds
    useEffect(() => {
        intervalRef.current = setInterval(fetchConversations, 30_000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchConversations]);

    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

    return {
        conversations,
        isLoading,
        refresh,
        totalUnread,
    };
}
