/** biome-ignore-all lint/suspicious/noArrayIndexKey: asset rows are positional and have no stable id */
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Plus, Trash2 } from "lucide-react";
import { getLab } from "../../lib/labs";
import { usePageMeta } from "../../hooks/usePageMeta";
import { useTezos } from "../../context/TezosContext";
import ConnectWallet from "../../components/ConnectWallet";
import {
    connectDeployer,
    DEPLOY_NETWORKS,
    defaultNetworkId,
    deployFa2,
    disconnectDeployer,
    emptyToken,
    getNetwork,
    isSiteNetwork,
    peekDeployerAddress,
    validateDeploy,
    type DeployResult,
    type SupplyType,
    type TokenInput,
} from "../../lib/fa2Deployer";

const mono = "var(--font-mono)";

const fieldStyle: CSSProperties = {
    width: "100%",
    fontFamily: mono,
    fontSize: "0.85rem",
    padding: "0.5rem 0.65rem",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--fg)",
    boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
    fontFamily: mono,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--fg-muted)",
    marginBottom: "0.3rem",
    display: "block",
};

function Field({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    multiline = false,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
    multiline?: boolean;
}) {
    return (
        // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as {children} and rendered inside this label; biome cannot follow it through the prop
        <label style={{ display: "block", flex: 1, minWidth: 0 }}>
            <span style={labelStyle}>{label}</span>
            {multiline ? (
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={3}
                    style={{ ...fieldStyle, resize: "vertical" }}
                />
            ) : (
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={fieldStyle}
                />
            )}
        </label>
    );
}

export default function Fa2Deployer() {
    const lab = getLab("fa2-deployer");
    const { client: globalClient, address: globalAddress, connect: globalConnect, disconnect: globalDisconnect, restoring } = useTezos();

    const [networkId, setNetworkId] = useState(defaultNetworkId());
    const net = getNetwork(networkId);
    const onSite = isSiteNetwork(networkId);

    const [deployerAddress, setDeployerAddress] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);

    const activeAddress = onSite ? globalAddress : deployerAddress;

    const [admin, setAdmin] = useState("");
    const [contractName, setContractName] = useState("");
    const [contractDescription, setContractDescription] = useState("");
    const [supplyType, setSupplyType] = useState<SupplyType>("Basic");
    const [tokens, setTokens] = useState<TokenInput[]>([emptyToken()]);

    const [deploying, setDeploying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<DeployResult | null>(null);

    usePageMeta({
        title: "FA2 Deployer — no-code token factory — Labs — hack.tez",
        description:
            "Originate FA2 multi-asset tokens with no code on Tezos X, Shadownet, or Mainnet. A revival of the dead fa2-deployer on octez.connect.",
        path: "/labs/fa2-deployer",
    });

    // When an off-site network is selected, detect an existing connection for it.
    useEffect(() => {
        if (onSite) return;
        let cancelled = false;
        void peekDeployerAddress(net).then((a) => {
            if (!cancelled) setDeployerAddress(a);
        });
        return () => {
            cancelled = true;
        };
    }, [onSite, net]);

    // Default the admin field to the connected wallet once known.
    useEffect(() => {
        if (activeAddress && !admin) setAdmin(activeAddress);
    }, [activeAddress, admin]);

    const onNetworkChange = useCallback((id: string) => {
        setNetworkId(id);
        setResult(null);
        setError(null);
    }, []);

    const connect = useCallback(async () => {
        setError(null);
        if (onSite) {
            await globalConnect();
            return;
        }
        setConnecting(true);
        try {
            const addr = await connectDeployer(net);
            setDeployerAddress(addr);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Wallet connection failed.");
        } finally {
            setConnecting(false);
        }
    }, [onSite, net, globalConnect]);

    const disconnect = useCallback(async () => {
        if (onSite) {
            await globalDisconnect();
            return;
        }
        await disconnectDeployer();
        setDeployerAddress(null);
    }, [onSite, globalDisconnect]);

    const updateToken = (index: number, patch: Partial<TokenInput>) => {
        setTokens((ts) => ts.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    };

    const deploy = useCallback(async () => {
        if (!activeAddress) return;
        const validationError = validateDeploy(admin, contractName, contractDescription, tokens);
        if (validationError) {
            setError(validationError);
            return;
        }
        setDeploying(true);
        setError(null);
        setResult(null);
        try {
            const res = await deployFa2(
                net,
                { admin: admin.trim(), contractName, contractDescription, tokens, type: supplyType },
                onSite ? globalClient : undefined,
            );
            setResult(res);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Deployment failed.";
            setError(msg.slice(0, 320));
        } finally {
            setDeploying(false);
        }
    }, [activeAddress, admin, contractName, contractDescription, tokens, supplyType, net, onSite, globalClient]);

    const showRestoring = onSite && restoring && !globalAddress;

    return (
        <div className="container" style={{ paddingBlock: "3rem", maxWidth: "820px" }}>
            <Link
                to="/labs"
                style={{
                    fontFamily: mono,
                    fontSize: "0.8rem",
                    color: "var(--fg-muted)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35em",
                    marginBottom: "1rem",
                }}
            >
                <ArrowLeft size={14} aria-hidden="true" /> labs
            </Link>

            {/* Header */}
            <div
                style={{
                    paddingBottom: "1.25rem",
                    borderBottom: "1px solid var(--border)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                    <h1 style={{ fontFamily: mono, fontSize: "clamp(1.2rem, 3.5vw, 1.75rem)", margin: 0 }}>
                        {lab?.title ?? "FA2 Deployer"}
                    </h1>
                    <span
                        style={{
                            fontFamily: mono,
                            fontSize: "0.62rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            padding: "0.18em 0.55em",
                            color: "var(--warn)",
                            background: "var(--warn-bg)",
                            border: "1px solid var(--warn)",
                        }}
                    >
                        {lab?.status ?? "alpha"}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                        v{lab?.version ?? "0.1.0"}
                    </span>
                </div>
                {lab?.summary && (
                    <p style={{ color: "var(--fg-muted)", fontSize: "0.875rem", maxWidth: "60ch" }}>{lab.summary}</p>
                )}
            </div>

            {/* Network + wallet */}
            <section style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
                    <label style={{ display: "block", flex: "1 1 240px", minWidth: 0 }}>
                        <span style={labelStyle}>Network</span>
                        <select value={networkId} onChange={(e) => onNetworkChange(e.target.value)} style={fieldStyle}>
                            {DEPLOY_NETWORKS.map((n) => (
                                <option key={n.id} value={n.id}>
                                    {n.label}
                                    {isSiteNetwork(n.id) ? " — site wallet" : ""}
                                </option>
                            ))}
                        </select>
                    </label>
                    {activeAddress ? (
                        <button
                            type="button"
                            onClick={() => void disconnect()}
                            style={{
                                fontFamily: mono,
                                fontSize: "0.78rem",
                                padding: "0.5rem 0.9rem",
                                border: "1px solid var(--border)",
                                background: "var(--bg-card)",
                                color: "var(--fg)",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {activeAddress.slice(0, 6)}…{activeAddress.slice(-4)} · disconnect
                        </button>
                    ) : onSite ? (
                        <ConnectWallet />
                    ) : (
                        <button
                            type="button"
                            onClick={() => void connect()}
                            disabled={connecting}
                            style={{
                                fontFamily: mono,
                                fontSize: "0.78rem",
                                padding: "0.5rem 0.9rem",
                                border: "1px solid var(--fg)",
                                background: "var(--fg)",
                                color: "var(--bg)",
                                cursor: connecting ? "wait" : "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {connecting ? "connecting…" : `connect on ${net.label}`}
                        </button>
                    )}
                </div>
                <p style={{ fontFamily: mono, fontSize: "0.72rem", color: "var(--fg-muted)", margin: 0 }}>
                    {net.note && <>// {net.note}</>}
                    {net.faucet && (
                        <>
                            {" "}
                            <a
                                href={net.faucet}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "var(--fg)", display: "inline-flex", alignItems: "center", gap: "0.25em" }}
                            >
                                faucet <ExternalLink size={10} aria-hidden="true" />
                            </a>
                        </>
                    )}
                </p>
            </section>

            {showRestoring ? (
                <p style={{ fontFamily: mono, color: "var(--fg-muted)", fontSize: "0.8rem", marginTop: "2rem" }}>
                    // restoring session…
                </p>
            ) : !activeAddress ? (
                <p style={{ fontFamily: mono, color: "var(--fg-muted)", fontSize: "0.85rem", marginTop: "2rem" }}>
                    // connect a wallet on {net.label} to deploy.
                </p>
            ) : (
                <>
                    {/* Contract metadata */}
                    <section style={{ marginTop: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <Field label="Admin address" value={admin} onChange={setAdmin} placeholder="tz1… (mints to + controls this address)" />
                        <Field label="Contract name" value={contractName} onChange={setContractName} placeholder="My Token Collection" />
                        <Field
                            label="Contract description"
                            value={contractDescription}
                            onChange={setContractDescription}
                            placeholder="What is this contract for?"
                            multiline
                        />
                        <label style={{ display: "block", maxWidth: "260px" }}>
                            <span style={labelStyle}>Supply type</span>
                            <select value={supplyType} onChange={(e) => setSupplyType(e.target.value as SupplyType)} style={fieldStyle}>
                                <option value="Basic">Basic — one global pause</option>
                                <option value="Granular">Granular — per-token pause</option>
                            </select>
                        </label>
                    </section>

                    {/* Assets */}
                    <section style={{ marginTop: "1.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                            <h2 style={{ fontFamily: mono, fontSize: "0.95rem", margin: 0 }}>// assets</h2>
                            <button
                                type="button"
                                onClick={() => setTokens((ts) => [...ts, emptyToken()])}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    fontFamily: mono,
                                    fontSize: "0.75rem",
                                    padding: "0.35rem 0.7rem",
                                    border: "1px solid var(--border)",
                                    background: "var(--bg-card)",
                                    color: "var(--fg)",
                                    cursor: "pointer",
                                }}
                            >
                                <Plus size={12} aria-hidden="true" /> add asset
                            </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            {tokens.map((token, index) => (
                                <div
                                    key={index}
                                    style={{
                                        border: "1px solid var(--border)",
                                        background: "var(--bg-card)",
                                        padding: "1rem",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "0.85rem",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span style={{ fontFamily: mono, fontSize: "0.8rem", color: "var(--fg-muted)" }}>
                                            asset {index} · token_id {index}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setTokens((ts) => ts.filter((_, i) => i !== index))}
                                            disabled={tokens.length === 1}
                                            title={tokens.length === 1 ? "at least one asset is required" : "remove asset"}
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "0.3rem",
                                                fontFamily: mono,
                                                fontSize: "0.72rem",
                                                padding: "0.3rem 0.6rem",
                                                border: "1px solid var(--border)",
                                                background: "var(--bg)",
                                                color: tokens.length === 1 ? "var(--fg-muted)" : "var(--fg)",
                                                cursor: tokens.length === 1 ? "not-allowed" : "pointer",
                                            }}
                                        >
                                            <Trash2 size={11} aria-hidden="true" /> remove
                                        </button>
                                    </div>
                                    <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
                                        <Field label="Name" value={token.name} onChange={(v) => updateToken(index, { name: v })} placeholder="Token name" />
                                        <Field label="Symbol" value={token.symbol} onChange={(v) => updateToken(index, { symbol: v })} placeholder="TKN" />
                                    </div>
                                    <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
                                        <Field label="Supply" type="number" value={token.supply} onChange={(v) => updateToken(index, { supply: v })} placeholder="1000000" />
                                        <Field label="Decimals" type="number" value={token.decimals} onChange={(v) => updateToken(index, { decimals: v })} placeholder="0" />
                                    </div>
                                    <Field label="Icon URI" value={token.icon} onChange={(v) => updateToken(index, { icon: v })} placeholder="ipfs://… or https://…" />
                                    <Field label="Description" value={token.description} onChange={(v) => updateToken(index, { description: v })} placeholder="What is this token?" multiline />
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Deploy */}
                    <section style={{ marginTop: "1.75rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                        {error && (
                            <p role="alert" style={{ fontFamily: mono, fontSize: "0.78rem", color: "var(--err, #ff6b6b)", margin: 0, wordBreak: "break-word" }}>
                                // {error}
                            </p>
                        )}
                        {result && (
                            <div
                                style={{
                                    border: "1px solid var(--ok)",
                                    background: "var(--ok-bg)",
                                    padding: "1rem",
                                    fontFamily: mono,
                                    fontSize: "0.8rem",
                                    color: "var(--fg)",
                                }}
                            >
                                <p style={{ color: "var(--ok)", margin: "0 0 0.4rem" }}>// origination submitted</p>
                                <a
                                    href={result.opUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "var(--ok)", display: "inline-flex", alignItems: "center", gap: "0.3em" }}
                                >
                                    {result.opHash.slice(0, 14)}… on {net.label} <ExternalLink size={11} aria-hidden="true" />
                                </a>
                                <p style={{ color: "var(--fg-muted)", margin: "0.4rem 0 0", fontSize: "0.72rem" }}>
                                    The contract address (KT1…) appears on the explorer once the op is included.
                                </p>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => void deploy()}
                            disabled={deploying}
                            style={{
                                fontFamily: mono,
                                fontSize: "0.9rem",
                                padding: "0.7rem 1.2rem",
                                border: "1px solid var(--fg)",
                                background: "var(--fg)",
                                color: "var(--bg)",
                                cursor: deploying ? "wait" : "pointer",
                                alignSelf: "flex-start",
                            }}
                        >
                            {deploying ? "deploying…" : `deploy to ${net.label}`}
                        </button>
                    </section>
                </>
            )}
        </div>
    );
}
