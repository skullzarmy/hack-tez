/** biome-ignore-all lint/suspicious/noCommentText: <matches ProfileEditForm> */

import { useCallback, useState } from "react";
import { ipfsUriToGatewayUrl } from "../lib/pin";
import { lookupToken, TokenLookupError } from "../lib/tips";
import type { TipJar, TipToken } from "../types/profile";
import {
    DEFAULT_TIP_AMOUNTS,
    DEFAULT_TIP_TITLE,
    isTezosAddress,
    isValidTipAmount,
    MAX_TIP_AMOUNTS,
    MAX_TIP_TOKENS,
    TIP_DESC_MAX,
    TIP_TITLE_MAX,
    TIP_TITLE_SUGGESTIONS,
} from "../types/profile";
import { Switch } from "./ui/switch";

// Local copies of ProfileEditForm's shared styles — kept here so this module
// has no import cycle with its parent.
const INPUT_BASE: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-2)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "0.5rem 0.65rem",
    color: "var(--fg)",
    fontFamily: "var(--font)",
    fontSize: "0.8rem",
    boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    color: "var(--fg-3)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: "0.35rem",
};

const SMALL_BUTTON: React.CSSProperties = {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--fg-3)",
    cursor: "pointer",
    fontSize: "0.65rem",
    padding: "0.3rem 0.6rem",
    minHeight: "1.5rem",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontFamily: "var(--font)",
};

const HINT_STYLE: React.CSSProperties = {
    fontSize: "0.68rem",
    color: "var(--fg-3)",
    lineHeight: 1.5,
};

// ── Preset amount row ────────────────────────────────────────────────

/**
 * Up to MAX_TIP_AMOUNTS preset amounts. Empty slots are dropped on save, so
 * the editor keeps them as free-text and validates non-empty entries only.
 */
function AmountRow({
    idPrefix,
    unit,
    decimals,
    amounts,
    onChange,
}: {
    idPrefix: string;
    unit: string;
    decimals: number;
    amounts: string[];
    onChange: (next: string[]) => void;
}) {
    const slots = [...amounts];
    while (slots.length < MAX_TIP_AMOUNTS) slots.push("");

    return (
        <div>
            <span style={LABEL_STYLE}>
                Preset amounts ({unit}) — up to {MAX_TIP_AMOUNTS}
            </span>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${MAX_TIP_AMOUNTS}, 1fr)`,
                    gap: "0.5rem",
                }}
            >
                {slots.map((value, i) => {
                    const invalid = value.trim() !== "" && !isValidTipAmount(value, decimals);
                    return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length preset amount slots, edited in place; the position is the slot's identity
                        <div key={`${idPrefix}-amt-${i}`}>
                            <input
                                id={`${idPrefix}-amt-${i}`}
                                type="text"
                                inputMode="decimal"
                                value={value}
                                onChange={(e) => {
                                    const next = [...slots];
                                    next[i] = e.target.value;
                                    onChange(next);
                                }}
                                style={{
                                    ...INPUT_BASE,
                                    borderColor: invalid ? "var(--err)" : "var(--border)",
                                    fontFamily: "var(--font-mono)",
                                }}
                                placeholder={DEFAULT_TIP_AMOUNTS[i] ?? "0"}
                                aria-label={`Preset amount ${i + 1} in ${unit}`}
                                aria-invalid={invalid}
                            />
                        </div>
                    );
                })}
            </div>
            <p style={{ ...HINT_STYLE, marginTop: "0.35rem" }}>
                Leave a box empty to skip it. Decimals allowed
                {decimals > 0 ? ` (up to ${decimals} places)` : " — this token has none"}.
            </p>
        </div>
    );
}

// ── Custom token add form ────────────────────────────────────────────

function AddTokenForm({
    onAdd,
    disabled,
    idPrefix,
}: {
    /** Returns an error message to display, or null when the token was added. */
    onAdd: (token: TipToken) => string | null;
    disabled: boolean;
    idPrefix: string;
}) {
    const [contract, setContract] = useState("");
    const [tokenId, setTokenId] = useState("");
    const [looking, setLooking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLookup = useCallback(async () => {
        setLooking(true);
        setError(null);
        try {
            const token = await lookupToken(contract, tokenId || "0");
            const addError = onAdd(token);
            if (addError) {
                setError(addError);
                return;
            }
            setContract("");
            setTokenId("");
        } catch (err) {
            setError(
                err instanceof TokenLookupError
                    ? err.message
                    : "Lookup failed. Check the contract and try again.",
            );
        } finally {
            setLooking(false);
        }
    }, [contract, tokenId, onAdd]);

    if (disabled) {
        return (
            <p style={HINT_STYLE}>
                Token limit reached ({MAX_TIP_TOKENS}). Remove one to add another.
            </p>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 2.5fr) minmax(0, 1fr) auto",
                    gap: "0.5rem",
                    alignItems: "end",
                }}
            >
                <div>
                    <label htmlFor={`${idPrefix}-token-contract`} style={LABEL_STYLE}>
                        Contract
                    </label>
                    <input
                        id={`${idPrefix}-token-contract`}
                        type="text"
                        value={contract}
                        onChange={(e) => setContract(e.target.value.trim())}
                        style={{ ...INPUT_BASE, fontFamily: "var(--font-mono)" }}
                        placeholder="KT1…"
                        spellCheck={false}
                        autoComplete="off"
                    />
                </div>
                <div>
                    <label htmlFor={`${idPrefix}-token-id`} style={LABEL_STYLE}>
                        Token ID
                    </label>
                    <input
                        id={`${idPrefix}-token-id`}
                        type="text"
                        inputMode="numeric"
                        value={tokenId}
                        onChange={(e) => setTokenId(e.target.value.trim())}
                        style={{ ...INPUT_BASE, fontFamily: "var(--font-mono)" }}
                        placeholder="0"
                    />
                </div>
                <button
                    type="button"
                    onClick={handleLookup}
                    disabled={looking || contract.trim() === ""}
                    style={{
                        ...SMALL_BUTTON,
                        padding: "0.5rem 0.8rem",
                        opacity: looking || contract.trim() === "" ? 0.5 : 1,
                        cursor: looking ? "wait" : "pointer",
                    }}
                >
                    {looking ? "Looking…" : "Look up"}
                </button>
            </div>

            {error && (
                <p style={{ ...HINT_STYLE, color: "var(--err)" }}>{error}</p>
            )}

            <p style={HINT_STYLE}>
                We read the token's name, symbol and decimals from its on-chain
                TZIP-12 metadata. FA1.2 and FA2 fungible tokens only.
            </p>
        </div>
    );
}

// ── Token card ───────────────────────────────────────────────────────

function TokenCard({
    token,
    index,
    idPrefix,
    onChange,
    onRemove,
}: {
    token: TipToken;
    index: number;
    idPrefix: string;
    onChange: (t: TipToken) => void;
    onRemove: () => void;
}) {
    return (
        <div
            style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        minWidth: 0,
                    }}
                >
                    {token.thumbnail && (
                        <img
                            src={ipfsUriToGatewayUrl(token.thumbnail)}
                            alt=""
                            width={20}
                            height={20}
                            style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                        />
                    )}
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.75rem",
                            color: "var(--fg)",
                            fontWeight: 700,
                        }}
                    >
                        {token.symbol}
                    </span>
                    <span
                        style={{
                            fontSize: "0.68rem",
                            color: "var(--fg-3)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {token.name ? `${token.name} · ` : ""}
                        {token.standard.toUpperCase()}
                        {token.standard === "fa2" ? ` #${token.tokenId}` : ""}
                    </span>
                </div>
                <button type="button" onClick={onRemove} style={SMALL_BUTTON}>
                    Remove
                </button>
            </div>

            <AmountRow
                idPrefix={`${idPrefix}-token-${index}`}
                unit={token.symbol}
                decimals={token.decimals}
                amounts={token.amounts ?? []}
                onChange={(next) => onChange({ ...token, amounts: next })}
            />
        </div>
    );
}

// ── Section ──────────────────────────────────────────────────────────

export function TipJarEditor({
    jar,
    onChange,
    /** Unique per jar on the page — profile jar vs. one per project. */
    idPrefix = "tip",
    heading = "Tip Jar",
    toggleLabel = "Accept tips on my profile",
    defaultTitle = DEFAULT_TIP_TITLE,
    /** Where tips land when no payTo override is set. */
    defaultRecipient,
}: {
    jar: TipJar | undefined;
    onChange: (next: TipJar | undefined) => void;
    idPrefix?: string;
    heading?: string;
    toggleLabel?: string;
    defaultTitle?: string;
    defaultRecipient?: string;
}) {
    const current: TipJar = jar ?? { enabled: false };
    const enabled = current.enabled;
    const payToInvalid =
        (current.payTo ?? "").trim() !== "" && !isTezosAddress(current.payTo ?? "");

    const patch = useCallback(
        (fields: Partial<TipJar>) => {
            onChange({ ...current, ...fields });
        },
        [current, onChange],
    );

    function handleToggle(next: boolean) {
        if (!next) {
            // Keep the config, just switch it off — re-enabling restores it.
            patch({ enabled: false });
            return;
        }
        // First enable seeds sensible defaults so the jar is usable immediately.
        onChange({
            ...current,
            enabled: true,
            title: current.title ?? defaultTitle,
            amounts: current.amounts ?? [...DEFAULT_TIP_AMOUNTS],
            customAmount: current.customAmount ?? true,
        });
    }

    const tokens = current.tokens ?? [];

    return (
        <fieldset
            style={{
                border: "1px solid var(--border)",
                borderRadius: "8px",
                margin: 0,
                marginBottom: "1.25rem",
                padding: "0.85rem",
                minInlineSize: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
            }}
        >
            <legend
                style={{
                    ...LABEL_STYLE,
                    marginBottom: 0,
                    padding: "0 0.4rem",
                }}
            >
                {heading}
            </legend>

            {/* ── Master toggle ───────────────────────────────── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <span
                        style={{
                            display: "block",
                            fontSize: "0.8rem",
                            color: "var(--fg)",
                            marginBottom: "0.15rem",
                        }}
                    >
                        {toggleLabel}
                    </span>
                    <span style={HINT_STYLE}>
                        Off by default. hack.tez takes no fee — tips go straight from the
                        sender's wallet to yours.
                    </span>
                </div>
                <Switch
                    checked={enabled}
                    onCheckedChange={handleToggle}
                    aria-label={toggleLabel}
                />
            </div>

            {enabled && (
                <>
                    {/* ── Title ───────────────────────────────── */}
                    <div>
                        <label htmlFor={`${idPrefix}-title`} style={LABEL_STYLE}>
                            Title ({(current.title ?? "").length}/{TIP_TITLE_MAX})
                        </label>
                        <input
                            id={`${idPrefix}-title`}
                            type="text"
                            value={current.title ?? ""}
                            onChange={(e) =>
                                patch({ title: e.target.value.slice(0, TIP_TITLE_MAX) })
                            }
                            style={INPUT_BASE}
                            maxLength={TIP_TITLE_MAX}
                            placeholder={defaultTitle}
                        />
                        <div
                            style={{
                                display: "flex",
                                gap: "0.35rem",
                                flexWrap: "wrap",
                                marginTop: "0.35rem",
                            }}
                        >
                            {TIP_TITLE_SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => patch({ title: s })}
                                    style={{
                                        ...SMALL_BUTTON,
                                        textTransform: "none",
                                        letterSpacing: "normal",
                                        borderStyle: "dashed",
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Description ─────────────────────────── */}
                    <div>
                        <label htmlFor={`${idPrefix}-desc`} style={LABEL_STYLE}>
                            Description ({(current.desc ?? "").length}/{TIP_DESC_MAX})
                        </label>
                        <textarea
                            id={`${idPrefix}-desc`}
                            value={current.desc ?? ""}
                            onChange={(e) =>
                                patch({ desc: e.target.value.slice(0, TIP_DESC_MAX) })
                            }
                            style={{ ...INPUT_BASE, resize: "vertical", minHeight: "2.5rem" }}
                            maxLength={TIP_DESC_MAX}
                            rows={2}
                            placeholder="What are tips for? (optional)"
                        />
                    </div>

                    {/* ── Tez presets ─────────────────────────── */}
                    <AmountRow
                        idPrefix={`${idPrefix}-tez`}
                        unit="tez"
                        decimals={6}
                        amounts={current.amounts ?? []}
                        onChange={(next) => patch({ amounts: next })}
                    />

                    {/* ── Custom amount toggle ────────────────── */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <span
                                style={{
                                    display: "block",
                                    fontSize: "0.8rem",
                                    color: "var(--fg)",
                                    marginBottom: "0.15rem",
                                }}
                            >
                                Allow a custom amount
                            </span>
                            <span style={HINT_STYLE}>
                                Adds a free-form tez input alongside your presets.
                            </span>
                        </div>
                        <Switch
                            checked={current.customAmount === true}
                            onCheckedChange={(v) => patch({ customAmount: v })}
                            aria-label="Allow a custom amount"
                        />
                    </div>

                    {/* ── Custom tokens ───────────────────────── */}
                    <div
                        style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
                    >
                        <span style={LABEL_STYLE}>Custom tokens</span>

                        {tokens.map((token, i) => (
                            <TokenCard
                                key={`${token.contract}:${token.tokenId}`}
                                token={token}
                                index={i}
                                idPrefix={idPrefix}
                                onChange={(t) => {
                                    const next = [...tokens];
                                    next[i] = t;
                                    patch({ tokens: next });
                                }}
                                onRemove={() => {
                                    const next = tokens.filter((_, j) => j !== i);
                                    patch({ tokens: next.length > 0 ? next : undefined });
                                }}
                            />
                        ))}

                        <AddTokenForm
                            idPrefix={idPrefix}
                            disabled={tokens.length >= MAX_TIP_TOKENS}
                            onAdd={(token) => {
                                const dupe = tokens.some(
                                    (t) =>
                                        t.contract === token.contract &&
                                        t.tokenId === token.tokenId,
                                );
                                if (dupe) return `${token.symbol} is already in your list.`;
                                patch({ tokens: [...tokens, token] });
                                return null;
                            }}
                        />
                    </div>

                    {/* ── Recipient override ──────────────────── */}
                    <div>
                        <label htmlFor={`${idPrefix}-payto`} style={LABEL_STYLE}>
                            Send tips to (optional)
                        </label>
                        <input
                            id={`${idPrefix}-payto`}
                            type="text"
                            value={current.payTo ?? ""}
                            onChange={(e) => patch({ payTo: e.target.value.trim() })}
                            style={{
                                ...INPUT_BASE,
                                fontFamily: "var(--font-mono)",
                                borderColor: payToInvalid ? "var(--err)" : "var(--border)",
                            }}
                            placeholder={defaultRecipient ?? "tz1… or KT1…"}
                            spellCheck={false}
                            autoComplete="off"
                            aria-invalid={payToInvalid}
                        />
                        <p style={{ ...HINT_STYLE, marginTop: "0.35rem" }}>
                            {payToInvalid
                                ? "Not a valid Tezos address."
                                : "Leave blank to receive tips at your domain's address."}
                        </p>
                    </div>
                </>
            )}
        </fieldset>
    );
}
