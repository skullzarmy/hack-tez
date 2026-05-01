import { useState, useEffect, useCallback, useRef } from "react";

import { hackchatUrl } from "../config/tezos";
import { authedFetch } from "../lib/authedFetch";

interface DMConversation {
    roomId: string;
    ownDomain: string;
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
    const { activeDomain } = config;
    const [conversations, setConversations] = useState<DMConversation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchConversations = useCallback(async () => {
        try {
            const res = await authedFetch(`${hackchatUrl}/dm/list`, {
                headers: { "X-Active-Domain": activeDomain },
            });
            if (!res.ok) return;
            const data = (await res.json()) as { conversations: DMConversation[] };
            setConversations(data.conversations);
        } catch {
            // Silently fail on poll errors
        }
    }, [activeDomain]);

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
        intervalRef.current = setInterval(fetchConversations, 5_000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchConversations]);

    useEffect(() => {
        function handleWindowFocus() {
            void fetchConversations();
        }

        function handleVisibilityChange() {
            if (document.visibilityState === "visible") {
                void fetchConversations();
            }
        }

        window.addEventListener("focus", handleWindowFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("focus", handleWindowFocus);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
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
