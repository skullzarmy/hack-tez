import { useTezos } from "../context/TezosContext";
import { useSubdomains } from "../hooks/useSubdomains";
import config from "../config/tezos";
import type { SubdomainRecord } from "../lib/domains";

const TED_APP_URL = config.name === "mainnet" ? "https://app.tezos.domains" : "https://ghostnet.app.tezos.domains";

function SubdomainCard({ domain }: { domain: SubdomainRecord }) {
    return (
        <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono text-emerald-400 font-medium">{domain.name}</h3>
                <span className="text-xs text-gray-500 font-mono">
                    → {domain.address ? `${domain.address.slice(0, 8)}…${domain.address.slice(-4)}` : "no address"}
                </span>
            </div>

            <div className="text-sm text-gray-400 space-y-1 mb-3">
                {domain.expiresAt && (
                    <div className="flex justify-between">
                        <span>Expires</span>
                        <span className="text-xs text-gray-300">{new Date(domain.expiresAt).toLocaleDateString()}</span>
                    </div>
                )}
            </div>

            <a
                href={`${TED_APP_URL}/domain/${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-3 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
                Manage on Tezos Domains →
            </a>
        </div>
    );
}

export default function Dashboard() {
    const { address } = useTezos();
    const { subdomains, loading, error, refresh } = useSubdomains(address);

    if (!address) {
        return <div className="text-center text-gray-400 py-12">Connect your wallet to view your subdomains.</div>;
    }

    if (loading) {
        return <div className="text-center text-gray-400 py-12">Loading your subdomains…</div>;
    }

    if (error) {
        return <div className="text-center text-red-400 py-12">Error: {error}</div>;
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Your Subdomains</h2>
                <button onClick={refresh} className="text-xs text-gray-400 hover:text-gray-300 cursor-pointer">
                    ↻ Refresh
                </button>
            </div>

            <div className="text-xs text-gray-500 mb-4">
                You own your subdomains on Tezos Domains. Manage them directly on TED.
            </div>

            {subdomains.length === 0 ? (
                <div className="text-center text-gray-500 py-8 bg-gray-800/50 rounded-lg">
                    <p className="mb-2">No subdomains yet.</p>
                    <a href="/" className="text-emerald-400 text-sm hover:underline">
                        Register one →
                    </a>
                </div>
            ) : (
                <div className="space-y-3">
                    {subdomains.map((d) => (
                        <SubdomainCard key={d.name} domain={d} />
                    ))}
                </div>
            )}
        </div>
    );
}
