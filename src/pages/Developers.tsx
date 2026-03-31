import { useState, useEffect } from "react";
import config from "../config/tezos";

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------

interface NavSection {
    id: string;
    label: string;
    children?: Array<{ id: string; label: string }>;
}

const NAV: NavSection[] = [
    { id: "overview", label: "Overview" },
    { id: "base-url", label: "Base URL" },
    { id: "conventions", label: "Conventions" },
    { id: "rate-limits", label: "Rate Limits" },
    { id: "error-codes", label: "Error Codes" },
    {
        id: "endpoints",
        label: "Endpoints",
        children: [
            { id: "ep-domains", label: "GET /api/domains" },
            { id: "ep-domain", label: "GET /api/domain/:name" },
            { id: "ep-availability", label: "GET /api/availability/:label" },
            { id: "ep-owner", label: "GET /api/owner/:address" },
            { id: "ep-resolve", label: "GET /api/resolve/:address" },
            { id: "ep-config", label: "GET /api/config" },
        ],
    },
    { id: "quickstart", label: "Quick Start" },
    { id: "llm-skill", label: "LLM Skill" },
];

// Flat ordered list of all section IDs
const ALL_IDS = NAV.flatMap((s) => [s.id, ...(s.children?.map((c) => c.id) ?? [])]);

// ---------------------------------------------------------------------------
// Scroll-based active section tracker
// ---------------------------------------------------------------------------

const NAV_OFFSET = 80; // px below viewport top to consider a section "active"

function useActiveSection(): string {
    const [active, setActive] = useState<string>(ALL_IDS[0]);

    useEffect(() => {
        function update() {
            let current = ALL_IDS[0];
            for (const id of ALL_IDS) {
                const el = document.getElementById(id);
                if (!el) continue;
                const top = el.getBoundingClientRect().top;
                if (top <= NAV_OFFSET) {
                    current = id;
                } else {
                    break;
                }
            }
            setActive(current);
        }

        update(); // set correct state on mount
        window.addEventListener("scroll", update, { passive: true });
        return () => window.removeEventListener("scroll", update);
    }, []);

    return active;
}

// ---------------------------------------------------------------------------
// Utility components
// ---------------------------------------------------------------------------

function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
    return (
        <pre
            aria-label={`${lang} example`}
            style={{
                background: "var(--bg-2, #0a0a0a)",
                border: "1px solid var(--border)",
                padding: "1rem 1.25rem",
                overflowX: "auto",
                fontSize: "0.72rem",
                lineHeight: 1.7,
                margin: 0,
                color: "var(--fg-2)",
                fontFamily: "var(--font)",
                letterSpacing: "0.02em",
                borderRadius: 0,
            }}
        >
            <code>{code}</code>
        </pre>
    );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <h2
            id={id}
            style={{
                fontFamily: "var(--font)",
                fontSize: "0.65rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginBottom: "1rem",
                scrollMarginTop: `${NAV_OFFSET + 16}px`,
            }}
        >
            {children}
        </h2>
    );
}

function MethodBadge() {
    return (
        <span
            style={{
                fontFamily: "var(--font)",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--ok)",
                background: "color-mix(in srgb, var(--ok) 12%, transparent)",
                padding: "0.2rem 0.45rem",
                border: "1px solid color-mix(in srgb, var(--ok) 30%, transparent)",
                flexShrink: 0,
            }}
        >
            GET
        </span>
    );
}

function ParamTable({
    params,
}: {
    params: Array<{ name: string; kind: "path" | "query"; type: string; default?: string; description: string }>;
}) {
    return (
        <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontFamily: "var(--font)",
                    fontSize: "0.7rem",
                }}
            >
                <caption className="sr-only">Parameters</caption>
                <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-2)" }}>
                        {["param", "kind", "type", "default", "description"].map((h) => (
                            <th
                                key={h}
                                scope="col"
                                style={{
                                    textAlign: "left",
                                    padding: "0.3rem 0.75rem 0.45rem 0",
                                    color: "var(--fg-3)",
                                    fontWeight: 700,
                                    letterSpacing: "0.1em",
                                    fontSize: "0.58rem",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {params.map((p) => (
                        <tr key={p.name} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>
                                <code style={{ color: "var(--fg)", fontWeight: 700 }}>
                                    {p.kind === "query" ? `?${p.name}` : `:${p.name}`}
                                </code>
                            </td>
                            <td style={{ padding: "0.4rem 0.75rem 0.4rem 0", color: "var(--fg-3)" }}>{p.kind}</td>
                            <td style={{ padding: "0.4rem 0.75rem 0.4rem 0", color: "var(--fg-2)" }}>{p.type}</td>
                            <td style={{ padding: "0.4rem 0.75rem 0.4rem 0", color: "var(--fg-3)" }}>{p.default ?? "—"}</td>
                            <td style={{ padding: "0.4rem 0 0.4rem 0", color: "var(--fg-2)" }}>{p.description}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Divider() {
    return <div style={{ borderTop: "1px solid var(--border)", marginBottom: "2rem" }} />;
}

// ---------------------------------------------------------------------------
// Side nav
// ---------------------------------------------------------------------------

function SideNav({
    active,
    mobileOpen,
    onClose,
}: {
    active: string;
    mobileOpen: boolean;
    onClose: () => void;
}) {
    const isParentActive = (section: NavSection) =>
        section.id === active || (section.children?.some((c) => c.id === active) ?? false);

    return (
        <>
            {/* Mobile backdrop */}
            {mobileOpen && (
                <div
                    aria-hidden="true"
                    onClick={onClose}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "color-mix(in srgb, var(--bg) 75%, transparent)",
                        zIndex: 40,
                    }}
                />
            )}

            <aside
                aria-label="Page navigation"
                className={`docs-sidenav${mobileOpen ? " docs-sidenav--open" : ""}`}
            >
                <nav>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {NAV.map((section) => {
                            const parentActive = isParentActive(section);
                            return (
                                <li key={section.id} style={{ marginBottom: "0.1rem" }}>
                                    <a
                                        href={`#${section.id}`}
                                        onClick={onClose}
                                        style={{
                                            display: "block",
                                            fontFamily: "var(--font)",
                                            fontSize: "0.68rem",
                                            fontWeight: parentActive ? 700 : 400,
                                            letterSpacing: "0.04em",
                                            color: parentActive ? "var(--fg)" : "var(--fg-3)",
                                            textDecoration: "none",
                                            padding: "0.28rem 0 0.28rem 0.8rem",
                                            borderLeft: `2px solid ${parentActive ? "var(--ok)" : "var(--border)"}`,
                                            transition: "color 0.12s, border-color 0.12s",
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {section.label}
                                    </a>

                                    {section.children && (
                                        <ul style={{ listStyle: "none", padding: "0.1rem 0 0.1rem 0.8rem", margin: 0 }}>
                                            {section.children.map((child) => {
                                                const childActive = active === child.id;
                                                return (
                                                    <li key={child.id}>
                                                        <a
                                                            href={`#${child.id}`}
                                                            onClick={onClose}
                                                            style={{
                                                                display: "block",
                                                                fontFamily: "var(--font)",
                                                                fontSize: "0.61rem",
                                                                fontWeight: childActive ? 700 : 400,
                                                                letterSpacing: "0.025em",
                                                                color: childActive ? "var(--fg)" : "var(--fg-3)",
                                                                textDecoration: "none",
                                                                padding: "0.22rem 0 0.22rem 0.7rem",
                                                                borderLeft: `2px solid ${childActive ? "var(--ok)" : "transparent"}`,
                                                                transition: "color 0.12s, border-color 0.12s",
                                                                whiteSpace: "nowrap",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                            }}
                                                        >
                                                            {child.label}
                                                        </a>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </nav>
            </aside>
        </>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Developers() {
    const active = useActiveSection();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const tld = config.tld;
    const network = config.name;

    // Close mobile nav on hash change
    useEffect(() => {
        const handler = () => setMobileNavOpen(false);
        window.addEventListener("hashchange", handler);
        return () => window.removeEventListener("hashchange", handler);
    }, []);

    return (
        <>
            <style>{`
                /* Layout */
                .docs-layout {
                    display: flex;
                    align-items: flex-start;
                    gap: 3.5rem;
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 4rem 1.5rem 7rem;
                    box-sizing: border-box;
                }
                .docs-content {
                    flex: 1;
                    min-width: 0;
                }

                /* Side nav — desktop: sticky column */
                .docs-sidenav {
                    position: sticky;
                    top: 5.25rem;
                    width: 210px;
                    flex-shrink: 0;
                    max-height: calc(100vh - 6rem);
                    overflow-y: auto;
                    /* hide scrollbar visually */
                    scrollbar-width: none;
                }
                .docs-sidenav::-webkit-scrollbar { display: none; }

                /* Mobile: hidden by default, slide-in drawer when open */
                .docs-toc-btn { display: none; }

                @media (max-width: 860px) {
                    .docs-layout { gap: 0; padding: 3rem 1rem 5rem; }

                    .docs-sidenav {
                        position: fixed;
                        top: 0;
                        left: 0;
                        bottom: 0;
                        width: 260px;
                        max-height: none;
                        background: var(--bg);
                        border-right: 1px solid var(--border);
                        padding: 5rem 1.25rem 2rem;
                        z-index: 50;
                        overflow-y: auto;
                        transform: translateX(-100%);
                        transition: transform 0.2s ease;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.4);
                    }
                    .docs-sidenav--open {
                        transform: translateX(0);
                    }
                    .docs-toc-btn {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.4rem;
                        background: none;
                        border: 1px solid var(--border);
                        padding: 0.35rem 0.7rem;
                        font-family: var(--font);
                        font-size: 0.62rem;
                        letter-spacing: 0.08em;
                        color: var(--fg-3);
                        cursor: pointer;
                    }
                }
            `}</style>

            <div className="docs-layout">
                <SideNav
                    active={active}
                    mobileOpen={mobileNavOpen}
                    onClose={() => setMobileNavOpen(false)}
                />

                <div className="docs-content">
                    {/* ---- Header ---- */}
                    <div style={{ marginBottom: "3rem" }}>
                        <p className="section-label" style={{ marginBottom: "0.75rem" }}>
                            API Reference
                        </p>

                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                            <h1
                                id="overview"
                                style={{
                                    fontFamily: "var(--font)",
                                    fontSize: "clamp(1.8rem, 5vw, 2.75rem)",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    lineHeight: 1.1,
                                    color: "var(--fg)",
                                    scrollMarginTop: `${NAV_OFFSET + 16}px`,
                                    margin: 0,
                                }}
                            >
                                Build on hack.{tld}
                            </h1>

                            <button
                                className="docs-toc-btn"
                                onClick={() => setMobileNavOpen((o) => !o)}
                                aria-expanded={mobileNavOpen}
                                aria-label="Toggle table of contents"
                            >
                                ≡ CONTENTS
                            </button>
                        </div>

                        <p style={{ fontFamily: "var(--font)", fontSize: "0.82rem", color: "var(--fg-2)", lineHeight: 1.9, marginBottom: "1.5rem", maxWidth: "560px" }}>
                            Public REST API. No key. No auth. Just HTTP. Query subdomain ownership,
                            availability, and contract config for hack.{tld} programmatically.
                        </p>

                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontFamily: "var(--font)", fontSize: "0.62rem", letterSpacing: "0.08em", color: "var(--fg-3)", border: "1px solid var(--border)", padding: "0.3rem 0.65rem" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: network === "mainnet" ? "var(--ok)" : "var(--warn, #f59e0b)", display: "inline-block", flexShrink: 0 }} />
                            NETWORK: {network.toUpperCase()} — .{tld.toUpperCase()} TLD
                        </div>
                    </div>

                    {/* ---- Base URL ---- */}
                    <section style={{ marginBottom: "2.5rem" }}>
                        <SectionHeading id="base-url">Base URL</SectionHeading>
                        <CodeBlock code="https://hack.tez" lang="url" />
                    </section>

                    {/* ---- Conventions ---- */}
                    <section style={{ marginBottom: "2.5rem" }}>
                        <SectionHeading id="conventions">Conventions</SectionHeading>
                        <div style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.9, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                            <p>All responses are JSON. Success includes a <code style={{ color: "var(--fg)" }}>data</code> field and a <code style={{ color: "var(--fg)" }}>network</code> string.</p>
                            <p>Errors return <code style={{ color: "var(--fg)" }}>{"{ \"error\": \"...\", \"code\": \"...\" }"}</code> with a non-200 HTTP status.</p>
                            <p>Responses are CDN-cached at the edge (<code style={{ color: "var(--fg)" }}>s-maxage=30–60s</code>). Data reflects on-chain state with a short delay.</p>
                            <p>CORS: <code style={{ color: "var(--fg)" }}>Access-Control-Allow-Origin: *</code> — safe to call from any origin.</p>
                        </div>
                    </section>

                    {/* ---- Rate Limits ---- */}
                    <section style={{ marginBottom: "2.5rem" }}>
                        <SectionHeading id="rate-limits">Rate Limits</SectionHeading>
                        <div style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.9, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                            <p>
                                No API key required. Edge CDN caching means most requests are served without hitting a function — please don't poll faster than the cache TTL (30–60 seconds).
                            </p>
                            <p>
                                For high-volume use, query{" "}
                                <a href="https://tezos.domains" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)" }}>Tezos Domains</a>{" "}
                                or{" "}
                                <a href="https://tzkt.io" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)" }}>TzKT</a>{" "}
                                directly.
                            </p>
                        </div>
                    </section>

                    {/* ---- Error Codes ---- */}
                    <section style={{ marginBottom: "3rem" }}>
                        <SectionHeading id="error-codes">Error Codes</SectionHeading>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font)", fontSize: "0.72rem" }}>
                                <caption className="sr-only">API error codes</caption>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid var(--border-2)" }}>
                                        {["code", "http", "description"].map((h) => (
                                            <th key={h} scope="col" style={{ textAlign: "left", padding: "0.35rem 0.75rem 0.5rem 0", color: "var(--fg-3)", fontWeight: 700, letterSpacing: "0.1em", fontSize: "0.58rem", textTransform: "uppercase" }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ["INVALID_INPUT", "400", "Bad path param (invalid label or address format)"],
                                        ["NOT_FOUND", "404", "Resource doesn't exist"],
                                        ["METHOD_NOT_ALLOWED", "405", "Non-GET request"],
                                        ["UPSTREAM_ERROR", "502 / 503", "TED GraphQL or TzKT unreachable"],
                                    ].map(([code, status, desc]) => (
                                        <tr key={code} style={{ borderBottom: "1px solid var(--border)" }}>
                                            <td style={{ padding: "0.5rem 0.75rem 0.5rem 0" }}><code style={{ color: "var(--fg)", fontWeight: 700 }}>{code}</code></td>
                                            <td style={{ padding: "0.5rem 0.75rem 0.5rem 0", color: "var(--fg-3)" }}>{status}</td>
                                            <td style={{ padding: "0.5rem 0 0.5rem 0", color: "var(--fg-2)" }}>{desc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* ---- Endpoints heading ---- */}
                    <div style={{ marginBottom: "2rem" }}>
                        <h2 id="endpoints" style={{ fontFamily: "var(--font)", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-3)", scrollMarginTop: `${NAV_OFFSET + 16}px`, marginBottom: 0 }}>
                            Endpoints
                        </h2>
                    </div>

                    {/* ---- GET /api/domains ---- */}
                    <section style={{ marginBottom: "3rem" }}>
                        <Divider />
                        <div id="ep-domains" style={{ scrollMarginTop: `${NAV_OFFSET + 16}px` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                                <MethodBadge />
                                <code style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700, color: "var(--fg)" }}>/api/domains</code>
                            </div>
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.8, marginBottom: "1.25rem", maxWidth: "560px" }}>
                                Paginated list of all hack.{tld} registrations, newest first. Backed by on-chain transaction history — includes registration timestamp and op hash.
                            </p>
                            <ParamTable params={[
                                { name: "limit", kind: "query", type: "integer", default: "50", description: "Results per page (max 200)" },
                                { name: "offset", kind: "query", type: "integer", default: "0", description: "Skip N results for pagination" },
                            ]} />
                            <CodeBlock lang="http" code="GET https://hack.tez/api/domains?limit=3&offset=0" />
                            <div style={{ height: "0.5rem" }} />
                            <CodeBlock code={JSON.stringify({ data: [{ name: `alice.hack.${tld}`, label: "alice", owner: "tz1...", registeredAt: "2025-03-27T08:01:29Z", opHash: "oo..." }], count: 1, limit: 3, offset: 0, network }, null, 2)} />
                        </div>
                    </section>

                    {/* ---- GET /api/domain/:name ---- */}
                    <section style={{ marginBottom: "3rem" }}>
                        <Divider />
                        <div id="ep-domain" style={{ scrollMarginTop: `${NAV_OFFSET + 16}px` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                                <MethodBadge />
                                <code style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700, color: "var(--fg)" }}>/api/domain/:name</code>
                            </div>
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.8, marginBottom: "1.25rem", maxWidth: "560px" }}>
                                Full TED record for a subdomain. Accepts a bare label (<code style={{ color: "var(--fg)" }}>alice</code>) or the full name (<code style={{ color: "var(--fg)" }}>alice.hack.{tld}</code>). Returns <code style={{ color: "var(--fg)" }}>data: null</code> with <code style={{ color: "var(--fg)" }}>available: true</code> if unclaimed.
                            </p>
                            <ParamTable params={[
                                { name: "name", kind: "path", type: "string", description: `Label (alice) or full name (alice.hack.${tld})` },
                            ]} />
                            <CodeBlock lang="http" code="GET https://hack.tez/api/domain/alice" />
                            <div style={{ height: "0.5rem" }} />
                            <CodeBlock code={JSON.stringify({ data: { name: `alice.hack.${tld}`, label: "alice", address: "tz1...", owner: "tz1...", expiresAt: null }, available: false, network }, null, 2)} />
                        </div>
                    </section>

                    {/* ---- GET /api/availability/:label ---- */}
                    <section style={{ marginBottom: "3rem" }}>
                        <Divider />
                        <div id="ep-availability" style={{ scrollMarginTop: `${NAV_OFFSET + 16}px` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                                <MethodBadge />
                                <code style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700, color: "var(--fg)" }}>/api/availability/:label</code>
                            </div>
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.8, marginBottom: "1.25rem", maxWidth: "560px" }}>
                                Lightweight availability check — faster than <code style={{ color: "var(--fg)" }}>/api/domain</code> when you only need the boolean. Returns 400 if the label fails format validation.
                            </p>
                            <ParamTable params={[
                                { name: "label", kind: "path", type: "string", description: "Bare label (3–63 chars, lowercase alphanumeric + hyphens)" },
                            ]} />
                            <CodeBlock lang="http" code="GET https://hack.tez/api/availability/alice" />
                            <div style={{ height: "0.5rem" }} />
                            <CodeBlock code={JSON.stringify({ label: "alice", available: false, network }, null, 2)} />
                        </div>
                    </section>

                    {/* ---- GET /api/owner/:address ---- */}
                    <section style={{ marginBottom: "3rem" }}>
                        <Divider />
                        <div id="ep-owner" style={{ scrollMarginTop: `${NAV_OFFSET + 16}px` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                                <MethodBadge />
                                <code style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700, color: "var(--fg)" }}>/api/owner/:address</code>
                            </div>
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.8, marginBottom: "1.25rem", maxWidth: "560px" }}>
                                All hack.{tld} subdomains owned by a wallet. Returns an empty array (not 404) if the address owns none.
                            </p>
                            <ParamTable params={[
                                { name: "address", kind: "path", type: "tz1… / KT1…", description: "Tezos wallet or contract address" },
                            ]} />
                            <CodeBlock lang="http" code="GET https://hack.tez/api/owner/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" />
                            <div style={{ height: "0.5rem" }} />
                            <CodeBlock code={JSON.stringify({ data: [{ name: `alice.hack.${tld}`, label: "alice", address: "tz1...", owner: "tz1...", expiresAt: null }], count: 1, network }, null, 2)} />
                        </div>
                    </section>

                    {/* ---- GET /api/resolve/:address ---- */}
                    <section style={{ marginBottom: "3rem" }}>
                        <Divider />
                        <div id="ep-resolve" style={{ scrollMarginTop: `${NAV_OFFSET + 16}px` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                                <MethodBadge />
                                <code style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700, color: "var(--fg)" }}>/api/resolve/:address</code>
                            </div>
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.8, marginBottom: "1.25rem", maxWidth: "560px" }}>
                                Reverse-resolve a wallet to its primary domain and all owned hack.{tld} subdomains. <code style={{ color: "var(--fg)" }}>primary</code> is the TED reverse record if set, otherwise the first owned hack.{tld} subdomain, otherwise null. <code style={{ color: "var(--fg)" }}>hackTez</code> is an array of all hack.{tld} subdomains currently owned by the address (they're NFTs and transferable).
                            </p>
                            <ParamTable params={[
                                { name: "address", kind: "path", type: "tz1… / KT1…", description: "Tezos wallet or contract address" },
                            ]} />
                            <CodeBlock lang="http" code="GET https://hack.tez/api/resolve/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" />
                            <div style={{ height: "0.5rem" }} />
                            <CodeBlock code={JSON.stringify({ address: "tz1...", primary: "alice.tez", hackTez: [`alice.hack.${tld}`, `builder.hack.${tld}`], network }, null, 2)} />
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.7rem", color: "var(--fg-3)", marginTop: "0.75rem", lineHeight: 1.8 }}>
                                <code style={{ color: "var(--fg)" }}>primary</code> — TED reverse record if set, else first owned hack.{tld} subdomain, else null<br />
                                <code style={{ color: "var(--fg)" }}>hackTez</code> — array of all hack.{tld} subdomains currently owned by this address
                            </p>
                        </div>
                    </section>

                    {/* ---- GET /api/config ---- */}
                    <section style={{ marginBottom: "3rem" }}>
                        <Divider />
                        <div id="ep-config" style={{ scrollMarginTop: `${NAV_OFFSET + 16}px` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                                <MethodBadge />
                                <code style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700, color: "var(--fg)" }}>/api/config</code>
                            </div>
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.8, marginBottom: "1.25rem", maxWidth: "560px" }}>
                                Current contract configuration. Check before starting a registration flow to get commit timing and verify registration is not paused.
                            </p>
                            <CodeBlock lang="http" code="GET https://hack.tez/api/config" />
                            <div style={{ height: "0.5rem" }} />
                            <CodeBlock code={JSON.stringify({ data: { minCommitAgeSec: 30, maxCommitAgeSec: 86400, maxPerWallet: 1, paused: false, registrarAddress: "KT1..." }, network }, null, 2)} />
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.7rem", color: "var(--fg-3)", marginTop: "0.75rem", lineHeight: 1.8 }}>
                                <code style={{ color: "var(--fg)" }}>minCommitAgeSec</code> — wait at least this long between commit and register<br />
                                <code style={{ color: "var(--fg)" }}>maxCommitAgeSec</code> — commit expires after this; must re-commit<br />
                                <code style={{ color: "var(--fg)" }}>paused</code> — if true, on-chain registration is disabled
                            </p>
                        </div>
                    </section>

                    {/* ---- Quick Start ---- */}
                    <section>
                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "2.5rem" }}>
                            <SectionHeading id="quickstart">Quick Start</SectionHeading>
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                <CodeBlock lang="bash" code={`# Check availability
curl https://hack.tez/api/availability/yourname

# Fetch domain record
curl https://hack.tez/api/domain/alice

# Domains owned by a wallet
curl https://hack.tez/api/owner/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb

# Reverse-resolve an address
curl https://hack.tez/api/resolve/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb`} />
                                <CodeBlock lang="javascript" code={`// JavaScript / TypeScript
const { available } = await fetch('https://hack.tez/api/availability/yourname')
  .then(r => r.json());

// Resolve address for display
async function getDisplayName(address) {
  const { primary, hackTez } = await fetch(\`https://hack.tez/api/resolve/\${address}\`)
    .then(r => r.json());
  return primary ?? hackTez[0] ?? \`\${address.slice(0,6)}…\${address.slice(-4)}\`;
}`} />
                            </div>
                        </div>
                    </section>

                    {/* ---- LLM Skill ---- */}
                    <section style={{ marginTop: "3rem" }}>
                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "2.5rem" }}>
                            <SectionHeading id="llm-skill">LLM Skill</SectionHeading>
                            <p style={{ fontFamily: "var(--font)", fontSize: "0.78rem", color: "var(--fg-2)", lineHeight: 1.9, marginBottom: "1.25rem", maxWidth: "560px" }}>
                                Building an AI agent or LLM-powered tool that interacts with hack.tez? Drop the skill reference into your context window — it documents the full API, contract addresses, commit-reveal flow, and TypeScript patterns in a single compact file.
                            </p>
                            <a
                                href="/hack-tez-api.md"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    fontFamily: "var(--font)",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    color: "var(--fg)",
                                    border: "1px solid var(--border)",
                                    padding: "0.5rem 1rem",
                                    textDecoration: "none",
                                    transition: "border-color 0.15s",
                                }}
                                onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--fg)")}
                                onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)")}
                            >
                                hack-tez-api.md
                            </a>
                        </div>
                    </section>

                    {/* Footer */}
                    <div style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid var(--border)", fontFamily: "var(--font)", fontSize: "0.7rem", color: "var(--fg-3)", lineHeight: 1.8 }}>
                        Data proxied from{" "}
                        <a href="https://tezos.domains" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)" }}>Tezos Domains</a>{" "}
                        and{" "}
                        <a href="https://tzkt.io" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)" }}>TzKT</a>.
                        Source on{" "}
                        <a href="https://github.com/skullzarmy/hack-tez" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)" }}>GitHub</a>.
                    </div>
                </div>
            </div>
        </>
    );
}
