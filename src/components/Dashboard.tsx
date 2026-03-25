import { useState } from "react";
import { useTezos } from "../context/TezosContext";
import { useSubdomains } from "../hooks/useSubdomains";
import { getRedirect, setRedirect } from "../lib/api";
import type { SubdomainRecord } from "../lib/domains";

function SubdomainCard({ domain }: { domain: SubdomainRecord }) {
    const { wallet, address } = useTezos();
    const [redirectUrl, setRedirectUrl] = useState("");
    const [currentRedirect, setCurrentRedirect] = useState<string | null>(null);
    const [loadingRedirect, setLoadingRedirect] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const subdomain = domain.name.replace(".hack.tez", "");

    const loadRedirect = async () => {
        setLoadingRedirect(true);
        const url = await getRedirect(subdomain);
        setCurrentRedirect(url);
        if (url) setRedirectUrl(url);
        setLoadingRedirect(false);
    };

    const handleSaveRedirect = async () => {
        if (!wallet || !address) return;
        setSaving(true);
        setMessage(null);
        try {
            // Sign proof of ownership
            const msg = `Set redirect for ${subdomain}.hack.tez`;
            const payload =
                "05" +
                Array.from(new TextEncoder().encode(msg))
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");
            const signResult = await wallet.client.requestSignPayload({ payload });
            const account = await wallet.client.getActiveAccount();

            await setRedirect({
                subdomain,
                redirectUrl,
                walletSignature: signResult.signature,
                walletPublicKey: account?.publicKey || "",
                address,
            });
            setCurrentRedirect(redirectUrl);
            setMessage("Redirect saved!");
        } catch (e) {
            setMessage(e instanceof Error ? e.message : "Failed to save redirect");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-mono text-emerald-400 font-medium">{domain.name}</h3>
                <span className="text-xs text-gray-500">
                    → {domain.address ? `${domain.address.slice(0, 8)}…` : "no address"}
                </span>
            </div>

            <div className="space-y-2">
                <button
                    onClick={loadRedirect}
                    className="text-xs text-gray-400 hover:text-gray-300 underline cursor-pointer"
                >
                    {loadingRedirect ? "Loading…" : "Manage redirect →"}
                </button>

                {currentRedirect !== null && (
                    <div className="mt-2 space-y-2">
                        <div className="text-xs text-gray-400">Current: {currentRedirect || "none set"}</div>
                        <input
                            type="url"
                            value={redirectUrl}
                            onChange={(e) => setRedirectUrl(e.target.value)}
                            placeholder="https://your-site.com"
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                            onClick={handleSaveRedirect}
                            disabled={saving || !redirectUrl}
                            className="px-3 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            {saving ? "Saving…" : "Save Redirect"}
                        </button>
                        {message && <p className="text-xs text-emerald-400">{message}</p>}
                    </div>
                )}
            </div>
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

            {subdomains.length === 0 ? (
                <div className="text-center text-gray-500 py-8 bg-gray-800/50 rounded-lg">
                    No subdomains yet. Go register one!
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
