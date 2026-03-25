/**
 * Netlify Function: GET /api/get-redirect?subdomain=foo
 *
 * Returns the redirect URL for a given subdomain.
 */
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, _context: Context) => {
    const url = new URL(req.url);
    const subdomain = url.searchParams.get("subdomain");

    if (!subdomain) {
        return new Response(JSON.stringify({ error: "Missing subdomain parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const store = getStore({ name: "redirects", consistency: "strong" });
        const data = await store.get(subdomain.toLowerCase());

        if (!data) {
            return new Response(JSON.stringify({ redirectUrl: null }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const parsed = JSON.parse(data);
        return new Response(JSON.stringify({ redirectUrl: parsed.redirectUrl }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Get redirect error:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

export const config = {
    path: "/.netlify/functions/get-redirect",
};
