/**
 * Static page-meta map used by scripts/prerender.ts.
 *
 * Kept as plain JSON-ish data so it can be consumed from Node (build) without
 * pulling in React or Vite-only modules. Skill detail pages derive their meta
 * from the markdown frontmatter at build time.
 */
export interface StaticRouteMeta {
    title: string;
    description: string;
    image?: string;
}

export const STATIC_ROUTE_META: Record<string, StaticRouteMeta> = {
    "/manifesto": {
        title: "Manifesto — hack.tez",
        description:
            "HEN mattered because nobody asked permission. The hack.tez manifesto: free Tezos subdomains for hackers, builders, artists, and tezonians.",
    },
    "/policies": {
        title: "Policies — hack.tez",
        description:
            "Privacy policy and terms for hack.tez. Plain english. No bullshit. We don't sell your data — there's no data to sell.",
    },
    "/developers": {
        title: "Docs — REST API & SDK — hack.tez",
        description:
            "Public REST API for hack.tez. Resolve domains, list hackers, fetch profiles, generate hackatars. JSON over HTTPS. No auth required for read endpoints.",
    },
    "/skills": {
        title: "Skills — LLM-ready Tezos reference docs — hack.tez",
        description:
            "Markdown reference docs for the hack.tez stack: SmartPy, Taquito, Tezos Domains, Beacon SDK, octez.connect, and the hack.tez API. Drop into Cursor, Claude, or your AI editor.",
    },
    "/arcade": {
        title: "Hackcade — hack.tez Arcade",
        description:
            "Build it. Ship it. Play it. Community-built HTML games with hack.tez identity and on-chain leaderboards.",
    },
};
