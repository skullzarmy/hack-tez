import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { useTezos } from "../../context/TezosContext";
import ChatAuth from "./ChatAuth";
import ChatLayout from "./ChatLayout";

const IDENTITY_STORAGE_KEY = "hack-tez-chat-identity";
const HACKCHAT_URL = import.meta.env.VITE_HACKCHAT_URL ?? "http://localhost:8787";
const REFRESH_LEAD_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

interface ChatSession {
    token: string;
    domains: string[];
    activeDomain: string;
}

function getJwtExpiry(token: string): number | null {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return payload.exp ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

function resolveInitialDomain(domains: string[], activeDomain: string): string {
    const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (stored && domains.includes(stored)) return stored;
    return activeDomain;
}

export default function ChatPage() {
    const { address, client, connect, connecting } = useTezos();
    const [session, setSession] = useState<ChatSession | null>(null);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSession = useCallback(() => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        setSession(null);
    }, []);

    const scheduleRefresh = useCallback(
        (token: string) => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            const expiry = getJwtExpiry(token);
            if (!expiry) return;
            const delay = Math.max(expiry - Date.now() - REFRESH_LEAD_MS, 0);
            refreshTimerRef.current = setTimeout(async () => {
                if (!address || !client) {
                    clearSession();
                    return;
                }
                try {
                    const { signMessage } = await import("../../lib/signing");
                    const timestamp = Math.floor(Date.now() / 1000);
                    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
                    const nonce = Array.from(nonceBytes)
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join("");
                    const challenge = `hack.tez-chat:${timestamp}:${nonce}`;
                    const { signature, publicKey } = await signMessage(client, challenge);

                    const res = await fetch(`${HACKCHAT_URL}/auth`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ address, publicKey, signature, timestamp, nonce }),
                    });
                    if (!res.ok) throw new Error("Refresh failed");
                    const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string };
                    const resolved = resolveInitialDomain(data.domains, data.activeDomain);
                    localStorage.setItem(IDENTITY_STORAGE_KEY, resolved);
                    setSession({ token: data.token, domains: data.domains, activeDomain: resolved });
                    scheduleRefresh(data.token);
                } catch {
                    clearSession();
                }
            }, delay);
        },
        [address, client, clearSession],
    );

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, []);

    // Gate 1: wallet not connected
    if (!address || !client) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-6 px-4"
                style={{ minHeight: "60vh", fontFamily: "var(--font)" }}
            >
                <MessageCircle size={48} style={{ color: "var(--accent, #00ffc8)", opacity: 0.6 }} />
                <h2
                    className="text-lg font-bold tracking-wide text-center"
                    style={{ fontFamily: "var(--font-mono)" }}
                >
                    Connect your wallet to enter hack.tez chat
                </h2>
                <button
                    type="button"
                    onClick={connect}
                    disabled={connecting}
                    className="btn btn-primary"
                >
                    {connecting ? "Connecting…" : "Connect Wallet"}
                </button>
            </div>
        );
    }

    // Gate 2: wallet connected but not authenticated
    if (!session) {
        return (
            <ChatAuth
                address={address}
                client={client}
                onAuthenticated={(token, domains, activeDomain) => {
                    const resolved = resolveInitialDomain(domains, activeDomain);
                    localStorage.setItem(IDENTITY_STORAGE_KEY, resolved);
                    setSession({ token, domains, activeDomain: resolved });
                    scheduleRefresh(token);
                }}
            />
        );
    }

    // Gate 3: authenticated — show chat
    return (
        <ChatLayout
            token={session.token}
            domains={session.domains}
            activeDomain={session.activeDomain}
            onSwitchDomain={(domain) => {
                localStorage.setItem(IDENTITY_STORAGE_KEY, domain);
                setSession((s) => (s ? { ...s, activeDomain: domain } : s));
            }}
        />
    );
}
