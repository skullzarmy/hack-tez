import type { Config } from "@netlify/functions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ProfileApiResponse {
    data?: {
        name: string;
        profile: {
            name?: string;
            nickname?: string;
            bio?: string;
            status?: string;
        };
    };
}

function toProfileLabel(raw: string, tld: "tez" | "gho"): string {
    const value = raw.trim().toLowerCase();
    const suffix = `.hack.${tld}`;
    if (value.endsWith(suffix)) return value.slice(0, -suffix.length);
    return value;
}

let cachedTemplate: string | null = null;

function loadTemplate(reqUrl: URL): string {
    if (cachedTemplate) return cachedTemplate;

    const isLocalHost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const isNetlifyDev = process.env.NETLIFY_DEV === "true";
    const distTemplate = resolve(process.cwd(), "dist/index.html");
    const devTemplate = resolve(process.cwd(), "index.html");

    // In local dev we do not cache template content here. We fetch Vite-transformed
    // HTML from '/' at request time so React refresh preamble is present.
    if (isLocalHost || isNetlifyDev) {
        return "";
    }

    try {
        cachedTemplate = readFileSync(distTemplate, "utf8");
        return cachedTemplate;
    } catch {
        cachedTemplate = readFileSync(devTemplate, "utf8");
        return cachedTemplate;
    }
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function replaceTag(html: string, pattern: RegExp, replacement: string): string {
    return html.replace(pattern, replacement);
}

function setMetadata(html: string, values: { title: string; description: string; url: string; image: string }): string {
    let next = html;
    next = replaceTag(next, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(values.title)}</title>`);
    next = replaceTag(
        next,
        /<meta name="description" content="[^"]*" \/>/,
        `<meta name="description" content="${escapeHtml(values.description)}" />`,
    );
    next = replaceTag(next, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${values.url}" />`);
    next = replaceTag(
        next,
        /<meta property="og:url" content="[^"]*" \/>/,
        `<meta property="og:url" content="${values.url}" />`,
    );
    next = replaceTag(
        next,
        /<meta property="og:title" content="[^"]*" \/>/,
        `<meta property="og:title" content="${escapeHtml(values.title)}" />`,
    );
    next = replaceTag(
        next,
        /<meta property="og:description" content="[^"]*" \/>/,
        `<meta property="og:description" content="${escapeHtml(values.description)}" />`,
    );
    next = replaceTag(
        next,
        /<meta property="og:image" content="[^"]*" \/>/,
        `<meta property="og:image" content="${values.image}" />`,
    );
    next = replaceTag(
        next,
        /<meta name="twitter:url" content="[^"]*" \/>/,
        `<meta name="twitter:url" content="${values.url}" />`,
    );
    next = replaceTag(
        next,
        /<meta name="twitter:title" content="[^"]*" \/>/,
        `<meta name="twitter:title" content="${escapeHtml(values.title)}" />`,
    );
    next = replaceTag(
        next,
        /<meta name="twitter:description" content="[^"]*" \/>/,
        `<meta name="twitter:description" content="${escapeHtml(values.description)}" />`,
    );
    next = replaceTag(
        next,
        /<meta name="twitter:image" content="[^"]*" \/>/,
        `<meta name="twitter:image" content="${values.image}" />`,
    );
    return next;
}

export default async function handler(
    req: Request,
    context: { params?: Record<string, string | undefined> },
): Promise<Response> {
    const reqUrl = new URL(req.url);
    const isLocalHost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const isNetlifyDev = process.env.NETLIFY_DEV === "true";
    if (isLocalHost || isNetlifyDev) {
        try {
            const devHtml = await fetch(`${reqUrl.origin}/`);
            const body = await devHtml.text();
            return new Response(body, {
                status: devHtml.status,
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            });
        } catch {
            return new Response(readFileSync(resolve(process.cwd(), "index.html"), "utf8"), {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            });
        }
    }

    const tld = (process.env.VITE_TEZOS_NETWORK ?? "ghostnet") === "mainnet" ? "tez" : "gho";
    const rawSubdomain = context.params?.subdomain?.trim().toLowerCase();
    const label = rawSubdomain ? toProfileLabel(rawSubdomain, tld) : "";
    const template = loadTemplate(reqUrl);
    if (!label) {
        return new Response(template, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const url = reqUrl;
    const profileUrl = `${url.origin}/u/${encodeURIComponent(label)}`;
    const imageUrl = `${url.origin}/api/v1/share-card/${encodeURIComponent(label)}`;

    try {
        const response = await fetch(`${url.origin}/api/v1/profile/${encodeURIComponent(label)}`);
        if (!response.ok) {
            return new Response(template, {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "public, max-age=60, s-maxage=120",
                },
            });
        }
        const payload = (await response.json()) as ProfileApiResponse;
        const fullName = payload.data?.name ?? `${label}.hack.${tld}`;
        const displayName = payload.data?.profile.name || payload.data?.profile.nickname || fullName;
        const bio = payload.data?.profile.bio?.trim() || `Own ${fullName} on Tezos.`;
        const title = `${displayName} | hack.${tld}`;
        const html = setMetadata(template, {
            title,
            description: bio,
            url: profileUrl,
            image: imageUrl,
        });
        return new Response(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400",
            },
        });
    } catch {
        return new Response(template, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=60, s-maxage=120",
            },
        });
    }
}

export const config: Config = {
    path: "/u/:subdomain",
};
