// Hackcade SDK type declarations. ESM module.

export interface HackcadePlayer {
    /** Full domain name, e.g. "skull.hack.tez". Empty string for guests. */
    domain: string;
    /** Label only, e.g. "skull". "guest" for unauthenticated players. */
    label: string;
    /** tz1... wallet address. Empty string for guests. */
    address: string;
    /** Profile picture if set, otherwise hackatar URL. Empty string for guests. */
    avatarUrl: string;
    /** Generative hackatar URL (always present for authenticated players). */
    hackatarUrl: string;
}

export type HackcadeEventName = "init" | "start" | "pause" | "resume" | "visibility";

export interface HackcadeGameOverOptions {
    durationSeconds?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}

export interface HackcadeSDK {
    /** Live EventTarget for `init`, `start`, `pause`, `resume`, `visibility`. */
    readonly events: EventTarget;
    /** Current player (null until `ready()` resolves). */
    readonly player: HackcadePlayer | null;
    /** Current session id (null until `ready()` resolves). */
    readonly session: string | null;
    /** True once the platform has sent `init`. */
    readonly isReady: boolean;
    /** Tell the platform we're loaded. Resolves with the player once `init` arrives. */
    ready(): Promise<HackcadePlayer>;
    /** Get the current player (resolves after `init`). */
    getPlayer(): Promise<HackcadePlayer>;
    /** True if the player has no hack.tez domain. */
    isGuest(): boolean;
    /** "Hi, skull.hack.tez" or "Hi, guest". */
    greeting(): string;
    /** Live score update — shown in the platform chrome. */
    updateScore(score: number): void;
    /** Final score → leaderboard. Authenticated players only. */
    gameOver(finalScore: number, options?: HackcadeGameOverOptions): void;
    /** Subscribe to an event. Returns an unsubscribe function. */
    on(event: HackcadeEventName, handler: (detail: unknown) => void): () => void;
}

declare const sdk: HackcadeSDK;
export default sdk;
export const events: EventTarget;
