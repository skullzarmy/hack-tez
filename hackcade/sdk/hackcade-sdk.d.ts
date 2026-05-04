// Hackcade SDK TypeScript declarations.
// Drop alongside hackcade-sdk.js or reference globally.

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

export type HackcadeLifecycleEvent = "start" | "pause" | "resume";

export interface HackcadeSDK {
    /** Signal that the game has loaded; resolves once `init` arrives from the platform. */
    ready(): Promise<HackcadePlayer>;
    /** Get the current player (after init). */
    getPlayer(): Promise<HackcadePlayer>;
    /** Whether the player is a guest (no hack.tez domain). */
    isGuest(): boolean;
    /** Live score update — shown in the platform chrome. */
    updateScore(score: number): void;
    /** Final score — submits to the leaderboard (authenticated players only). */
    gameOver(finalScore: number, metadata?: Record<string, unknown>): void;
    /** Subscribe to lifecycle events. Returns an unsubscribe function. */
    on(event: HackcadeLifecycleEvent, callback: () => void): () => void;
}

declare global {
    interface Window {
        hackcade: HackcadeSDK;
    }
}

export {};
