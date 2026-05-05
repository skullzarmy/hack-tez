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

function resolveLightMode(): boolean {
    if (typeof document === "undefined") return false;
    const explicit = document.documentElement.dataset.theme;
    if (explicit === "light") return true;
    if (explicit === "dark") return false;
    return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches;
}

function useResolvedLightMode(): boolean {
    const [light, setLight] = useState(resolveLightMode);
    useEffect(() => {
        const update = () => setLight(resolveLightMode());
        const mql = matchMedia("(prefers-color-scheme: light)");
        mql.addEventListener("change", update);
        const obs = new MutationObserver(update);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => {
            mql.removeEventListener("change", update);
            obs.disconnect();
        };
    }, []);
    return light;
}

export default function ArcadeLoader({ title, message }: ArcadeLoaderProps) {
    const [tickIdx, setTickIdx] = useState(0);
    const light = useResolvedLightMode();

    useEffect(() => {
        const t = setInterval(() => setTickIdx((i) => (i + 1) % TICKS.length), 1100);
        return () => clearInterval(t);
    }, []);

    const status = message ?? TICKS[tickIdx];

    // Theme palettes: dark keeps the CRT-on-black arcade vibe; light is a softer
    // paper-screen with the same accent ink so it still reads as "arcade".
    const palette = light
        ? {
              bg: "radial-gradient(circle at center, rgba(0,180,140,0.10) 0%, #f4f1e8 70%), #f4f1e8",
              ink: "#0a4a3a",
              inkSoft: "rgba(10,74,58,0.75)",
              accentGlow: "0 0 8px rgba(10,74,58,0.35)",
              scanlineColor: "rgba(10,74,58,0.08)",
              sweepGradient: "linear-gradient(180deg, transparent 0%, rgba(10,74,58,0.10) 50%, transparent 100%)",
              blendMode: "multiply" as const,
              sweepOpacity: 0.45,
          }
        : {
              bg: "radial-gradient(circle at center, rgba(0,255,200,0.08) 0%, rgba(0,0,0,0.92) 70%), #000",
              ink: "var(--accent, #00ffc8)",
              inkSoft: "var(--accent, #00ffc8)",
              accentGlow: "0 0 12px var(--accent, #00ffc8), 0 0 24px rgba(0,255,200,0.4)",
              scanlineColor: "rgba(0,255,200,0.06)",
              sweepGradient: "linear-gradient(180deg, transparent 0%, rgba(0,255,200,0.18) 50%, transparent 100%)",
              blendMode: "screen" as const,
              sweepOpacity: 0.35,
          };

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
                background: palette.bg,
                color: palette.ink,
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                overflow: "hidden",
            }}
        >
            <div
                aria-hidden
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `repeating-linear-gradient(0deg, ${palette.scanlineColor} 0px, ${palette.scanlineColor} 1px, transparent 1px, transparent 3px)`,
                    pointerEvents: "none",
                    mixBlendMode: palette.blendMode,
                }}
            />
            <div
                aria-hidden
                style={{
                    position: "absolute",
                    inset: 0,
                    background: palette.sweepGradient,
                    backgroundSize: "100% 6px",
                    animation: "hackcade-scanline 4s linear infinite",
                    pointerEvents: "none",
                    opacity: palette.sweepOpacity,
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
                    textShadow: palette.accentGlow,
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
                    color: palette.inkSoft,
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
