import { useState } from "react";
import { useTezos } from "../context/TezosContext";

export default function ConnectWallet() {
    const { address, domain, balance, connecting, connect, disconnect, resetConnection } = useTezos();
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
            <div className="flex items-center gap-3">
                <div className="text-sm text-right">
                    {domain ? (
                        <div className="font-mono text-emerald-400 text-xs font-medium">{domain}</div>
                    ) : (
                        <div className="font-mono text-green-400 text-xs">
                            {address.slice(0, 8)}…{address.slice(-4)}
                        </div>
                    )}
                    {balance !== null && <div className="text-gray-400 text-xs">{balance.toFixed(2)} ꜩ</div>}
                </div>
                <button
                    onClick={disconnect}
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors cursor-pointer"
                >
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={connect}
                disabled={connecting || resetting}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
                {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
            <button
                onClick={handleReset}
                disabled={resetting || connecting}
                title="Clear cached wallet state and start fresh"
                className="px-2 py-2 rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-500 hover:text-red-400 text-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
                {resetting ? "…" : "↻ Reset"}
            </button>
        </div>
    );
}
