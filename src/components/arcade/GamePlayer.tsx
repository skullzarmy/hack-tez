/**
 * GamePlayer — sandboxed iframe host for Hackcade games.
 *
 * Security: sandbox="allow-scripts" only. Server validates score submission
 * via single-use sessionId.
 *
 * Lifecycle:
 *   1. (auth) startArcadeSession() → sessionId
 *   2. iframe loads → 30s watchdog waits for `hackcade:ready`
 *   3. on ready → postMessage init { player, sessionId }
 *   4. iframe posts hackcade:score (display) + hackcade:gameover { score, durationSeconds }
 *   5. submitArcadeScore() → server validates and records
 *
 * Replay flow (was racy): now waits for the new sessionId BEFORE reloading
 * the iframe, eliminating the 409 ALREADY_SUBMITTED on quick replays.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArcadeGameDetail } from "../../hooks/useArcade";
import { gameIframeUrl, startArcadeSession, submitArcadeScore } from "../../hooks/useArcade";
import ArcadeLoader from "./ArcadeLoader";

interface PlayerMessage {
    type: string;
    sessionId?: string;
    score?: number;
    durationSeconds?: number;
    metadata?: unknown;
}

interface FinalState {
    score: number;
    rank?: number;
    isPersonalBest?: boolean;
    previousBest?: number;
    isFirstScore?: boolean;
}

interface Props {
    game: ArcadeGameDetail;
    domain: string | null;
    address: string | null;
    onExit: () => void;
}

const READY_TIMEOUT_MS = 30_000;

export default function GamePlayer({ game, domain, address, onExit }: Props) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [status, setStatus] = useState<"booting" | "playing" | "gameover" | "error">("booting");
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [iframeNonce, setIframeNonce] = useState(0);
    const [liveScore, setLiveScore] = useState(0);
    const [final, setFinal] = useState<FinalState | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const submittedRef = useRef(false);

    // Start a server session up-front for authed users.
    useEffect(() => {
        let cancelled = false;
        if (!domain) {
            setSessionId(null);
            return;
        }
        startArcadeSession(game.slug)
            .then((s) => {
                if (!cancelled) setSessionId(s.sessionId);
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to start session");
            });
        return () => {
            cancelled = true;
        };
    }, [game.slug, domain]);

    // Ready timeout watchdog (per iframe boot).
    useEffect(() => {
        if (status !== "booting") return;
        const id = window.setTimeout(() => {
            setStatus((curr) => {
                if (curr !== "booting") return curr;
                setError("Game failed to load within 30 seconds.");
                return "error";
            });
        }, READY_TIMEOUT_MS);
        return () => window.clearTimeout(id);
    }, [status, iframeNonce]);

    const sendInit = useCallback(() => {
        if (!iframeRef.current?.contentWindow) return;
        iframeRef.current.contentWindow.postMessage(
            {
                type: "hackcade:init",
                player: domain
                    ? { domain, label: domain.split(".")[0], address, isGuest: false }
                    : { domain: null, label: "guest", address: null, isGuest: true },
                sessionId,
                gameSlug: game.slug,
            },
            "*",
        );
    }, [domain, address, sessionId, game.slug]);

    const submitScore = useCallback(
        async (msg: PlayerMessage) => {
            if (submittedRef.current) return;
            const score = Math.max(0, Math.floor(Number(msg.score ?? 0)));
            const duration = Math.max(0, Math.floor(Number(msg.durationSeconds ?? 0)));
            setStatus("gameover");
            setFinal({ score });

            if (!domain || !sessionId) return; // guest: local display only
            if (msg.sessionId !== sessionId) {
                setSubmitError("Score rejected: session mismatch");
                return;
            }
            submittedRef.current = true;
            setSubmitting(true);
            try {
                const res = await submitArcadeScore({
                    sessionId,
                    score,
                    durationSeconds: duration,
                    metadata: msg.metadata,
                });
                setFinal({
                    score,
                    rank: res.rank,
                    isPersonalBest: res.isPersonalBest,
                    previousBest: res.previousBest,
                    isFirstScore: res.isFirstScore,
                });
            } catch (e) {
                setSubmitError(e instanceof Error ? e.message : "Submit failed");
            } finally {
                setSubmitting(false);
            }
        },
        [domain, sessionId],
    );

    useEffect(() => {
        function onMessage(e: MessageEvent) {
            if (e.source !== iframeRef.current?.contentWindow) return;
            const data = e.data as PlayerMessage | null;
            if (!data || typeof data.type !== "string") return;
            if (data.type === "hackcade:ready") {
                sendInit();
                setStatus("playing");
                return;
            }
            if (data.type === "hackcade:score") {
                setLiveScore(Math.max(0, Math.floor(Number(data.score ?? 0))));
                return;
            }
            if (data.type === "hackcade:gameover") {
                void submitScore(data);
                return;
            }
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [sendInit, submitScore]);

    const replay = useCallback(async () => {
        // Reset display state immediately so user gets feedback.
        submittedRef.current = false;
        setFinal(null);
        setSubmitError(null);
        setError(null);
        setLiveScore(0);
        setStatus("booting");

        // For authed users: get the NEW sessionId BEFORE the iframe reloads,
        // so the SDK never grabs a stale session via init.
        if (domain) {
            setSessionId(null);
            try {
                const s = await startArcadeSession(game.slug);
                setSessionId(s.sessionId);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to start session");
                setStatus("error");
                return;
            }
        }
        // Bumping the nonce remounts the iframe with a fresh document.
        setIframeNonce((n) => n + 1);
    }, [domain, game.slug]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.45)",
                    borderRadius: 6,
                    border: "1px solid rgba(0,255,170,0.25)",
                    fontFamily: "ui-monospace,monospace",
                    color: "#aafff0",
                    fontSize: 13,
                }}
            >
                <button
                    type="button"
                    onClick={onExit}
                    style={{
                        background: "transparent",
                        border: "1px solid rgba(0,255,170,0.4)",
                        color: "#aafff0",
                        padding: "4px 10px",
                        borderRadius: 4,
                        cursor: "pointer",
                    }}
                >
                    ← Lobby
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ opacity: 0.7, letterSpacing: 1 }}>SCORE</span>
                    <strong style={{ color: "#fff", fontSize: 18 }}>{liveScore.toLocaleString()}</strong>
                </div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                    {domain ? `Playing as ${domain}` : "Guest play (sign in to save scores)"}
                </div>
            </div>

            <div
                style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "9 / 16",
                    maxHeight: "calc(100vh - 200px)",
                    background: "#000",
                    borderRadius: 8,
                    overflow: "hidden",
                    border: "1px solid rgba(0,255,170,0.3)",
                }}
            >
                <iframe
                    key={iframeNonce}
                    ref={iframeRef}
                    src={gameIframeUrl(game.ipfsCid)}
                    title={game.title}
                    sandbox="allow-scripts"
                    allow="accelerometer; gyroscope; gamepad"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                />
                {status === "booting" && <ArcadeLoader title={game.title} message="LOADING FROM IPFS…" />}
                {status === "error" && (
                    <Overlay>
                        <div style={{ color: "#ff6b6b", fontSize: 16 }}>{error || "Failed to load"}</div>
                        <button onClick={() => void replay()} style={btnStyle}>
                            Retry
                        </button>
                    </Overlay>
                )}
                {status === "gameover" && final && (
                    <Overlay>
                        <GameoverContent final={final} submitting={submitting} domain={domain} submitError={submitError} />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button onClick={() => void replay()} style={btnPrimary}>
                                Play again
                            </button>
                            <button onClick={onExit} style={btnStyle}>
                                Lobby
                            </button>
                        </div>
                    </Overlay>
                )}
            </div>
        </div>
    );
}

function GameoverContent({
    final,
    submitting,
    domain,
    submitError,
}: {
    final: FinalState;
    submitting: boolean;
    domain: string | null;
    submitError: string | null;
}) {
    const isPB = final.isPersonalBest;
    const delta =
        isPB && final.previousBest != null && final.previousBest > 0
            ? final.score - final.previousBest
            : null;

    return (
        <>
            <style>{`@keyframes hackcadePulse { 0%,100% { transform: scale(1); text-shadow: 0 0 12px #ffe66d; } 50% { transform: scale(1.05); text-shadow: 0 0 24px #ffe66d; } }`}</style>
            <div style={{ fontSize: 14, color: "#fff", letterSpacing: 2, opacity: 0.85 }}>GAME OVER</div>
            <div
                style={{
                    fontSize: 40,
                    color: "#ffe66d",
                    fontWeight: 700,
                    animation: isPB ? "hackcadePulse 1.4s ease-in-out infinite" : undefined,
                }}
            >
                {final.score.toLocaleString()}
            </div>
            {submitting && <div style={{ opacity: 0.7, fontSize: 12 }}>Submitting…</div>}
            {!submitting && domain && final.rank != null && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    {isPB && (
                        <div
                            style={{
                                color: "#7eff9f",
                                fontSize: 13,
                                fontWeight: 700,
                                letterSpacing: 1,
                                padding: "3px 10px",
                                border: "1px solid #7eff9f",
                                borderRadius: 999,
                                background: "rgba(126,255,159,0.1)",
                            }}
                        >
                            ★ {final.isFirstScore ? "FIRST SCORE" : "NEW PERSONAL BEST"}
                        </div>
                    )}
                    <div style={{ color: "#aafff0", fontSize: 13 }}>
                        Rank #{final.rank}
                        {delta != null && <span style={{ opacity: 0.7 }}> · +{delta.toLocaleString()} from previous</span>}
                    </div>
                </div>
            )}
            {!submitting && !domain && (
                <div style={{ opacity: 0.85, maxWidth: 320, textAlign: "center", fontSize: 13 }}>
                    Claim a <strong>hack.tez</strong> name to save your score on the leaderboard.
                </div>
            )}
            {submitError && <div style={{ color: "#ff6b6b", fontSize: 12 }}>{submitError}</div>}
        </>
    );
}

function Overlay({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.88)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: "#aafff0",
                fontFamily: "ui-monospace,monospace",
                padding: 16,
                textAlign: "center",
            }}
        >
            {children}
        </div>
    );
}

const btnStyle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(0,255,170,0.6)",
    color: "#aafff0",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "ui-monospace,monospace",
    fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(0,255,170,0.18)",
    borderColor: "#7eff9f",
    color: "#7eff9f",
};
