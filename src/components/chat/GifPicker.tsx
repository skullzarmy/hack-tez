import { useState, useRef, useCallback, useEffect } from "react";
import { Search, X, Loader2 } from "lucide-react";

import { hackchatUrl } from "../../config/tezos";

interface GifResult {
    id: string;
    title: string;
    url: string;
    preview: string;
    width: number;
    height: number;
}

interface GifPickerProps {
    token: string;
    onSelect: (gif: { url: string; preview: string; width: number; height: number; title: string }) => void;
    onClose: () => void;
}

export default function GifPicker({ token, onSelect, onClose }: GifPickerProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GifResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [nextPos, setNextPos] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchGifs = useCallback(async (q: string, pos?: string) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: "20" });
            if (q.trim()) params.set("q", q.trim());
            if (pos) params.set("pos", pos);

            const resp = await fetch(`${hackchatUrl}/gif/search?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) throw new Error("Failed");
            const data = await resp.json() as { gifs: GifResult[]; next: string | null };
            if (pos) {
                setResults((prev) => [...prev, ...data.gifs]);
            } else {
                setResults(data.gifs);
            }
            setNextPos(data.next);
        } catch {
            if (!pos) setResults([]);
        } finally {
            setLoading(false);
        }
    }, [token]);

    // Load trending on mount
    useEffect(() => {
        fetchGifs("");
        inputRef.current?.focus();
    }, [fetchGifs]);

    // Debounced search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchGifs(query);
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, fetchGifs]);

    // Close on click outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (loading || !nextPos) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
            fetchGifs(query, nextPos);
        }
    }, [loading, nextPos, query, fetchGifs]);

    return (
        <div
            ref={containerRef}
            role="dialog"
            aria-label="GIF picker"
            style={{
                maxHeight: "min(340px, 50vh)",
                display: "flex",
                flexDirection: "column",
                background: "var(--bg-1, #111)",
                border: "1px solid var(--border-2, #333)",
                boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
            }}
        >
            {/* Search bar */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))",
                }}
            >
                <Search size={14} style={{ color: "var(--fg-3, #888)", flexShrink: 0 }} />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search KLIPY"
                    style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--fg, #eee)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                    }}
                    aria-label="Search GIFs"
                />
                <button
                    type="button"
                    onClick={onClose}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-3, #888)", padding: "8px", display: "flex" }}
                    aria-label="Close GIF picker"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Results — masonry via CSS columns (same pattern as Hackers/Dashboard) */}
            <div
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    columns: "120px auto",
                    columnGap: "4px",
                    padding: "4px",
                }}
            >
                {results.map((gif) => (
                    <div key={gif.id} style={{ breakInside: "avoid", marginBottom: "4px" }}>
                        <button
                            type="button"
                            onClick={() => onSelect({
                                url: gif.url,
                                preview: gif.preview,
                                width: gif.width,
                                height: gif.height,
                                title: gif.title,
                            })}
                            style={{
                                padding: 0,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                overflow: "hidden",
                                display: "block",
                                width: "100%",
                            }}
                            aria-label={gif.title || "GIF"}
                        >
                            <img
                                src={gif.preview}
                                alt={gif.title || "GIF"}
                                loading="lazy"
                                style={{
                                    width: "100%",
                                    height: "auto",
                                    display: "block",
                                }}
                            />
                        </button>
                    </div>
                ))}
                {loading && (
                    <div style={{
                        columnSpan: "all",
                        display: "flex",
                        justifyContent: "center",
                        padding: "16px",
                        color: "var(--fg-3, #888)",
                    }}>
                        <Loader2 size={20} className="animate-spin" />
                    </div>
                )}
                {!loading && results.length === 0 && (
                    <div style={{
                        columnSpan: "all",
                        textAlign: "center",
                        padding: "24px",
                        color: "var(--fg-3, #888)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                    }}>
                        {query ? "No GIFs found" : "Loading…"}
                    </div>
                )}
            </div>

            {/* KLIPY attribution */}
            <div
                style={{
                    padding: "4px 12px",
                    borderTop: "1px solid var(--border, rgba(255,255,255,0.1))",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg-3, #888)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    textAlign: "right",
                }}
            >
                Powered by KLIPY
            </div>
        </div>
    );
}
