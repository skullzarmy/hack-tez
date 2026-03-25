import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { TezosToolkit } from "@taquito/taquito";
import { BeaconWallet } from "@taquito/beacon-wallet";
import { NetworkType } from "@tezos-x/octez.connect-sdk";
import config from "../config/tezos";

interface TezosState {
    toolkit: TezosToolkit;
    wallet: BeaconWallet | null;
    address: string | null;
    balance: number | null;
    connecting: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
}

const TezosContext = createContext<TezosState | null>(null);

const tezos = new TezosToolkit(config.rpcUrl);

export function TezosProvider({ children }: { children: ReactNode }) {
    const [wallet, setWallet] = useState<BeaconWallet | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [balance, setBalance] = useState<number | null>(null);
    const [connecting, setConnecting] = useState(false);

    // Initialize wallet on mount and check for existing connection
    useEffect(() => {
        const w = new BeaconWallet({
            name: "hack.tez",
            preferredNetwork: config.name === "mainnet" ? NetworkType.MAINNET : NetworkType.GHOSTNET,
        });
        tezos.setWalletProvider(w);
        setWallet(w);

        // Check if already connected
        w.client.getActiveAccount().then((account) => {
            if (account) {
                setAddress(account.address);
                tezos.tz
                    .getBalance(account.address)
                    .then((bal) => setBalance(bal.toNumber() / 1_000_000))
                    .catch(() => {});
            }
        });
    }, []);

    const connect = useCallback(async () => {
        if (!wallet) return;
        setConnecting(true);
        try {
            await wallet.requestPermissions();
            const addr = await wallet.getPKH();
            setAddress(addr);
            const bal = await tezos.tz.getBalance(addr);
            setBalance(bal.toNumber() / 1_000_000);
        } catch (err) {
            console.error("Wallet connection failed:", err);
        } finally {
            setConnecting(false);
        }
    }, [wallet]);

    const disconnect = useCallback(async () => {
        if (!wallet) return;
        await wallet.clearActiveAccount();
        setAddress(null);
        setBalance(null);
    }, [wallet]);

    return (
        <TezosContext.Provider value={{ toolkit: tezos, wallet, address, balance, connecting, connect, disconnect }}>
            {children}
        </TezosContext.Provider>
    );
}

export function useTezos() {
    const ctx = useContext(TezosContext);
    if (!ctx) throw new Error("useTezos must be used within TezosProvider");
    return ctx;
}
