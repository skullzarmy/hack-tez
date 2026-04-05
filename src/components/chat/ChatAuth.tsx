import { useState } from "react";
import { ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import type { DAppClient } from "@tezos-x/octez.connect-sdk";
import { signMessage } from "../../lib/signing";

const HACKCHAT_URL = import.meta.env.VITE_HACKCHAT_URL ?? "http://localhost:8787";

interface ChatAuthProps {
    address: string;
    client: DAppClient;
    onAuthenticated: (token: string, domains: string[], activeDomain: string) => void;
}

export default function ChatAuth({ address, client, onAuthenticated }: ChatAuthProps) {
    const [signing, setSigning] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isBusy = signing || submitting;

    async function handleAuth() {
        setError(null);
        setSigning(true);

        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
            const nonce = Array.from(nonceBytes)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");

            const challenge = `hack.tez-chat:${timestamp}:${nonce}`;
            const { signature, publicKey } = await signMessage(client, challenge);

            setSigning(false);
            setSubmitting(true);

            const res = await fetch(`${HACKCHAT_URL}/auth`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address, publicKey, signature, timestamp, nonce }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({ error: "Auth failed" }));
                throw new Error((body as Record<string, string>).error ?? `HTTP ${res.status}`);
            }

            const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string };
            onAuthenticated(data.token, data.domains, data.activeDomain);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Authentication failed";
            setError(msg);
        } finally {
            setSigning(false);
            setSubmitting(false);
        }
    }

    return (
        <div
            className="flex flex-col items-center justify-center"
            style={{
                flex: "1 1 0",
                fontFamily: "var(--font)",
                padding: "clamp(1.5rem, 4vw, 3rem)",
                gap: "24px",
            }}
        >
            <ShieldCheck size={48} style={{ color: "var(--accent, #00ffc8)", opacity: 0.6 }} aria-hidden="true" />
            <h2
                className="text-sm font-bold uppercase tracking-widest text-center"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
            >
                Sign to verify your hackchat identity
            </h2>
            <p
                className="text-xs text-center max-w-md"
                style={{ color: "var(--fg-2, rgba(255,255,255,0.6))", lineHeight: "1.7" }}
            >
                Your wallet will ask you to sign a message. This proves you own your address
                without sending a transaction.
            </p>

            {error && (
                <div
                    className="flex items-center text-xs"
                    role="alert"
                    style={{
                        background: "rgba(255,107,107,0.08)",
                        border: "1px solid var(--err, #ff6b6b)",
                        color: "var(--err, #ff6b6b)",
                        fontFamily: "var(--font-mono)",
                        padding: "8px 16px",
                        gap: "8px",
                    }}
                >
                    <AlertTriangle size={14} aria-hidden="true" />
                    {error}
                </div>
            )}

            <button
                type="button"
                onClick={handleAuth}
                disabled={isBusy}
                className="btn btn-primary focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                    minWidth: "200px",
                    minHeight: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    outlineColor: "var(--accent, #00ffc8)",
                }}
            >
                {isBusy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {signing ? "Signing…" : submitting ? "Verifying…" : error ? "Retry" : "Sign & Enter Chat"}
            </button>
        </div>
    );
}
