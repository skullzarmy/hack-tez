/**
 * GamePlayer — sandboxed iframe host for Hackcade games.
 *
 * Security model:
 * - sandbox="allow-scripts" only. No same-origin, no top navigation, no forms.
 * - The IPFS gateway is shared by every IPFS-hosted app, so origin-based
 *   postMessage validation is useless. We instead require the iframe to echo
 *   `sessionId` (issued server-side, single-use) on every score message.
 * - Server-side validation (`POST /arcade/score`) re-checks sessionId, owner,
 *   freshness, and applies anti-cheat caps.
 *
 * Lifecycle:
 * 1. (auth users) startArcadeSession() → { sessionId }
 * 2. iframe loads → 30s timer waits for `hackcade:ready`
 * 3. on ready → postMessage `hackcade:init` { player, sessionId }
 * 4. iframe posts `hackcade:score` (display only) and `hackcade:gameover`
 *    { sessionId, score, durationSeconds, metadata? }
 * 5. submitArcadeScore() → server validates + records.
 *
 * Guests skip steps 1+5; the SDK serves a guest player object and the result
 * screen prompts them to claim a hack.tez name.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { ArcadeGameDetail } from "../../hooks/useArcade";
import { gameIframeUrl, startArcadeSession, submitArcadeScore } from "../../hooks/useArcade";

interface PlayerMessage {
    type: string;
    sessionId?: string;
    score?: number;
    durationSeconds?: number;
    metadata?: unknown;
}

interface Props {
    game: ArcadeGameDetail;
    /** authed user's active hack.tez domain, or null for guest. */
    domain: string | null;
    address: string | null;
    onExit: () => void;
}

const READY_TIMEOUT_MS = 30_000;

export default function GamePlayer({ game, domain, address, onExit }: Props) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [status, setStatus] = useState<"booting" | "ready" | "playing" | "gameover" | "error">("booting");
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [liveScore, setLiveScore] = useState(0);
    const [final, setFinal] = useState<{ score: number; rank?: number; isPersonalBest?: boolean } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const submittedRef = useRef(false);

    // Start a server session up-front for authed users, so we have a sessionId
    // ready before the iframe says "ready".
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

    // Ready timeout watchdog.
    useEffect(() => {
        if (status !== "booting") return;
        const id = setTimeout(() => {
            if (status === "booting") {
                setStatus("error");
                setError("Game failed to load within 30 seconds.");
            }
        }, READY_TIMEOUT_MS);
        return () => clearTimeout(id);
    }, [status]);

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
                setFinal({ score, rank: res.rank, isPersonalBest: res.isPersonalBest });
            } catch (e) {
                setSubmitError(e instanceof Error ? e.message : "Submit failed");
            } finally {
                setSubmitting(false);
            }
        },
        [domain, sessionId],
    );

    // Listen for iframe messages.
    useEffect(() => {
        function onMessage(e: MessageEvent) {
            if (e.source !== iframeRef.current?.contentWindow) return;
            const data = e.data as PlayerMessage | null;
            if (!data || typeof data.type !== "string") return;
            if (data.type === "hackcade:ready") {
                setStatus((s) => (s === "booting" ? "ready" : s));
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

    const replay = () => {
        submittedRef.current = false;
        setFinal(null);
        setSubmitError(null);
        setLiveScore(0);
        setStatus("booting");
        // Force iframe reload
        if (iframeRef.current) {
            const src = iframeRef.current.src;
            iframeRef.current.src = "";
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            void iframeRef.current.offsetHeight;
            iframeRef.current.src = src;
        }
        if (domain) {
            startArcadeSession(game.slug)
                .then((s) => setSessionId(s.sessionId))
                .catch((e) => setError(e instanceof Error ? e.message : "session failed"));
        }
    };

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
                    <span>SCORE</span>
                    <strong style={{ color: "#fff", fontSize: 16 }}>{liveScore.toLocaleString()}</strong>
                </div>
                <div style={{ opacity: 0.7 }}>
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
                    ref={iframeRef}
                    src={gameIframeUrl(game.ipfsCid)}
                    title={game.title}
                    sandbox="allow-scripts"
                    allow="accelerometer; gyroscope; gamepad"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                />
                {(status === "booting" || status === "ready") && (
                    <Overlay>
                        <div>BOOTING…</div>
                        <small style={{ opacity: 0.7 }}>Loading from IPFS — first run may be slow</small>
                    </Overlay>
                )}
                {status === "error" && (
                    <Overlay>
                        <div style={{ color: "#ff6b6b" }}>{error || "Failed to load"}</div>
                        <button onClick={replay} style={btnStyle}>
                            Retry
                        </button>
                    </Overlay>
                )}
                {status === "gameover" && final && (
                    <Overlay>
                        <div style={{ fontSize: 18, color: "#fff" }}>GAME OVER</div>
                        <div style={{ fontSize: 28, color: "#ffe66d" }}>{final.score.toLocaleString()}</div>
                        {submitting && <div style={{ opacity: 0.7 }}>Submitting…</div>}
                        {!submitting && domain && final.rank != null && (
                            <div style={{ color: "#aafff0" }}>
                                Rank #{final.rank}
                                {final.isPersonalBest ? " — NEW BEST!" : ""}
                            </div>
                        )}
                        {!submitting && !domain && (
                            <div style={{ opacity: 0.85, maxWidth: 320, textAlign: "center" }}>
                                Claim a <strong>hack.tez</strong> name to save your score on the leaderboard.
                            </div>
                        )}
                        {submitError && <div style={{ color: "#ff6b6b" }}>{submitError}</div>}
                        <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={replay} style={btnStyle}>
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

function Overlay({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
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
