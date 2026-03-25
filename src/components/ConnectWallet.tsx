import { useTezos } from "../context/TezosContext";

export default function ConnectWallet() {
    const { address, balance, connecting, connect, disconnect } = useTezos();

    if (address) {
        return (
            <div className="flex items-center gap-3">
                <div className="text-sm">
                    <div className="font-mono text-green-400 text-xs">
                        {address.slice(0, 8)}…{address.slice(-4)}
                    </div>
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
        <button
            onClick={connect}
            disabled={connecting}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50 cursor-pointer"
        >
            {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
    );
}
