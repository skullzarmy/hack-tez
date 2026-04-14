import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ExternalLink, MessageSquare, X, Loader2 } from "lucide-react";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react-dom";
import ChatAvatar from "./ChatAvatar";
import type { HackProfile } from "../../types/profile";

interface ProfilePopoutProps {
    domain: string;
    anchorRect: DOMRect;
    onClose: () => void;
    onStartDM?: (peerDomain: string) => void;
}

interface CachedProfile {
    data: HackProfile | null;
    fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map<string, CachedProfile>();

export default function ProfilePopout({ domain, anchorRect, onClose, onStartDM }: ProfilePopoutProps) {
    const [profile, setProfile] = useState<HackProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const label = domain.split(".")[0];

    // Virtual reference element from the anchor rect
    const virtualRef = useMemo(() => ({
        getBoundingClientRect: () => anchorRect,
    }), [anchorRect]);

    const { refs, floatingStyles } = useFloating({
        open: true,
        placement: "bottom-start",
        middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
        elements: { reference: virtualRef },
    });

    const fetchProfile = useCallback(async () => {
        const cached = profileCache.get(label);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setProfile(cached.data);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`/api/v1/profile/${encodeURIComponent(label)}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json() as { data?: { profile?: HackProfile } };
            const p = json.data?.profile ?? null;
            profileCache.set(label, { data: p, fetchedAt: Date.now() });
            setProfile(p);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [label]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    // Close on click outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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

    return (
        <div
            ref={(el) => { (ref as React.MutableRefObject<HTMLDivElement | null>).current = el; refs.setFloating(el); }}
            role="dialog"
            aria-label={`Profile: ${domain}`}
            style={{
                ...floatingStyles,
                width: "260px",
                maxWidth: "calc(100vw - 16px)",
                zIndex: 100,
                background: "var(--bg-1, #111)",
                border: "1px solid var(--border-2, #333)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                fontFamily: "var(--font-mono)",
            }}
        >
            {/* Close button */}
            <button
                type="button"
                onClick={onClose}
                style={{
                    position: "absolute",
                    top: "6px",
                    right: "6px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg-3, #888)",
                    padding: "8px",
                    display: "flex",
                }}
                aria-label="Close profile"
            >
                <X size={14} />
            </button>

            {/* Header: avatar + domain */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 16px 12px" }}>
                <ChatAvatar label={label} size={48} animated borderRadius="6px" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        className="truncate"
                        style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "var(--fg, #eee)",
                            letterSpacing: "0.04em",
                        }}
                    >
                        {domain}
                    </div>
                    {profile?.status && (
                        <div
                            style={{
                                fontSize: "10px",
                                color: "var(--accent, #00ffc8)",
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                marginTop: "2px",
                            }}
                        >
                            {profile.status}
                        </div>
                    )}
                </div>
            </div>

            {/* Loading / Error */}
            {loading && (
                <div style={{ display: "flex", justifyContent: "center", padding: "16px", color: "var(--fg-3, #888)" }}>
                    <Loader2 size={18} className="animate-spin" />
                </div>
            )}
            {error && (
                <div style={{ padding: "8px 16px", fontSize: "11px", color: "var(--fg-3, #888)" }}>
                    Could not load profile
                </div>
            )}

            {/* Profile details */}
            {!loading && !error && (
                <div style={{ padding: "0 16px 12px" }}>
                    {profile?.bio && (
                        <p style={{
                            fontSize: "11px",
                            lineHeight: 1.5,
                            color: "var(--fg-2, rgba(255,255,255,0.7))",
                            marginBottom: "8px",
                            wordBreak: "break-word",
                        }}>
                            {profile.bio.length > 140 ? profile.bio.slice(0, 140) + "…" : profile.bio}
                        </p>
                    )}

                    {profile?.location && (
                        <div style={{ fontSize: "10px", color: "var(--fg-3, #888)", marginBottom: "8px" }}>
                            📍 {profile.location}
                        </div>
                    )}

                    {/* Links */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                        {profile?.website && (
                            <ProfileLink href={profile.website} label="Website" />
                        )}
                        {profile?.github && (
                            <ProfileLink href={`https://github.com/${profile.github}`} label="GitHub" />
                        )}
                        {profile?.twitter && (
                            <ProfileLink href={`https://x.com/${profile.twitter}`} label="X" />
                        )}
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div style={{
                display: "flex",
                gap: "6px",
                padding: "0 16px 14px",
                borderTop: loading ? "none" : "1px solid var(--border, rgba(255,255,255,0.1))",
                paddingTop: loading ? "0" : "12px",
            }}>
                <a
                    href={`/u/${label}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        flex: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        padding: "8px",
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "var(--fg, #eee)",
                        border: "1px solid var(--border-2, #333)",
                        background: "transparent",
                        textDecoration: "none",
                        fontFamily: "var(--font-mono)",
                        cursor: "pointer",
                        minHeight: "36px",
                    }}
                >
                    <ExternalLink size={12} />
                    Profile
                </a>
                {onStartDM && (
                    <button
                        type="button"
                        onClick={() => { onStartDM(domain); onClose(); }}
                        style={{
                            flex: 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            padding: "8px",
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            color: "var(--bg, #000)",
                            background: "var(--accent, #00ffc8)",
                            border: "none",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                            minHeight: "36px",
                        }}
                    >
                        <MessageSquare size={12} />
                        DM
                    </button>
                )}
            </div>
        </div>
    );
}

function ProfileLink({ href, label }: { href: string; label: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                fontSize: "10px",
                color: "var(--accent, #00ffc8)",
                textDecoration: "none",
                padding: "2px 6px",
                border: "1px solid rgba(0, 255, 200, 0.2)",
                background: "rgba(0, 255, 200, 0.05)",
            }}
        >
            {label}
        </a>
    );
}
