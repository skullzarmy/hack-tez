import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useTezos } from "../context/TezosContext";
import { getSubSubdomains, validateLabel, type SubdomainRecord } from "../lib/domains";
import { submitCreateSubdomain } from "../lib/contract";
import { waitForOperation } from "../lib/tzkt";
import { parseProfileFromData } from "../types/profile";
import type { ProjectEntry } from "../types/profile";
import config from "../config/tezos";
import Select from "./ui/Select";

const TED_APP_URL = config.tedAppUrl;

type CreateStatus = "idle" | "submitting" | "confirming" | "refreshing" | "success" | "error";

/** Slugify a project name for use as a subdomain label */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63);
}

function SubSubdomainCard({ domain }: { domain: SubdomainRecord }) {
    const label = domain.name.split(".")[0];

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
                borderBottom: "1px solid var(--border)",
                flexWrap: "wrap",
            }}
        >
            <div style={{ minWidth: 0, flex: 1 }}>
                <div
                    style={{
                        fontFamily: "var(--font)",
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        color: "var(--fg)",
                        letterSpacing: "0.04em",
                    }}
                >
                    {label}
                    <span style={{ color: "var(--fg-3)", fontWeight: 400 }}>
                        .{domain.name.split(".").slice(1).join(".")}
                    </span>
                </div>
                {domain.address && (
                    <div
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6rem",
                            color: "var(--fg-3)",
                            letterSpacing: "0.02em",
                            marginTop: "0.15rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25em",
                        }}
                    >
                        <ArrowRight size={12} aria-hidden="true" /> {domain.address.slice(0, 10)}…{domain.address.slice(-6)}
                    </div>
                )}
            </div>
            <a
                href={`${TED_APP_URL}/domain/${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ flexShrink: 0 }}
                aria-label={`Manage ${domain.name} on Tezos Domains`}
            >
                Manage <ExternalLink size={14} aria-hidden="true" />
            </a>
        </div>
    );
}

interface CreateSubdomainFormProps {
    parentLabel: string;
    parentName: string;
    projects: ProjectEntry[];
    onCreated: () => void;
}

function CreateSubdomainForm({ parentLabel, parentName, projects, onCreated }: CreateSubdomainFormProps) {
    const { client } = useTezos();
    const [childLabel, setChildLabel] = useState("");
    const [targetAddress, setTargetAddress] = useState("");
    const [status, setStatus] = useState<CreateStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    const validation = childLabel ? validateLabel(childLabel) : null;
    const isIdle = status === "idle";
    const isValidAddress = !targetAddress || /^(tz|KT)[1-9A-HJ-NP-Za-km-z]{33}$/.test(targetAddress);
    const canSubmit =
        isIdle &&
        client &&
        childLabel.length >= 3 &&
        validation?.valid === true &&
        isValidAddress;

    function handleProjectSelect(e: React.ChangeEvent<HTMLSelectElement>) {
        const idx = parseInt(e.target.value, 10);
        if (Number.isNaN(idx) || idx < 0) return;
        const project = projects[idx];
        if (!project) return;
        const slug = slugify(project.name);
        if (slug.length >= 3) setChildLabel(slug);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!client || !canSubmit) return;

        setStatus("submitting");
        setError(null);
        setTxHash(null);

        try {
            const hash = await submitCreateSubdomain(
                parentLabel,
                childLabel,
                client,
                targetAddress || undefined,
            );
            setTxHash(hash);

            setStatus("confirming");
            const result = await waitForOperation(hash);
            if (result.status !== "applied") {
                setStatus("error");
                setError(result.errorMessage ?? "Transaction failed on-chain");
                return;
            }

            setStatus("refreshing");
            // Give TED GraphQL a moment to index the new record
            await new Promise((r) => setTimeout(r, 5000));

            setStatus("success");
            setChildLabel("");
            setTargetAddress("");
            onCreated();
        } catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Transaction failed");
        }
    }

    function reset() {
        setStatus("idle");
        setError(null);
        setTxHash(null);
    }

    if (status === "success") {
        return (
            <div className="status-panel status-panel--ok" role="status">
                <strong>✓ Sub-subdomain created</strong>
                {txHash && (
                    <div
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.6rem",
                            color: "var(--fg-3)",
                            marginTop: "0.5rem",
                            wordBreak: "break-all",
                        }}
                    >
                        tx: {txHash}
                    </div>
                )}
                <div className="panel-action">
                    <button onClick={reset} className="btn btn-ghost btn-sm">
                        Create another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {/* Project picker */}
                {projects.length > 0 && (
                    <div>
                        <label
                            htmlFor={`project-${parentLabel}`}
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.6rem",
                                color: "var(--fg-3)",
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                display: "block",
                                marginBottom: "0.35rem",
                            }}
                        >
                            Pick from projects
                        </label>
                        <Select
                            id={`project-${parentLabel}`}
                            options={projects.map((p, i) => ({
                                value: String(i),
                                label: p.name + (p.url ? ` (${p.url})` : ""),
                            }))}
                            value=""
                            onChange={(val) => {
                                const synth = { target: { value: val } } as React.ChangeEvent<HTMLSelectElement>;
                                handleProjectSelect(synth);
                            }}
                            placeholder="— Select a project —"
                            fullWidth
                        />
                    </div>
                )}

                {/* Child label input */}
                <div>
                    <label
                        htmlFor={`child-label-${parentLabel}`}
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.6rem",
                            color: "var(--fg-3)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            display: "block",
                            marginBottom: "0.35rem",
                        }}
                    >
                        Subdomain label
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                        <input
                            id={`child-label-${parentLabel}`}
                            type="text"
                            value={childLabel}
                            onChange={(e) => {
                                setChildLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                                if (status === "error") reset();
                            }}
                            placeholder="myproject"
                            maxLength={63}
                            autoComplete="off"
                            style={{
                                flex: 1,
                                fontFamily: "var(--font)",
                                fontSize: "0.75rem",
                                padding: "0.5rem 0.75rem",
                                background: "var(--bg-2)",
                                color: "var(--fg)",
                                border: "1px solid var(--border-2)",
                                borderRight: "none",
                            }}
                        />
                        <div
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.65rem",
                                color: "var(--fg-3)",
                                padding: "0.5rem 0.75rem",
                                background: "var(--bg-3)",
                                border: "1px solid var(--border-2)",
                                whiteSpace: "nowrap",
                            }}
                        >
                            .{parentName}
                        </div>
                    </div>
                    {childLabel && validation && !validation.valid && (
                        <div
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.6rem",
                                color: "var(--err)",
                                marginTop: "0.3rem",
                            }}
                        >
                            {validation.error}
                        </div>
                    )}
                </div>

                {/* Resolve address (optional — defaults to your wallet) */}
                <div>
                    <label
                        htmlFor={`address-${parentLabel}`}
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.6rem",
                            color: "var(--fg-3)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            display: "block",
                            marginBottom: "0.35rem",
                        }}
                    >
                        Resolve to wallet{" "}
                        <span style={{ textTransform: "none", fontWeight: 400 }}>(optional — defaults to yours)</span>
                    </label>
                    <input
                        id={`address-${parentLabel}`}
                        type="text"
                        value={targetAddress}
                        onChange={(e) => setTargetAddress(e.target.value.trim())}
                        placeholder="tz1… or KT1…"
                        maxLength={36}
                        autoComplete="off"
                        spellCheck={false}
                        style={{
                            width: "100%",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.7rem",
                            padding: "0.5rem 0.75rem",
                            background: "var(--bg-2)",
                            color: "var(--fg)",
                            border: `1px solid ${targetAddress && !isValidAddress ? "var(--err)" : "var(--border-2)"}`,
                        }}
                    />
                    {targetAddress && !isValidAddress && (
                        <div
                            style={{
                                fontFamily: "var(--font)",
                                fontSize: "0.6rem",
                                color: "var(--err)",
                                marginTop: "0.3rem",
                            }}
                        >
                            Invalid Tezos address
                        </div>
                    )}
                </div>

                {/* Error state */}
                {status === "error" && error && (
                    <div className="status-panel status-panel--err" role="alert">
                        {error}
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="btn btn-primary btn-sm"
                    style={{ alignSelf: "flex-start" }}
                >
                    {status === "submitting"
                        ? "Confirm in wallet…"
                        : status === "confirming"
                          ? "Confirming on-chain…"
                          : status === "refreshing"
                            ? "Refreshing…"
                            : "Create subdomain"}
                </button>
            </div>
        </form>
    );
}

interface SubdomainManagerProps {
    domain: SubdomainRecord;
    onMutate?: () => void;
}

export default function SubdomainManager({ domain, onMutate }: SubdomainManagerProps) {
    const [children, setChildren] = useState<SubdomainRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const hasFetched = useRef(false);

    const parentLabel = domain.name.split(".")[0];

    const fetchChildren = useCallback(async () => {
        if (!hasFetched.current) setLoading(true);
        try {
            const results = await getSubSubdomains(domain.name);
            setChildren(results);
            hasFetched.current = true;
        } catch {
            // Silently handle — sub-subdomains are supplemental
        } finally {
            setLoading(false);
        }
    }, [domain.name]);

    useEffect(() => {
        fetchChildren();
    }, [fetchChildren]);

    // Also extract projects from the domain profile data
    const profile = parseProfileFromData(domain.data);
    const projectEntries = profile.projects ?? [];

    return (
        <div
            style={{
                marginTop: "0.75rem",
                borderTop: "1px solid var(--border)",
                paddingTop: "0.75rem",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                }}
            >
                <span
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.6rem",
                        color: "var(--fg-3)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                    }}
                >
                    Sub-subdomains
                    {!loading && children.length > 0 && (
                        <span style={{ marginLeft: "0.5rem", color: "var(--fg-2)" }}>
                            ({children.length})
                        </span>
                    )}
                </span>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="btn btn-ghost btn-sm"
                    aria-label={showCreate ? "Cancel creating subdomain" : "Create new sub-subdomain"}
                >
                    {showCreate ? "✕ Cancel" : "+ New"}
                </button>
            </div>

            {/* Existing sub-subdomains */}
            {loading ? (
                <div
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        color: "var(--fg-3)",
                        padding: "0.5rem 0",
                    }}
                >
                    Loading…
                </div>
            ) : children.length > 0 ? (
                <div
                    style={{
                        border: "1px solid var(--border)",
                        marginBottom: showCreate ? "1rem" : 0,
                    }}
                    role="list"
                    aria-label={`Sub-subdomains of ${domain.name}`}
                >
                    {children.map((child) => (
                        <div key={child.name} role="listitem">
                            <SubSubdomainCard domain={child} />
                        </div>
                    ))}
                </div>
            ) : !showCreate ? (
                <div
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        color: "var(--fg-3)",
                        padding: "0.5rem 0",
                    }}
                >
                    No sub-subdomains yet.
                </div>
            ) : null}

            {/* Creation form */}
            {showCreate && (
                <div
                    style={{
                        background: "var(--bg-2)",
                        border: "1px solid var(--border-2)",
                        padding: "1rem 1.25rem",
                    }}
                >
                    <CreateSubdomainForm
                        parentLabel={parentLabel}
                        parentName={domain.name}
                        projects={projectEntries}
                        onCreated={() => {
                            fetchChildren();
                            onMutate?.();
                        }}
                    />
                </div>
            )}
        </div>
    );
}

/** Pin button for use on project listings */
export function PinToSubdomainButton({
    project,
    parentName,
    onPin,
}: {
    project: ProjectEntry;
    parentName: string;
    onPin: (childLabel: string) => void;
}) {
    const slug = slugify(project.name);
    if (slug.length < 3) return null;

    return (
        <button
            onClick={() => onPin(slug)}
            className="btn btn-ghost btn-sm"
            title={`Create ${slug}.${parentName}`}
            aria-label={`Pin ${project.name} as ${slug}.${parentName}`}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.55rem" }}
        >
            📌
        </button>
    );
}
