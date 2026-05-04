/**
 * Arcade Loader — CRT-style boot animation displayed while a game iframe loads.
 *
 * Vibes: dim arcade bar, neon scanlines, "INSERT COIN" energy. Pure CSS animation
 * (no GIF/asset deps). Sized to fill its container so it sits behind the iframe
 * and fades out once the game posts `hackcade:ready`.
 */
import { useEffect, useState } from "react";

interface ArcadeLoaderProps {
    /** Game title shown below the loader. */
    title?: string;
    /** Optional sub-message ("Booting…", "Reaching IPFS gateway…"). */
    message?: string;
}

const TICKS = ["BOOTING ROM", "CHECKING IPFS GATEWAY", "MOUNTING CABINET", "INSERT COIN"];

export default function ArcadeLoader({ title, message }: ArcadeLoaderProps) {
    const [tickIdx, setTickIdx] = useState(0);

    useEffect(() => {
        const t = setInterval(() => setTickIdx((i) => (i + 1) % TICKS.length), 1100);
        return () => clearInterval(t);
    }, []);

    const status = message ?? TICKS[tickIdx];

    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={`Loading ${title ?? "game"}`}
            style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.25rem",
                background:
                    "radial-gradient(circle at center, rgba(0,255,200,0.08) 0%, rgba(0,0,0,0.92) 70%), #000",
                color: "var(--accent, #00ffc8)",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                overflow: "hidden",
            }}
        >
            <div
                aria-hidden
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                        "repeating-linear-gradient(0deg, rgba(0,255,200,0.06) 0px, rgba(0,255,200,0.06) 1px, transparent 1px, transparent 3px)",
                    pointerEvents: "none",
                    mixBlendMode: "screen",
                }}
            />
            <div
                aria-hidden
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(180deg, transparent 0%, rgba(0,255,200,0.18) 50%, transparent 100%)",
                    backgroundSize: "100% 6px",
                    animation: "hackcade-scanline 4s linear infinite",
                    pointerEvents: "none",
                    opacity: 0.35,
                }}
            />
            <style>{`
                @keyframes hackcade-scanline {
                    0% { background-position: 0 -100vh; }
                    100% { background-position: 0 100vh; }
                }
                @keyframes hackcade-blink {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                }
            `}</style>

            <div
                style={{
                    position: "relative",
                    fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    textShadow: "0 0 12px var(--accent, #00ffc8), 0 0 24px rgba(0,255,200,0.4)",
                }}
            >
                HACKCADE
            </div>

            {title && (
                <div
                    style={{
                        position: "relative",
                        fontSize: "clamp(0.95rem, 2vw, 1.15rem)",
                        opacity: 0.85,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                    }}
                >
                    » {title} «
                </div>
            )}

            <div
                style={{
                    position: "relative",
                    minHeight: "1.4em",
                    fontSize: "0.9rem",
                    letterSpacing: "0.08em",
                    color: "var(--accent, #00ffc8)",
                    opacity: 0.85,
                }}
            >
                {status}
                <span
                    aria-hidden
                    style={{
                        display: "inline-block",
                        marginLeft: "0.25em",
                        animation: "hackcade-blink 1s steps(1) infinite",
                    }}
                >
                    _
                </span>
            </div>
        </div>
    );
}
