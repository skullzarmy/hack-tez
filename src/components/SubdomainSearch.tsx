import { useState } from "react";
import { checkAvailability, validateLabel, isReserved } from "../lib/domains";
import { useTezos } from "../context/TezosContext";
import { useEligibility } from "../hooks/useEligibility";
import { requestPermit } from "../lib/api";
import { submitRegister } from "../lib/contract";

type Status = "idle" | "checking" | "available" | "taken" | "registering" | "success" | "error";

export default function SubdomainSearch() {
    const { toolkit, wallet, address } = useTezos();
    const eligibility = useEligibility(address);
    const [label, setLabel] = useState("");
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    const handleSearch = async () => {
        setError(null);
        setTxHash(null);

        const validation = validateLabel(label);
        if (!validation.valid) {
            setError(validation.error!);
            return;
        }
        if (isReserved(label)) {
            setError("This name is reserved");
            return;
        }

        setStatus("checking");
        try {
            const available = await checkAvailability(label);
            setStatus(available ? "available" : "taken");
        } catch {
            setStatus("error");
            setError("Failed to check availability");
        }
    };

    const handleRegister = async () => {
        if (!address || !wallet) return;

        setStatus("registering");
        setError(null);

        try {
            // 1. Sign message with wallet
            const message = `Register ${label}.hack.tez for ${address}`;
            const payload = new TextEncoder().encode(message);
            const hexPayload =
                "05" +
                Array.from(payload)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");

            const signResult = await wallet.client.requestSignPayload({
                payload: hexPayload,
            });

            // Get public key
            const account = await wallet.client.getActiveAccount();
            if (!account?.publicKey) throw new Error("Could not get public key");

            // 2. Request permit from server
            const permit = await requestPermit({
                address,
                label,
                targetAddress: address,
                walletSignature: signResult.signature,
                walletPublicKey: account.publicKey,
            });

            // 3. Submit on-chain transaction
            const op = await submitRegister(toolkit, {
                label: permit.labelBytes,
                targetAddress: address,
                permitSignature: permit.permitSignature,
                expiry: permit.expiry,
            });

            // 4. Wait for confirmation
            await op.confirmation(1);
            setTxHash(op.opHash);
            setStatus("success");
        } catch (e) {
            console.error("Registration failed:", e);
            setStatus("error");
            setError(e instanceof Error ? e.message : "Registration failed");
        }
    };

    return (
        <div className="w-full max-w-lg mx-auto">
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => {
                            setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                            setStatus("idle");
                            setError(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        placeholder="yourname"
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">
                        .hack.tez
                    </span>
                </div>
                <button
                    onClick={handleSearch}
                    disabled={!label || status === "checking"}
                    className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50 cursor-pointer"
                >
                    {status === "checking" ? "…" : "Search"}
                </button>
            </div>

            {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {status === "taken" && (
                <div className="mt-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-800 text-yellow-300 text-sm">
                    <strong>{label}.hack.tez</strong> is already taken.
                </div>
            )}

            {status === "available" && (
                <div className="mt-3 p-4 rounded-lg bg-emerald-900/30 border border-emerald-800">
                    <p className="text-emerald-300 font-medium mb-3">
                        ✓ <strong>{label}.hack.tez</strong> is available!
                    </p>

                    {!address && (
                        <p className="text-gray-400 text-sm">Connect your wallet to register this subdomain.</p>
                    )}

                    {address && !eligibility.eligible && (
                        <p className="text-yellow-300 text-sm">{eligibility.reason}</p>
                    )}

                    {address && eligibility.eligible && (
                        <button
                            onClick={handleRegister}
                            className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors cursor-pointer"
                        >
                            Register {label}.hack.tez (free — gas only)
                        </button>
                    )}
                </div>
            )}

            {status === "registering" && (
                <div className="mt-3 p-4 rounded-lg bg-blue-900/30 border border-blue-800 text-blue-300 text-sm">
                    Registering… please approve the transaction in your wallet.
                </div>
            )}

            {status === "success" && (
                <div className="mt-3 p-4 rounded-lg bg-emerald-900/30 border border-emerald-800">
                    <p className="text-emerald-300 font-medium mb-1">
                        🎉 <strong>{label}.hack.tez</strong> registered successfully!
                    </p>
                    {txHash && (
                        <a
                            href={`https://${
                                import.meta.env.VITE_TEZOS_NETWORK === "mainnet" ? "" : "ghostnet."
                            }tzkt.io/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 text-xs underline"
                        >
                            View on TzKT ↗
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
