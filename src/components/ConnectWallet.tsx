import { useState } from "react";
import { useTezos } from "../context/TezosContext";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "./ui/dropdown-menu";

function shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function ConnectWallet() {
    const {
        address,
        domain,
        connecting,
        connect,
        disconnect,
        chatDomains,
        activeDomain,
        setActiveDomain,
    } = useTezos();
    const [busy, setBusy] = useState(false);

    if (!address) {
        return (
            <button
                onClick={connect}
                disabled={connecting}
                className="btn btn-primary btn-sm"
                aria-label="Connect Tezos wallet"
                data-onboarding="connect-wallet"
            >
                {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
        );
    }

    const label = activeDomain ?? domain ?? shortAddr(address);
    const hasMultiple = chatDomains.length > 1;

    const handleDisconnect = async () => {
        setBusy(true);
        try {
            await disconnect();
        } finally {
            setBusy(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="wallet-chip"
                    aria-label={`Wallet menu — ${label}`}
                    title={address}
                    disabled={busy}
                    style={{ cursor: "pointer" }}
                >
                    <span className="wallet-chip-label">{label}</span>
                    <span aria-hidden="true" style={{ marginLeft: "0.35rem", opacity: 0.7, fontSize: "0.7em" }}>
                        ▾
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <div
                    style={{
                        padding: "0.4rem 0.6rem 0.5rem",
                        fontSize: "0.7rem",
                        color: "var(--fg-2, #888)",
                        fontFamily: "ui-monospace, monospace",
                        wordBreak: "break-all",
                    }}
                >
                    {address}
                </div>
                {chatDomains.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <div
                            style={{
                                padding: "0.25rem 0.6rem",
                                fontSize: "0.7rem",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: "var(--fg-2, #888)",
                            }}
                        >
                            {hasMultiple ? "Active domain" : "Domain"}
                        </div>
                        {chatDomains.map((d) => {
                            const isActive = d === activeDomain;
                            return (
                                <DropdownMenuItem
                                    key={d}
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        if (!isActive) setActiveDomain(d);
                                    }}
                                    style={{
                                        background: isActive ? "var(--bg-3, #1a1a1a)" : undefined,
                                        fontWeight: isActive ? 600 : 400,
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            display: "inline-block",
                                            width: "1em",
                                            color: "var(--accent, #6cf)",
                                        }}
                                    >
                                        {isActive ? "●" : ""}
                                    </span>
                                    <span style={{ flex: 1 }}>{d}</span>
                                </DropdownMenuItem>
                            );
                        })}
                    </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onSelect={(e) => {
                        e.preventDefault();
                        void handleDisconnect();
                    }}
                    style={{ color: "var(--danger, #f66)" }}
                >
                    {busy ? "Disconnecting…" : "Disconnect"}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
