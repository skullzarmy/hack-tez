/** biome-ignore-all lint/suspicious/noCommentText: <matches Profile> */

import { useEffect, useMemo, useState } from "react";
import { useTezos } from "../context/TezosContext";
import { useBlueskyHandle } from "../hooks/useBlueskyHandle";
import { ipfsUriToGatewayUrl } from "../lib/pin";
import type { TipCounters } from "../lib/tips";
import { getTipCounters, reportTip, sendTip } from "../lib/tips";
import type { TipShareContext } from "../lib/tipShare";
import type { TipJar as TipJarConfig, TipToken } from "../types/profile";
import {
    DEFAULT_TIP_TITLE,
    isValidTipAmount,
    tipJarIsLive,
} from "../types/profile";
import { TipShareModal } from "./TipShareModal";

/** tez is asset id "", tokens are "contract:tokenId". */
const TEZ_ID = "";

function assetId(token: TipToken): string {
    return `${token.contract}:${token.tokenId}`;
}

const CHIP_BASE: React.CSSProperties = {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--fg-2)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    padding: "0.35rem 0.7rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
};

const CHIP_ACTIVE: React.CSSProperties = {
    ...CHIP_BASE,
    borderColor: "var(--ok)",
    color: "var(--ok)",
    background: "rgba(34,197,94,0.08)",
};

/** Everything the share sheet needs about who is being tipped. */
export interface TipRecipientInfo {
    /** Domain label — `joe` in joe.hack.tez */
    label: string;
    fullName: string;
    displayName: string;
    /** X/Twitter handle from the recipient's profile */
    twitter?: string;
    /** Bluesky DID or handle from the recipient's profile */
    bluesky?: string;
    /** Set when this jar belongs to a project rather than the profile */
    projectName?: string;
    projectSlug?: string;
}

export function TipJar({
    jar,
    recipient,
    /** Heading level context — the profile jar is a section, project jars nest. */
    title: titleOverride,
    isSelf,
    info,
}: {
    jar: TipJarConfig | undefined;
    /** Address that receives the tip. */
    recipient: string;
    title?: string;
    /** True when the viewer owns this profile — tipping yourself is pointless. */
    isSelf: boolean;
    info: TipRecipientInfo;
}) {
    const { address, client, connect, connecting } = useTezos();
    const blueskyHandle = useBlueskyHandle(info.bluesky);

    const tokens = useMemo(() => jar?.tokens ?? [], [jar?.tokens]);
    const [selected, setSelected] = useState<string>(TEZ_ID);
    const [custom, setCustom] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState<{
        opHash: string;
        ctx: TipShareContext;
    } | null>(null);
    const [counters, setCounters] = useState<TipCounters | null>(null);
    // Bumped after a tip confirms so the totals pick it up.
    const [countersKey, setCountersKey] = useState(0);

    const live = tipJarIsLive(jar);
    // biome-ignore lint/correctness/useExhaustiveDependencies: countersKey is a bump-to-refetch trigger, not a value the effect reads
    useEffect(() => {
        if (!live) return;
        let cancelled = false;
        getTipCounters(info.label).then((c) => {
            if (!cancelled) setCounters(c);
        });
        return () => {
            cancelled = true;
        };
    }, [live, info.label, countersKey]);

    // Hooks must run before the early return.
    const activeToken = useMemo(
        () => tokens.find((t) => assetId(t) === selected),
        [tokens, selected],
    );

    if (!live || !jar) return null;

    // Project jars show that project's tally; the profile jar shows the total.
    const scoped = info.projectSlug
        ? counters?.projects.find((p) => p.slug === info.projectSlug)
        : counters;
    const tally =
        scoped && scoped.count > 0
            ? `${scoped.count} tip${scoped.count === 1 ? "" : "s"}` +
              (scoped.totals.length > 0
                  ? ` · ${scoped.totals.map((t) => `${t.total} ${t.symbol}`).join(" · ")}`
                  : "")
            : null;

    const decimals = activeToken?.decimals ?? 6;
    const unit = activeToken?.symbol ?? "tez";
    const presets = (activeToken ? activeToken.amounts : jar.amounts) ?? [];

    // Never leave an asset with no way to tip: if the owner turned custom
    // amounts off but this asset has no presets, fall back to a custom input.
    const showCustom = jar.customAmount === true || presets.length === 0;
    const customValid = custom.trim() !== "" && isValidTipAmount(custom, decimals);

    async function submit(amount: string) {
        if (!recipient) {
            setError("This profile has no address set to receive tips.");
            return;
        }
        if (!address || !client) {
            setError(null);
            await connect();
            return;
        }
        setSending(true);
        setError(null);
        setSent(null);
        try {
            const hash = await sendTip(client, {
                from: address,
                to: recipient,
                amount,
                token: activeToken,
            });
            setSent({
                opHash: hash,
                ctx: {
                    amount,
                    unit,
                    label: info.label,
                    fullName: info.fullName,
                    displayName: info.displayName,
                    twitter: info.twitter,
                    blueskyHandle: blueskyHandle ?? undefined,
                    projectName: info.projectName,
                    projectSlug: info.projectSlug,
                },
            });
            setCustom("");
            // Background: wait for inclusion, then report for the public
            // counters. Never blocks or interrupts the share flow.
            reportTip({
                opHash: hash,
                label: info.label,
                projectSlug: info.projectSlug,
            }).then(() => setCountersKey((k) => k + 1));
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Transaction failed";
            // Wallet rejections are a normal outcome, not an error worth shouting about.
            setError(/abort|reject|denied|closed/i.test(msg) ? null : msg);
        } finally {
            setSending(false);
        }
    }

    const connected = address !== null && client !== null;
    const disabled = sending || isSelf;

    return (
        <section
            style={{
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
            }}
        >
            <div>
                <h2
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.8rem",
                        color: "var(--fg)",
                        letterSpacing: "0.04em",
                        marginBottom: jar.desc ? "0.35rem" : 0,
                    }}
                >
                    {titleOverride ?? jar.title ?? DEFAULT_TIP_TITLE}
                </h2>
                {jar.desc && (
                    <p
                        style={{
                            fontSize: "0.78rem",
                            color: "var(--fg-2)",
                            lineHeight: 1.5,
                        }}
                    >
                        {jar.desc}
                    </p>
                )}
                {tally && (
                    <p
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.68rem",
                            color: "var(--fg-3)",
                            marginTop: "0.4rem",
                        }}
                    >
                        ⚡ {tally}
                    </p>
                )}
            </div>

            {/* ── Asset picker (only when custom tokens exist) ──────── */}
            {tokens.length > 0 && (
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    <button
                        type="button"
                        onClick={() => setSelected(TEZ_ID)}
                        style={selected === TEZ_ID ? CHIP_ACTIVE : CHIP_BASE}
                        aria-pressed={selected === TEZ_ID}
                    >
                        tez
                    </button>
                    {tokens.map((t) => {
                        const id = assetId(t);
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setSelected(id)}
                                style={selected === id ? CHIP_ACTIVE : CHIP_BASE}
                                aria-pressed={selected === id}
                                title={t.name ?? t.symbol}
                            >
                                {t.thumbnail && (
                                    <img
                                        src={ipfsUriToGatewayUrl(t.thumbnail)}
                                        alt=""
                                        width={14}
                                        height={14}
                                        style={{ borderRadius: "50%", objectFit: "cover" }}
                                    />
                                )}
                                {t.symbol}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Preset amounts ───────────────────────────────────── */}
            {presets.length > 0 && (
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {presets.map((amount) => (
                        <button
                            key={amount}
                            type="button"
                            onClick={() => submit(amount)}
                            disabled={disabled}
                            style={{
                                ...CHIP_BASE,
                                borderColor: "var(--fg-3)",
                                color: "var(--fg)",
                                fontWeight: 700,
                                padding: "0.45rem 0.9rem",
                                opacity: disabled ? 0.5 : 1,
                                cursor: disabled ? "not-allowed" : "pointer",
                            }}
                        >
                            {amount} {unit}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Custom amount ────────────────────────────────────── */}
            {showCustom && (
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "stretch" }}>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder={`Amount in ${unit}`}
                        aria-label={`Custom tip amount in ${unit}`}
                        disabled={disabled}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            background: "var(--bg-2)",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                            padding: "0.5rem 0.65rem",
                            color: "var(--fg)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.8rem",
                            boxSizing: "border-box",
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => submit(custom)}
                        disabled={disabled || !customValid}
                        style={{
                            background: "var(--fg)",
                            color: "var(--bg)",
                            border: "none",
                            borderRadius: "4px",
                            padding: "0.5rem 1rem",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            fontFamily: "var(--font)",
                            cursor: disabled || !customValid ? "not-allowed" : "pointer",
                            opacity: disabled || !customValid ? 0.4 : 1,
                            whiteSpace: "nowrap",
                        }}
                    >
                        Send
                    </button>
                </div>
            )}

            {/* ── Status ───────────────────────────────────────────── */}
            {isSelf ? (
                <p style={{ fontSize: "0.68rem", color: "var(--fg-3)" }}>
                    This is how your tip jar looks to visitors.
                </p>
            ) : !connected ? (
                <button
                    type="button"
                    onClick={connect}
                    disabled={connecting}
                    style={{
                        alignSelf: "flex-start",
                        ...CHIP_BASE,
                        cursor: connecting ? "wait" : "pointer",
                    }}
                >
                    {connecting ? "Connecting…" : "Connect wallet to tip"}
                </button>
            ) : (
                <p style={{ fontSize: "0.68rem", color: "var(--fg-3)" }}>
                    {sending
                        ? "Confirm in your wallet…"
                        : "Sent straight from your wallet. hack.tez takes no fee."}
                </p>
            )}

            {error && (
                <p style={{ fontSize: "0.72rem", color: "var(--err)" }}>{error}</p>
            )}

            {sent && (
                <TipShareModal
                    ctx={sent.ctx}
                    opHash={sent.opHash}
                    onClose={() => setSent(null)}
                />
            )}
        </section>
    );
}
