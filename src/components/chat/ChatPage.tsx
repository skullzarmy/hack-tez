import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useTezos } from "../../context/TezosContext";
import ChatAuth from "./ChatAuth";
import ChatLayout from "./ChatLayout";

interface ChatSession {
    token: string;
    domains: string[];
    activeDomain: string;
}

export default function ChatPage() {
    const { address, client, connect, connecting } = useTezos();
    const [session, setSession] = useState<ChatSession | null>(null);

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
                onAuthenticated={(token, domains, activeDomain) =>
                    setSession({ token, domains, activeDomain })
                }
            />
        );
    }

    // Gate 3: authenticated — show chat
    return (
        <ChatLayout
            token={session.token}
            domains={session.domains}
            activeDomain={session.activeDomain}
            onSwitchDomain={(domain) => setSession((s) => (s ? { ...s, activeDomain: domain } : s))}
        />
    );
}
