import config from "../config/tezos";

const BASE_URL = `https://hack.tez`;

interface EndpointDoc {
    method: "GET";
    path: string;
    description: string;
    params: Array<{ name: string; type: string; description: string; kind?: "path" | "query" }>;
    example: { request: string; response: string };
}

const ENDPOINTS: EndpointDoc[] = [
    {
        method: "GET",
        path: "/api/domains",
        description:
            "Paginated list of all hack.tez registrations, ordered by most recent first. Backed by on-chain transaction history so includes registration timestamp and operation hash.",
        params: [
            { name: "limit", type: "integer", kind: "query", description: "Number of results to return. Default: 50. Max: 200." },
            { name: "offset", type: "integer", kind: "query", description: "Number of results to skip for pagination. Default: 0." },
        ],
        example: {
            request: `GET ${BASE_URL}/api/domains?limit=3&offset=0`,
            response: JSON.stringify(
                {
                    data: [
                        {
                            name: "skllz.hack.tez",
                            label: "skllz",
                            owner: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
                            registeredAt: "2025-03-27T08:01:29Z",
                            opHash: "opWhatever...",
                        },
                    ],
                    count: 1,
                    limit: 3,
                    offset: 0,
                    network: "mainnet",
                },
                null,
                2,
            ),
        },
    },
    {
        method: "GET",
        path: "/api/domain/:name",
        description:
            "Fetch full domain record for a hack.tez subdomain. Accepts either the bare label (e.g. alice) or the full name (e.g. alice.hack.tez). Returns null data with available: true if the domain doesn't exist yet.",
        params: [
            {
                name: "name",
                type: "string",
                description: "Label (e.g. alice) or full domain name (e.g. alice.hack.tez / alice.hack.gho)",
            },
        ],
        example: {
            request: `GET ${BASE_URL}/api/domain/alice`,
            response: JSON.stringify(
                {
                    data: {
                        name: "alice.hack.tez",
                        label: "alice",
                        address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                        owner: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                        expiresAt: null,
                    },
                    available: false,
                    network: "mainnet",
                },
                null,
                2,
            ),
        },
    },
    {
        method: "GET",
        path: "/api/availability/:label",
        description:
            "Check whether a label is available to register on hack.tez. Does not validate whether the label passes local rules (min length, reserved names) — it purely checks if a TED record exists.",
        params: [{ name: "label", type: "string", description: "The bare subdomain label to check (e.g. alice)" }],
        example: {
            request: `GET ${BASE_URL}/api/availability/alice`,
            response: JSON.stringify({ label: "alice", available: false, network: "mainnet" }, null, 2),
        },
    },
    {
        method: "GET",
        path: "/api/owner/:address",
        description: "List all hack.tez subdomains owned by a Tezos wallet address.",
        params: [{ name: "address", type: "tz1… / KT1…", description: "The Tezos wallet or contract address" }],
        example: {
            request: `GET ${BASE_URL}/api/owner/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb`,
            response: JSON.stringify(
                {
                    data: [
                        {
                            name: "alice.hack.tez",
                            label: "alice",
                            address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                            owner: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                            expiresAt: null,
                        },
                    ],
                    count: 1,
                    network: "mainnet",
                },
                null,
                2,
            ),
        },
    },
    {
        method: "GET",
        path: "/api/resolve/:address",
        description:
            "Reverse-resolve a Tezos address to its best domain name. Checks for a hack.tez subdomain first (preferred), then falls back to the TED reverse record. Returns null for both if no domain is found.",
        params: [{ name: "address", type: "tz1… / KT1…", description: "The Tezos wallet or contract address" }],
        example: {
            request: `GET ${BASE_URL}/api/resolve/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb`,
            response: JSON.stringify(
                {
                    address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                    primary: "alice.hack.tez",
                    hackTez: "alice.hack.tez",
                    tezos: "alice.tez",
                    network: "mainnet",
                },
                null,
                2,
            ),
        },
    },
    {
        method: "GET",
        path: "/api/config",
        description:
            "Fetch current contract configuration: commit-reveal timing, max registrations per wallet, and whether registration is paused.",
        params: [],
        example: {
            request: `GET ${BASE_URL}/api/config`,
            response: JSON.stringify(
                {
                    data: {
                        minCommitAgeSec: 30,
                        maxCommitAgeSec: 86400,
                        maxPerWallet: 1,
                        paused: false,
                        registrarAddress: "KT1...",
                    },
                    network: "mainnet",
                },
                null,
                2,
            ),
        },
    },
];

function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
    return (
        <pre
            aria-label={`${lang} code block`}
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
            }}
        >
            <code>{code}</code>
        </pre>
    );
}

function EndpointCard({ ep }: { ep: EndpointDoc }) {
    const anchor = ep.path.replace(/[/:*]/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-");
    return (
        <div
            id={anchor}
            style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "2.5rem",
                marginTop: "2.5rem",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                    flexWrap: "wrap",
                }}
            >
                <span
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        color: "var(--ok)",
                        background: "color-mix(in srgb, var(--ok) 12%, transparent)",
                        padding: "0.25rem 0.5rem",
                        border: "1px solid color-mix(in srgb, var(--ok) 30%, transparent)",
                    }}
                >
                    {ep.method}
                </span>
                <code
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: "var(--fg)",
                        letterSpacing: "0.04em",
                    }}
                >
                    {ep.path}
                </code>
            </div>

            <p
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "0.8rem",
                    color: "var(--fg-2)",
                    lineHeight: 1.8,
                    marginBottom: ep.params.length ? "1.25rem" : "1.5rem",
                    maxWidth: "600px",
                }}
            >
                {ep.description}
            </p>

            {ep.params.length > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                    <p
                        style={{
                            fontFamily: "var(--font)",
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            color: "var(--fg-3)",
                            textTransform: "uppercase",
                            marginBottom: "0.5rem",
                        }}
                    >
                        {ep.params.every((p) => p.kind === "query") ? "Query Parameters" : ep.params.some((p) => p.kind === "query") ? "Parameters" : "Path Parameters"}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {ep.params.map((p) => (
                            <div
                                key={p.name}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "auto auto 1fr",
                                    gap: "0.75rem",
                                    alignItems: "baseline",
                                    fontFamily: "var(--font)",
                                    fontSize: "0.72rem",
                                }}
                            >
                                <code style={{ color: "var(--fg)", fontWeight: 700 }}>{p.kind === "query" ? `?${p.name}` : `:${p.name}`}</code>
                                <span style={{ color: "var(--fg-3)", fontStyle: "italic" }}>{p.type}</span>
                                <span style={{ color: "var(--fg-2)" }}>{p.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "var(--fg-3)",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem",
                }}
            >
                Example
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <CodeBlock code={ep.example.request} lang="http" />
                <CodeBlock code={ep.example.response} lang="json" />
            </div>
        </div>
    );
}

export default function Developers() {
    const network = config.name;
    const tld = config.tld;

    return (
        <div className="container" style={{ maxWidth: "760px", paddingBlock: "4rem 6rem" }}>
            <p className="section-label" style={{ marginBottom: "0.75rem" }}>
                API Reference
            </p>

            <h1
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "clamp(2rem, 6vw, 3rem)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    lineHeight: 1.1,
                    marginBottom: "1.5rem",
                    color: "var(--fg)",
                }}
            >
                Build on hack.{tld}
            </h1>

            <p
                style={{
                    fontFamily: "var(--font)",
                    fontSize: "0.85rem",
                    color: "var(--fg-2)",
                    lineHeight: 1.9,
                    marginBottom: "2.5rem",
                    maxWidth: "600px",
                }}
            >
                Public REST API. No key. No auth. Just HTTP. Query subdomain ownership, availability, and contract
                config for hack.{tld} programmatically.
            </p>

            {/* Network badge */}
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontFamily: "var(--font)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.08em",
                    color: "var(--fg-3)",
                    border: "1px solid var(--border)",
                    padding: "0.35rem 0.75rem",
                    marginBottom: "3rem",
                }}
            >
                <span
                    style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: network === "mainnet" ? "var(--ok)" : "var(--warn, #f59e0b)",
                        display: "inline-block",
                        flexShrink: 0,
                    }}
                />
                NETWORK: {network.toUpperCase()} — .{tld.toUpperCase()} TLD
            </div>

            {/* Base URL */}
            <section aria-labelledby="base-url-heading" style={{ marginBottom: "3rem" }}>
                <h2
                    id="base-url-heading"
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        marginBottom: "0.75rem",
                    }}
                >
                    Base URL
                </h2>
                <CodeBlock code="https://hack.tez" lang="url" />
            </section>

            {/* Conventions */}
            <section aria-labelledby="conventions-heading" style={{ marginBottom: "3rem" }}>
                <h2
                    id="conventions-heading"
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        marginBottom: "1rem",
                    }}
                >
                    Conventions
                </h2>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                        fontFamily: "var(--font)",
                        fontSize: "0.78rem",
                        color: "var(--fg-2)",
                        lineHeight: 1.7,
                    }}
                >
                    <p>
                        All responses are JSON. Successful responses include a{" "}
                        <code style={{ color: "var(--fg)" }}>data</code> field and a{" "}
                        <code style={{ color: "var(--fg)" }}>network</code> string.
                    </p>
                    <p>
                        Errors return <code style={{ color: "var(--fg)" }}>{'{ "error": "...", "code": "..." }'}</code>{" "}
                        with a non-200 HTTP status.
                    </p>
                    <p>
                        Responses are CDN-cached at the edge (
                        <code style={{ color: "var(--fg)" }}>s-maxage=30–60s</code>). Data reflects on-chain state with
                        a short delay.
                    </p>
                    <p>
                        CORS: <code style={{ color: "var(--fg)" }}>Access-Control-Allow-Origin: *</code> — safe to call
                        from any browser or server.
                    </p>
                </div>
            </section>

            {/* Rate limits */}
            <section aria-labelledby="rate-limits-heading" style={{ marginBottom: "3rem" }}>
                <h2
                    id="rate-limits-heading"
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        marginBottom: "1rem",
                    }}
                >
                    Rate Limits
                </h2>
                <div
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.78rem",
                        color: "var(--fg-2)",
                        lineHeight: 1.8,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                    }}
                >
                    <p>
                        No API key required. This API runs on Netlify's free tier (125k function invocations/month).
                        Edge CDN caching means most requests never hit a function.
                    </p>
                    <p>
                        Please be a good citizen. Don't poll faster than the cache TTL (30–60 seconds). If you're
                        building something high-volume, consider querying{" "}
                        <a
                            href="https://tezos.domains"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg)" }}
                        >
                            Tezos Domains
                        </a>{" "}
                        or{" "}
                        <a
                            href="https://tzkt.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg)" }}
                        >
                            TzKT
                        </a>{" "}
                        directly.
                    </p>
                </div>
            </section>

            {/* Error codes */}
            <section aria-labelledby="errors-heading" style={{ marginBottom: "3rem" }}>
                <h2
                    id="errors-heading"
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        marginBottom: "1rem",
                    }}
                >
                    Error Codes
                </h2>
                <div style={{ overflowX: "auto" }}>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontFamily: "var(--font)",
                            fontSize: "0.72rem",
                        }}
                    >
                        <caption className="sr-only">API error codes</caption>
                        <thead>
                            <tr style={{ borderBottom: "1px solid var(--border-2)" }}>
                                {["code", "http status", "description"].map((h) => (
                                    <th
                                        key={h}
                                        scope="col"
                                        style={{
                                            textAlign: "left",
                                            padding: "0.4rem 0.75rem 0.6rem 0",
                                            color: "var(--fg-3)",
                                            fontWeight: 700,
                                            letterSpacing: "0.1em",
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ["INVALID_INPUT", "400", "Bad path parameter (invalid label, bad address format)"],
                                ["NOT_FOUND", "404", "Resource doesn't exist"],
                                ["METHOD_NOT_ALLOWED", "405", "Non-GET request"],
                                ["UPSTREAM_ERROR", "502 / 503", "TED GraphQL or TzKT unreachable"],
                            ].map(([code, status, desc]) => (
                                <tr key={code} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td style={{ padding: "0.55rem 0.75rem 0.55rem 0" }}>
                                        <code style={{ color: "var(--fg)", fontWeight: 700 }}>{code}</code>
                                    </td>
                                    <td style={{ padding: "0.55rem 0.75rem 0.55rem 0", color: "var(--fg-3)" }}>
                                        {status}
                                    </td>
                                    <td style={{ padding: "0.55rem 0 0.55rem 0", color: "var(--fg-2)" }}>{desc}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Endpoints */}
            <section aria-labelledby="endpoints-heading">
                <h2
                    id="endpoints-heading"
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        marginBottom: "0",
                    }}
                >
                    Endpoints
                </h2>
                {ENDPOINTS.map((ep) => (
                    <EndpointCard key={ep.path} ep={ep} />
                ))}
            </section>

            {/* Quick start */}
            <section
                aria-labelledby="quickstart-heading"
                style={{ marginTop: "4rem", borderTop: "1px solid var(--border)", paddingTop: "3rem" }}
            >
                <h2
                    id="quickstart-heading"
                    style={{
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        marginBottom: "1rem",
                    }}
                >
                    Quick Start
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <CodeBlock
                        lang="bash"
                        code={`# Check availability
curl https://hack.tez/api/availability/yourname

# Fetch domain record
curl https://hack.tez/api/domain/alice

# Domains owned by a wallet
curl https://hack.tez/api/owner/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb

# Reverse-resolve an address
curl https://hack.tez/api/resolve/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb`}
                    />
                    <CodeBlock
                        lang="javascript"
                        code={`// JavaScript / TypeScript
const res = await fetch('https://hack.tez/api/availability/yourname');
const { label, available, network } = await res.json();
console.log(available ? \`\${label} is free!\` : \`\${label} is taken.\`);`}
                    />
                </div>
            </section>

            {/* Source / issues */}
            <div
                style={{
                    marginTop: "4rem",
                    paddingTop: "2rem",
                    borderTop: "1px solid var(--border)",
                    fontFamily: "var(--font)",
                    fontSize: "0.72rem",
                    color: "var(--fg-3)",
                    lineHeight: 1.8,
                }}
            >
                Data proxied from{" "}
                <a
                    href="https://tezos.domains"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--fg)" }}
                >
                    Tezos Domains
                </a>{" "}
                and{" "}
                <a href="https://tzkt.io" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)" }}>
                    TzKT
                </a>
                . Source on{" "}
                <a
                    href="https://github.com/skullzarmy/hack-tez"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--fg)" }}
                >
                    GitHub
                </a>
                .
            </div>
        </div>
    );
}
