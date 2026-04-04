import { useState, useEffect, useCallback } from "react";
import { useTezos } from "../context/TezosContext";
import { getSubSubdomains, validateLabel, type SubdomainRecord } from "../lib/domains";
import { submitCreateSubdomain } from "../lib/contract";
import { parseProfileFromData } from "../types/profile";
import type { ProjectEntry } from "../types/profile";
import config from "../config/tezos";

const TED_APP_URL =
    config.name === "mainnet" ? "https://app.tezos.domains" : "https://ghostnet.app.tezos.domains";

type CreateStatus = "idle" | "submitting" | "confirming" | "success" | "error";

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
    const redirectValue = domain.data.find((d) => d.key === "web:redirect_url")?.value;
    const redirect = typeof redirectValue === "string" ? redirectValue : null;

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
                {redirect && (
                    <div
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.6rem",
                            color: "var(--fg-3)",
                            letterSpacing: "0.02em",
                            marginTop: "0.15rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        → {redirect}
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
                Manage ↗
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
    const [redirectUrl, setRedirectUrl] = useState("");
    const [status, setStatus] = useState<CreateStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    const validation = childLabel ? validateLabel(childLabel) : null;
    const isIdle = status === "idle";
    const canSubmit =
        isIdle &&
        client &&
        childLabel.length >= 3 &&
        validation?.valid === true;

    function handleProjectSelect(e: React.ChangeEvent<HTMLSelectElement>) {
        const idx = parseInt(e.target.value, 10);
        if (isNaN(idx) || idx < 0) return;
        const project = projects[idx];
        if (!project) return;
        const slug = slugify(project.name);
        if (slug.length >= 3) setChildLabel(slug);
        if (project.url) setRedirectUrl(project.url);
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
                redirectUrl || undefined,
            );
            setTxHash(hash);
            setStatus("success");
            setChildLabel("");
            setRedirectUrl("");
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
                        <select
                            id={`project-${parentLabel}`}
                            onChange={handleProjectSelect}
                            defaultValue=""
                            style={{
                                width: "100%",
                                fontFamily: "var(--font)",
                                fontSize: "0.7rem",
                                padding: "0.5rem 0.75rem",
                                background: "var(--bg-2)",
                                color: "var(--fg)",
                                border: "1px solid var(--border-2)",
                                cursor: "pointer",
                            }}
                        >
                            <option value="" disabled>
                                — Select a project —
                            </option>
                            {projects.map((p, i) => (
                                <option key={i} value={i}>
                                    {p.name}
                                    {p.url ? ` (${p.url})` : ""}
                                </option>
                            ))}
                        </select>
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

                {/* Redirect URL input */}
                <div>
                    <label
                        htmlFor={`redirect-${parentLabel}`}
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
                        Redirect URL{" "}
                        <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                        id={`redirect-${parentLabel}`}
                        type="url"
                        value={redirectUrl}
                        onChange={(e) => setRedirectUrl(e.target.value)}
                        placeholder="https://myproject.com"
                        autoComplete="off"
                        style={{
                            width: "100%",
                            fontFamily: "var(--font)",
                            fontSize: "0.7rem",
                            padding: "0.5rem 0.75rem",
                            background: "var(--bg-2)",
                            color: "var(--fg)",
                            border: "1px solid var(--border-2)",
                        }}
                    />
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
                    {status === "submitting" ? "Submitting…" : "Create subdomain"}
                </button>
            </div>
        </form>
    );
}

interface SubdomainManagerProps {
    domain: SubdomainRecord;
}

export default function SubdomainManager({ domain }: SubdomainManagerProps) {
    const [children, setChildren] = useState<SubdomainRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    const parentLabel = domain.name.split(".")[0];

    const fetchChildren = useCallback(async () => {
        setLoading(true);
        try {
            const results = await getSubSubdomains(domain.name);
            setChildren(results);
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
    onPin: (childLabel: string, redirectUrl?: string) => void;
}) {
    const slug = slugify(project.name);
    if (slug.length < 3) return null;

    return (
        <button
            onClick={() => onPin(slug, project.url)}
            className="btn btn-ghost btn-sm"
            title={`Create ${slug}.${parentName}`}
            aria-label={`Pin ${project.name} as ${slug}.${parentName}`}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.55rem" }}
        >
            📌
        </button>
    );
}
