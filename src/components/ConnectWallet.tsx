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
        return (
            <div className="wallet-info">
                <div className="wallet-addr" aria-label={`Connected: ${domain ?? address}`}>
                    {domain && <span className="wallet-domain">{domain}</span>}
                    <span style={{ display: domain ? "block" : "inline" }}>
                        {address.slice(0, 8)}…{address.slice(-4)}
                    </span>
                </div>
                <button
                    onClick={disconnect}
                    className="btn btn-ghost btn-sm"
                    aria-label="Disconnect wallet"
                >
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
                onClick={connect}
                disabled={connecting || resetting}
                className="btn btn-primary btn-sm"
                aria-label="Connect Tezos wallet"
            >
                {connecting ? "Connecting…" : "Connect"}
            </button>
            <button
                onClick={handleReset}
                disabled={resetting || connecting}
                className="btn btn-ghost btn-sm"
                title="Clear cached wallet state"
                aria-label="Reset wallet connection"
            >
                {resetting ? "…" : "↻"}
            </button>
        </div>
    );
}
