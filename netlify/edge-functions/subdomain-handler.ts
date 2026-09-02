/**
 * Handles *.hacktez.com subdomain requests:
 *   GET alice.hacktez.com/.well-known/atproto-did  → plain-text DID (AT Protocol handle verification)
 *   GET alice.hacktez.com/*                         → 301 to hacktez.com/u/alice
 *
 * For all other hosts (hacktez.com, www.hacktez.com, etc.) passes through unchanged.
 */

const LABEL_RE = /^([a-z0-9][a-z0-9-]{0,61}[a-z0-9]?)\.hacktez\.com$/i;

export default async function handler(
    request: Request,
    context: { next(): Promise<Response> },
): Promise<Response | undefined> {
    const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
    const match = LABEL_RE.exec(host);
    if (!match) return context.next();

    const label = match[1];
    const { pathname } = new URL(request.url);

    if (pathname === "/.well-known/atproto-did") {
        const did = await lookupDid(label);
        if (!did) return new Response("Not found", { status: 404 });
        return new Response(did, {
            headers: {
                "content-type": "text/plain; charset=utf-8",
                "cache-control": "public, max-age=300",
                "access-control-allow-origin": "*",
            },
        });
    }

    return Response.redirect(
        `https://hacktez.com/u/${encodeURIComponent(label)}`,
        301,
    );
}

async function lookupDid(label: string): Promise<string | null> {
    try {
        const res = await fetch(
            `https://hacktez.com/api/v1/bluesky/${encodeURIComponent(label)}`,
        );
        if (!res.ok) return null;
        const body = (await res.json()) as {
            data?: { linked: boolean; did?: string };
        };
        return body.data?.did ?? null;
    } catch {
        return null;
    }
}

export const config = {
    path: "/*",
};
