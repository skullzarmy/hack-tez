import { useEffect, useState } from "react";
import { resolveDidToHandle } from "../lib/bluesky";

/**
 * Reverse-resolve a Bluesky DID to its current handle.
 *
 * Falls back to the raw input if it isn't a DID (so existing
 * profiles that stored handles directly still render correctly).
 * Cached in-memory across the page lifetime.
 */
export function useBlueskyHandle(didOrHandle: string | undefined): string | null {
    const [handle, setHandle] = useState<string | null>(null);

    useEffect(() => {
        if (!didOrHandle) {
            setHandle(null);
            return;
        }
        if (!didOrHandle.startsWith("did:")) {
            setHandle(didOrHandle);
            return;
        }
        let cancelled = false;
        resolveDidToHandle(didOrHandle).then((h) => {
            if (!cancelled) setHandle(h);
        });
        return () => {
            cancelled = true;
        };
    }, [didOrHandle]);

    return handle;
}
