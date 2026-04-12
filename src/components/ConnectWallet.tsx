import { useState } from "react";
import { useTezos } from "../context/TezosContext";

export default function ConnectWallet() {
    const { address, domain, connecting, connect, disconnect, resetConnection } = useTezos();
    const [resetting, setResetting] = useState(false);

    const handleReset = async () => {
        setResetting(true);
        try {
            await resetConnection();
        } finally {
            setResetting(false);
        }
    };

    if (address) {
        const label = domain ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
        return (
            <div className="wallet-chip" aria-label={`Connected: ${domain ?? address}`}>
                <span className="wallet-chip-label">{label}</span>
                <button
                    onClick={disconnect}
                    className="wallet-chip-disconnect"
                    aria-label="Disconnect wallet"
                    title="Disconnect"
                >
                    ×
                </button>
            </div>
        );
    }

    return (
        <div className="wallet-connect-row">
            <button
                onClick={connect}
                disabled={connecting || resetting}
                className="btn btn-primary btn-sm"
                aria-label="Connect Tezos wallet"
                data-onboarding="connect-wallet"
            >
                {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
            <button
                onClick={handleReset}
                disabled={resetting || connecting}
                className="btn btn-ghost btn-sm wallet-reset"
                title="Clear cached wallet state"
                aria-label="Reset wallet connection"
            >
                {resetting ? "…" : "↻"}
            </button>
        </div>
    );
}
