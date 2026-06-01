/**
 * Labs — gated release downloads from Netlify Blobs.
 *
 * Store layout: `labs-releases` blob store. Keys are `<slug>/<filename>`.
 * Slug is the lab's frontmatter slug (e.g. "cloudnine"); filename is the
 * release artifact (e.g. "cloudnine-v0.4.0.zip"). One store reusable for any
 * future fafolab release (extension, CLI, app, etc.).
 *
 * Auth: requires a valid hack.tez session JWT. We rely on Authorization
 * headers, so the frontend fetches via `authedFetch` and triggers the
 * download client-side off a Blob URL (no JWT in query strings).
 */
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { verifyJwt } from "./wiki-db.mts";

const STORE_NAME = "labs-releases";

function labsBlobStore() {
    return getStore({ name: STORE_NAME, consistency: "strong" });
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FILE_RE = /^[A-Za-z0-9._-]{1,120}$/;

interface DownloadBody {
    slug?: string;
    file?: string;
}

async function handleDownload(req: Request): Promise<Response> {
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    const user = await verifyJwt(req);
    if (!user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    let body: DownloadBody;
    try {
        body = (await req.json()) as DownloadBody;
    } catch {
        return new Response(JSON.stringify({ error: "invalid body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const slug = (body.slug ?? "").toLowerCase();
    const file = body.file ?? "";
    if (!SLUG_RE.test(slug) || !FILE_RE.test(file)) {
        return new Response(JSON.stringify({ error: "invalid input" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const key = `${slug}/${file}`;
    const store = labsBlobStore();
    const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!blob) {
        return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    const meta = (blob.metadata ?? {}) as { contentType?: string };
    return new Response(blob.data, {
        status: 200,
        headers: {
            "Content-Type": meta.contentType || "application/zip",
            "Content-Disposition": `attachment; filename="${file}"`,
            "Cache-Control": "private, no-store",
        },
    });
}

export default async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/labs/download") return handleDownload(req);
    return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
    });
}

export const config: Config = {
    path: "/api/labs/*",
};
