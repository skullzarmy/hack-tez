import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { useTezos } from "../../context/TezosContext";
import ChatAuth from "./ChatAuth";
import ChatLayout from "./ChatLayout";

const IDENTITY_STORAGE_KEY = "hack-tez-chat-identity";
const SESSION_STORAGE_KEY = "hack-tez-chat-session";
const HACKCHAT_URL = import.meta.env.VITE_HACKCHAT_URL ?? "http://localhost:8787";
const REFRESH_LEAD_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

interface ChatSession {
    token: string;
    domains: string[];
    activeDomain: string;
}

function getJwtExpiry(token: string): number | null {
    try {
        const seg = token.split(".")[1];
        const base64 = seg.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
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

function saveSession(session: ChatSession) {
    try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch { /* quota exceeded — ignore */ }
}

function loadSession(): ChatSession | null {
    try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as ChatSession;
        const expiry = getJwtExpiry(session.token);
        if (!expiry || expiry < Date.now() + 60_000) {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

export default function ChatPage() {
    const { address, client, connect, connecting } = useTezos();
    const [session, setSession] = useState<ChatSession | null>(() => {
        if (!address) return null;
        return loadSession();
    });
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Try to restore session when wallet connects
    useEffect(() => {
        if (address && !session) {
            const restored = loadSession();
            if (restored) {
                setSession(restored);
            }
        }
    }, [address, session]);

    const clearSession = useCallback(() => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSession(null);
    }, []);

    const updateSession = useCallback((s: ChatSession) => {
        setSession(s);
        saveSession(s);
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
                    const newSession = { token: data.token, domains: data.domains, activeDomain: resolved };
                    updateSession(newSession);
                    scheduleRefresh(data.token);
                } catch {
                    clearSession();
                }
            }, delay);
        },
        [address, client, clearSession, updateSession],
    );

    // Schedule refresh for restored sessions
    useEffect(() => {
        if (session) {
            scheduleRefresh(session.token);
        }
        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, [session, scheduleRefresh]);

    // Gate 1: wallet not connected
    if (!address || !client) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-6"
                style={{
                    flex: "1 1 0",
                    fontFamily: "var(--font)",
                    padding: "clamp(1.5rem, 4vw, 3rem)",
                }}
            >
                <MessageCircle size={48} style={{ color: "var(--accent, #00ffc8)", opacity: 0.4 }} aria-hidden="true" />
                <h2
                    className="text-sm font-bold uppercase tracking-widest text-center"
                    style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
                >
                    Connect your wallet to enter hack.tez chat
                </h2>
                <button
                    type="button"
                    onClick={connect}
                    disabled={connecting}
                    className="btn btn-primary focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                        minHeight: "44px",
                        outlineColor: "var(--accent, #00ffc8)",
                    }}
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
                    const newSession = { token, domains, activeDomain: resolved };
                    updateSession(newSession);
                }}
            />
        );
    }

    // Gate 3: authenticated — chat fills the remaining space
    return (
        <ChatLayout
            token={session.token}
            domains={session.domains}
            activeDomain={session.activeDomain}
            onSwitchDomain={(domain) => {
                localStorage.setItem(IDENTITY_STORAGE_KEY, domain);
                setSession((s) => {
                    if (!s) return s;
                    const updated = { ...s, activeDomain: domain };
                    saveSession(updated);
                    return updated;
                });
            }}
        />
    );
}
