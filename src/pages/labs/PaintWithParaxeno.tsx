/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, Maximize2, Palette, ShoppingBag } from "lucide-react";
import { getLab } from "../../lib/labs";
import { useTezos } from "../../context/TezosContext";
import { usePageMeta } from "../../hooks/usePageMeta";
import ConnectWallet from "../../components/ConnectWallet";
import config from "../../config/tezos";
import { waitForOperation } from "../../lib/contract";
import {
    fetchObjktToken,
    formatMutezToXtz,
    fulfillObjktAsk,
    ipfsToHttp,
    OBJKT_MARKETPLACE_V3,
    type ObjktTokenInfo,
} from "../../lib/objktBuy";

const NFT_CONTRACT = "KT1UTDzQvKNau6KUMKomsNPaSYrLxuRJ35HK";
const NFT_TOKEN_ID = "1";
const OBJKT_URL = `https://objkt.com/tokens/${NFT_CONTRACT}/${NFT_TOKEN_ID}`;
const PARAXENO_X_URL = "https://x.com/paraxenod";
const TOOL_SRC = "/lab-files/paint-with-paraxeno.html";

type BuyState =
    | { status: "idle" }
    | { status: "signing" }
    | { status: "confirming"; opHash: string }
    | { status: "done"; opHash: string }
    | { status: "error"; message: string };

export default function PaintWithParaxeno() {
    const lab = getLab("paint-with-paraxeno");
    const { client, address } = useTezos();

    const [token, setToken] = useState<ObjktTokenInfo | null>(null);
    const [loadingToken, setLoadingToken] = useState(true);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [buy, setBuy] = useState<BuyState>({ status: "idle" });
    const hasFetched = useRef(false);

    usePageMeta({
        title: "Paint with Paraxeno — Labs — hack.tez",
        description:
            lab?.summary ??
            "Generative image & GIF creation machine by @paraxenod. Use the tool in-browser and collect the edition on Tezos.",
        path: "/labs/paint-with-paraxeno",
    });

    const loadToken = useCallback(async () => {
        if (!hasFetched.current) {
            setLoadingToken(true);
        }
        try {
            const info = await fetchObjktToken(NFT_CONTRACT, NFT_TOKEN_ID);
            setToken(info);
            setTokenError(null);
        } catch (err) {
            setTokenError(err instanceof Error ? err.message : "Failed to load objkt listing");
        } finally {
            hasFetched.current = true;
            setLoadingToken(false);
        }
    }, []);

    useEffect(() => {
        void loadToken();
    }, [loadToken]);

    const bestListing = token?.listings.find((l) => l.marketplaceContract === OBJKT_MARKETPLACE_V3) ?? null;
    const totalAvailable = token?.listings.reduce((sum, l) => sum + l.amountLeft, 0) ?? 0;
    const isMainnet = config.name === "mainnet";
    const thumbUrl = ipfsToHttp(token?.displayUri);

    async function handleBuy() {
        if (!client || !address || !bestListing || !isMainnet) return;
        setBuy({ status: "signing" });
        try {
            const opHash = await fulfillObjktAsk(client, bestListing, 1);
            setBuy({ status: "confirming", opHash });
            await waitForOperation(opHash, { pollMs: 3000, timeoutMs: 90_000 });
            setBuy({ status: "done", opHash });
            void loadToken();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Transaction cancelled or failed";
            setBuy({ status: "error", message: msg });
        }
    }

    return (
        <div className="container" style={{ paddingBlock: "2rem" }}>
            <Link
                to="/labs"
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    color: "var(--fg-muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35em",
                    marginBottom: "1.25rem",
                    textDecoration: "none",
                }}
            >
                <ArrowLeft size={14} aria-hidden="true" /> back to labs
            </Link>

            <header
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "1rem",
                    marginBottom: "1.25rem",
                }}
            >
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                        <Palette size={22} aria-hidden="true" style={{ color: "var(--fg)" }} />
                        <h1
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
                                letterSpacing: "-0.02em",
                                margin: 0,
                            }}
                        >
                            // Paint with Paraxeno
                        </h1>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.62rem",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                padding: "0.18em 0.55em",
                                color: "var(--ok)",
                                background: "var(--ok-bg)",
                                border: "1px solid var(--ok)",
                            }}
                        >
                            {lab?.status ?? "production"}
                        </span>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.7rem",
                                color: "var(--fg-muted)",
                            }}
                        >
                            v{lab?.version ?? "6.73"}
                        </span>
                    </div>
                    <p style={{ color: "var(--fg-muted)", fontSize: "0.85rem", margin: "0.4rem 0 0", maxWidth: "68ch" }}>
                        Generative image &amp; GIF creation machine by{" "}
                        <a
                            href={PARAXENO_X_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg)", textDecoration: "underline" }}
                        >
                            @paraxenod
                        </a>
                        . Paint, glitch, layer your own images, export PNG or GIF — hosted right here on the lab.
                    </p>
                </div>

                <a
                    href={TOOL_SRC}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.75rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4em",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                    }}
                >
                    <Maximize2 size={13} aria-hidden="true" /> open standalone
                </a>
            </header>

            {/* In-situ NFT card + objkt buy bar */}
            <section
                aria-label="Collect on objkt"
                style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    padding: "1rem 1.25rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", minWidth: 0, flex: "1 1 280px" }}>
                    {thumbUrl && (
                        <a href={OBJKT_URL} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                            <img
                                src={thumbUrl}
                                alt={token?.name ?? "Paint with Paraxeno NFT"}
                                width={56}
                                height={56}
                                style={{
                                    width: "56px",
                                    height: "56px",
                                    objectFit: "cover",
                                    border: "1px solid var(--border)",
                                    display: "block",
                                }}
                            />
                        </a>
                    )}
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    color: "var(--fg)",
                                }}
                            >
                                {token?.name ?? "Paint with Paraxeno: a generative image creation machine"}
                            </span>
                        </div>
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                color: "var(--fg-muted)",
                                marginTop: "0.25rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.6rem",
                                flexWrap: "wrap",
                            }}
                        >
                            {loadingToken ? (
                                <span>// loading objkt listing…</span>
                            ) : tokenError ? (
                                <span style={{ color: "var(--warn)" }}>// listing unavailable ({tokenError})</span>
                            ) : bestListing ? (
                                <span>
                                    <strong style={{ color: "var(--fg)" }}>
                                        {formatMutezToXtz(bestListing.priceMutez)} XTZ
                                    </strong>{" "}
                                    · {totalAvailable} / {token?.supply ?? 888} available
                                </span>
                            ) : (
                                <span>no active XTZ listing · {token?.supply ?? 888} editions</span>
                            )}
                            <a
                                href={OBJKT_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    color: "var(--fg)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.25em",
                                }}
                            >
                                view on objkt <ExternalLink size={11} aria-hidden="true" />
                            </a>
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    {!address ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)" }}>
                                {bestListing
                                    ? `connect wallet to collect (${formatMutezToXtz(bestListing.priceMutez)} XTZ)`
                                    : "connect wallet"}
                            </span>
                            <ConnectWallet />
                        </div>
                    ) : !isMainnet ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--warn)" }}>
                            // mainnet only for in-situ buy (connected: {config.name})
                        </span>
                    ) : bestListing ? (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void handleBuy()}
                            disabled={buy.status === "signing" || buy.status === "confirming"}
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.78rem",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.45em",
                                cursor:
                                    buy.status === "signing" || buy.status === "confirming"
                                        ? "wait"
                                        : "pointer",
                            }}
                        >
                            <ShoppingBag size={14} aria-hidden="true" />
                            {buy.status === "signing"
                                ? "confirm in wallet…"
                                : buy.status === "confirming"
                                  ? "confirming on tezos…"
                                  : `collect edition · ${formatMutezToXtz(bestListing.priceMutez)} XTZ`}
                        </button>
                    ) : null}
                </div>

                {buy.status === "done" && (
                    <div
                        style={{
                            width: "100%",
                            borderTop: "1px solid var(--border)",
                            paddingTop: "0.6rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.74rem",
                            color: "var(--ok)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                        }}
                    >
                        <Check size={14} aria-hidden="true" />
                        <span>collected!</span>
                        <a
                            href={`https://tzkt.io/${buy.opHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg)", display: "inline-flex", alignItems: "center", gap: "0.25em" }}
                        >
                            view op on tzkt <ExternalLink size={11} aria-hidden="true" />
                        </a>
                    </div>
                )}

                {buy.status === "error" && (
                    <div
                        style={{
                            width: "100%",
                            borderTop: "1px solid var(--border)",
                            paddingTop: "0.6rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.74rem",
                            color: "var(--err, #ff6b6b)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                        }}
                    >
                        <span>// {buy.message}</span>
                        <button
                            type="button"
                            onClick={() => setBuy({ status: "idle" })}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.7rem",
                                cursor: "pointer",
                            }}
                        >
                            dismiss
                        </button>
                    </div>
                )}
            </section>

            {/* Hosted tool iframe */}
            <div
                style={{
                    border: "1px solid var(--border)",
                    background: "#0b0a0e",
                    width: "100%",
                    height: "clamp(640px, 82vh, 1080px)",
                    overflow: "hidden",
                }}
            >
                <iframe
                    src={TOOL_SRC}
                    title="Paint with Paraxeno"
                    style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        display: "block",
                    }}
                />
            </div>
        </div>
    );
}
