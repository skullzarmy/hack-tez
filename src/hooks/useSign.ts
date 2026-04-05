import { useState, useCallback } from "react";
import { useTezos } from "../context/TezosContext";
import { signMessage } from "../lib/signing";

interface SignResult {
    signature: string;
    publicKey: string;
}

interface SignState {
    loading: boolean;
    error: string | null;
    result: SignResult | null;
    sign: (message: string) => Promise<SignResult | null>;
}

export function useSign(): SignState {
    const { client } = useTezos();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SignResult | null>(null);

    const sign = useCallback(
        async (message: string): Promise<SignResult | null> => {
            if (!client) {
                setError("Wallet not connected");
                return null;
            }

            setLoading(true);
            setError(null);
            setResult(null);

            try {
                const res = await signMessage(client, message);
                setResult(res);
                return res;
            } catch (err: unknown) {
                const msg =
                    err instanceof Error ? err.message : "Signing failed";
                setError(msg);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [client],
    );

    return { sign, loading, error, result };
}
