import { useState, useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { useTezos } from "../../context/TezosContext";
import ChatLayout from "./ChatLayout";
import { pinFile } from "../../lib/pin";

const IDENTITY_STORAGE_KEY = "hack-tez-chat-identity";

function getJwtActiveDomain(token: string): string | null {
    try {
        const seg = token.split(".")[1];
        if (!seg) return null;
        const base64 = seg.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded)) as { activeDomain?: unknown };
        return typeof payload.activeDomain === "string" ? payload.activeDomain : null;
    } catch {
        return null;
    }
}

export default function ChatPage() {
    const {
        address,
        client,
        connect,
        connecting,
        token,
        chatDomains,
        activeDomain: contextActiveDomain,
        setActiveDomain,
        refreshToken,
    } = useTezos();

    // Resolve initial domain from localStorage preference
    const [resolvedDomain, setResolvedDomain] = useState<string | null>(() => {
        if (!contextActiveDomain) return null;
        const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
        // Will be validated against chatDomains once available
        return stored ?? contextActiveDomain;
    });

    // Sync resolved domain when context changes
    useEffect(() => {
        if (!contextActiveDomain) {
            setResolvedDomain(null);
            return;
        }
        const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
        if (stored && chatDomains.includes(stored)) {
            setResolvedDomain(stored);
            if (stored !== contextActiveDomain) {
                setActiveDomain(stored);
            }
        } else {
            setResolvedDomain(contextActiveDomain);
        }
    }, [contextActiveDomain, chatDomains, setActiveDomain]);

    // Migrate old sessionStorage session to new localStorage auth
    const migratedRef = useRef(false);
    useEffect(() => {
        if (migratedRef.current) return;
        migratedRef.current = true;
        try {
            const old = sessionStorage.getItem("hack-tez-chat-session");
            if (old) sessionStorage.removeItem("hack-tez-chat-session");
        } catch { /* ignore */ }
    }, []);

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
                    Connect your wallet to enter hackchat
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

    // Gate 2: wallet connected but no JWT yet (signing in progress or failed)
    if (!token) {
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
                    {connecting ? "Authenticating…" : "Session expired"}
                </h2>
                <p
                    className="text-xs text-center max-w-md"
                    style={{ color: "var(--fg-2, rgba(255,255,255,0.6))", lineHeight: "1.7" }}
                >
                    {connecting
                        ? "Signing in with your wallet…"
                        : "Your session has expired. Reconnect to re-sign and enter chat."}
                </p>
                {!connecting && (
                    <button
                        type="button"
                        onClick={connect}
                        className="btn btn-primary focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ minHeight: "44px", outlineColor: "var(--accent, #00ffc8)" }}
                    >
                        Reconnect
                    </button>
                )}
            </div>
        );
    }

    // Gate 3: authenticated but no hack.tez domain
    if (chatDomains.length === 0 || !resolvedDomain) {
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
                    You need a hack.tez domain to chat
                </h2>
                <p
                    className="text-xs text-center max-w-md"
                    style={{ color: "var(--fg-2, rgba(255,255,255,0.6))", lineHeight: "1.7" }}
                >
                    Register a free subdomain on the home page, then come back here.
                </p>
                <a
                    href="/"
                    className="btn btn-primary focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ minHeight: "44px", outlineColor: "var(--accent, #00ffc8)", textDecoration: "none" }}
                >
                    Register a domain
                </a>
            </div>
        );
    }

    const tokenActiveDomain = getJwtActiveDomain(token);

    // Gate 3.5: identity was switched locally, but the JWT has not caught up yet.
    if (tokenActiveDomain && tokenActiveDomain !== resolvedDomain) {
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
                    Syncing identity…
                </h2>
                <p
                    className="text-xs text-center max-w-md"
                    style={{ color: "var(--fg-2, rgba(255,255,255,0.6))", lineHeight: "1.7" }}
                >
                    Updating your chat session for {resolvedDomain}.
                </p>
            </div>
        );
    }

    // Gate 4: authenticated with domain — enter chat
    return (
        <ChatLayout
            token={token}
            domains={chatDomains}
            activeDomain={resolvedDomain}
            onSwitchDomain={(newDomain) => {
                localStorage.setItem(IDENTITY_STORAGE_KEY, newDomain);
                setResolvedDomain(newDomain);
                setActiveDomain(newDomain);
            }}
            onAuthFailure={refreshToken}
            onPinImage={async (file) => {
                try {
                    const { gatewayUrl } = await pinFile(file, client);
                    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                        img.onerror = () => resolve({ width: 0, height: 0 });
                        img.src = URL.createObjectURL(file);
                    });
                    return { url: gatewayUrl, width: dims.width, height: dims.height };
                } catch {
                    return null;
                }
            }}
        />
    );
}
