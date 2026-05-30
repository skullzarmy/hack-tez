// Read-only Bluesky helpers. Kept separate from src/lib/bluesky.ts so consumers
// (e.g. useBlueskyHandle, surfaced on eagerly-loaded routes) don't drag
// src/lib/signing.ts and the @tezos-x SDK into the SSR/prerender bundle.

const BSKY_GET_PROFILE_URL = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile";
const DID_RE = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;

const handleCache = new Map<string, string | null>();
const inflightHandles = new Map<string, Promise<string | null>>();

/** Reverse-resolve a DID to its current Bluesky handle. Returns null on failure. */
export async function resolveDidToHandle(did: string): Promise<string | null> {
    if (!DID_RE.test(did)) return null;
    if (handleCache.has(did)) return handleCache.get(did) ?? null;
    const existing = inflightHandles.get(did);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const res = await fetch(`${BSKY_GET_PROFILE_URL}?actor=${encodeURIComponent(did)}`);
            if (!res.ok) {
                handleCache.set(did, null);
                return null;
            }
            const body = (await res.json()) as { handle?: string };
            const handle = body.handle ?? null;
            handleCache.set(did, handle);
            return handle;
        } catch {
            handleCache.set(did, null);
            return null;
        } finally {
            inflightHandles.delete(did);
        }
    })();
    inflightHandles.set(did, promise);
    return promise;
}
