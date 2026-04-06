/**
 * Hackatar — generative identity for hack.tez
 *
 * Pure logic module. Takes a seed, returns raw frame data.
 * Platform-agnostic: no Canvas/DOM/Node dependencies.
 * The server function handles GIF encoding; the browser can use OffscreenCanvas.
 */

export { createPrng, seedFromHash } from "./prng.ts";
export type { Prng } from "./prng.ts";

export { selectTraits } from "./traits.ts";
export type { HackatarTraits, Emitter, GlitchEffect } from "./traits.ts";

export { PRIMARY_COLORS, COLOR_WEIGHTS } from "./palette.ts";
export type { HackatarColor } from "./palette.ts";

export { computeGrid } from "./grid.ts";
export { applyGlitchEffects } from "./glitch.ts";

export { renderFrames, renderSingleFrame, TOTAL_FRAMES, FRAME_DELAY_MS } from "./render.ts";
export type { RenderResult } from "./render.ts";
