/**
 * Hackcade — serves game bundle files from Netlify Blobs.
 *
 * URL shape: `/arcade-files/<gameId>/v<version>/<path>`
 *   - <gameId>: the arcade_games.id (nanoid).
 *   - v<version>: literal "v" + integer version.
 *   - <path>: anything inside the bundle (e.g. index.html, assets/foo.png).
 *
 * The bundle key stored in `arcade_games.ipfs_cid` is `<gameId>/v<version>`,
 * so iframes simply concatenate `/arcade-files/${ipfsCid}/index.html`.
 */
import type { Config } from "@netlify/functions";
import { arcadeBlobStore, guessContentType } from "./arcade-storage.mts";

export default async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // Strip the leading "/arcade-files/" prefix to get the blob key.
    const m = url.pathname.match(/^\/arcade-files\/(.+)$/);
    if (!m) return new Response("Not found", { status: 404 });

    let key = decodeURIComponent(m[1]);

    // Trailing slash means index.html.
    if (key.endsWith("/")) key += "index.html";

    // Block path traversal — the prefix structure must be `<gameId>/v<version>/...`.
    if (key.includes("..") || key.startsWith("/")) {
        return new Response("Bad request", { status: 400 });
    }

    const store = arcadeBlobStore();
    const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!blob) return new Response("Not found", { status: 404 });

    const meta = (blob.metadata ?? {}) as { contentType?: string };
    const contentType = meta.contentType || guessContentType(key);

    return new Response(blob.data, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            // Bundle contents are immutable per (gameId, version) tuple — version is bumped on update.
            "Cache-Control": "public, max-age=31536000, immutable",
            // Override the site-wide DENY / frame-ancestors 'none' so the game can be embedded
            // in same-origin iframes (GamePlayer, AdminReview, EditGameForm preview).
            "X-Frame-Options": "SAMEORIGIN",
            "Content-Security-Policy": "frame-ancestors 'self'",
        },
    });
}

export const config: Config = {
    path: "/arcade-files/:path*",
};
