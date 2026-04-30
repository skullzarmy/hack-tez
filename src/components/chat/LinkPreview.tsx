import { useState, useEffect, useRef, useCallback } from "react";
import { ExternalLink } from "lucide-react";

import { hackchatUrl } from "../../config/tezos";

interface OgData {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
    url?: string;
}

// Module-level cache so previews persist across re-renders
const ogCache = new Map<string, OgData | null>();

export default function LinkPreview({ url, token }: { url: string; token: string }) {
    const [og, setOg] = useState<OgData | null | undefined>(() => {
        const cached = ogCache.get(url);
        return cached !== undefined ? cached : undefined;
    });
    const fetchedRef = useRef(false);

    const fetchOg = useCallback(async () => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const cached = ogCache.get(url);
        if (cached !== undefined) {
            setOg(cached);
            return;
        }

        try {
            const res = await fetch(
                `${hackchatUrl}/og?url=${encodeURIComponent(url)}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!res.ok) { ogCache.set(url, null); setOg(null); return; }
            const json = await res.json() as { og: OgData | null };
            ogCache.set(url, json.og);
            setOg(json.og);
        } catch {
            ogCache.set(url, null);
            setOg(null);
        }
    }, [url, token]);

    useEffect(() => { fetchOg(); }, [fetchOg]);

    // Not yet fetched or no OG data
    if (og === undefined || og === null) return null;
    if (!og.title && !og.description && !og.image) return null;

    const hostname = (() => {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
    })();

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: "block",
                marginTop: "8px",
                border: "1px solid var(--border-2, #333)",
                background: "var(--bg-1, #111)",
                textDecoration: "none",
                color: "inherit",
                overflow: "hidden",
                maxWidth: "min(400px, calc(100vw - 100px))",
            }}
        >
            {og.image && (
                <img
                    src={og.image}
                    alt=""
                    loading="lazy"
                    style={{
                        width: "100%",
                        maxHeight: "200px",
                        objectFit: "cover",
                        display: "block",
                    }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
            )}
            <div style={{ padding: "10px 12px" }}>
                {(og.siteName || hostname) && (
                    <div style={{
                        fontSize: "10px",
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                    }}>
                        <ExternalLink size={10} />
                        {og.siteName || hostname}
                    </div>
                )}
                {og.title && (
                    <div style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--fg, #eee)",
                        lineHeight: 1.3,
                        marginBottom: og.description ? "4px" : "0",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                    }}>
                        {og.title}
                    </div>
                )}
                {og.description && (
                    <div style={{
                        fontSize: "11px",
                        color: "var(--fg-3, #888)",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                    }}>
                        {og.description}
                    </div>
                )}
            </div>
        </a>
    );
}
