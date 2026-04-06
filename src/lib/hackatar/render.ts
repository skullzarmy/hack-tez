import type { HackatarTraits } from "./traits.ts";
import type { HackatarColor } from "./palette.ts";
import { computeGrid } from "./grid.ts";
import { applyGlitchEffects } from "./glitch.ts";
import { createPrng } from "./prng.ts";

export const TOTAL_FRAMES = 30;
export const FRAME_DELAY_MS = 80;

export interface RenderResult {
  /** Raw RGBA pixel data for each frame, in order */
  frames: Uint8ClampedArray[];
  width: number;
  height: number;
  frameDelayMs: number;
}

/**
 * Render a single frame at the given index. Used for static display.
 * Returns raw RGBA pixel data (size × size × 4 bytes).
 */
export function renderSingleFrame(
  traits: HackatarTraits,
  size: number,
  frameIndex = 0,
): Uint8ClampedArray {
  const { gridSize, emitters, color, glitchEffects, cellGap, cellRadius } = traits;
  const cellPx = size / gridSize;
  const gap = cellGap;
  const innerSize = cellPx - gap;
  const radius = cellRadius * (innerSize / 2);

  const t = (frameIndex / TOTAL_FRAMES) * Math.PI * 2;
  const grid = computeGrid(gridSize, emitters, t);
  const pixels = new Uint8ClampedArray(size * size * 4);

  renderCells(pixels, size, gridSize, grid, color, cellPx, gap, innerSize, radius);

  const framePrng = createPrng((frameIndex * 7919 + 104729) | 0);
  applyGlitchEffects(pixels, size, size, glitchEffects, frameIndex, TOTAL_FRAMES, color, framePrng);

  return pixels;
}

/**
 * Render all frames for a hackatar. Returns raw pixel data.
 * This is platform-agnostic — no Canvas dependency.
 * The caller (Node with @napi-rs/canvas, browser with OffscreenCanvas, etc.)
 * handles encoding to GIF/PNG.
 */
export function renderFrames(traits: HackatarTraits, size: number): RenderResult {
  const { gridSize, emitters, color, glitchEffects, cellGap, cellRadius } = traits;

  // Cell dimensions in pixels
  const cellPx = size / gridSize;
  const gap = cellGap;
  const innerSize = cellPx - gap;
  const radius = cellRadius * (innerSize / 2);

  // Check for frame stutter effect
  const stutterFrames = new Set<number>();
  for (const fx of glitchEffects) {
    if (fx.type === "frame-stutter") {
      for (const f of fx.holdFrames) stutterFrames.add(f);
    }
  }

  const frames: Uint8ClampedArray[] = [];
  let prevFrame: Uint8ClampedArray | null = null;

  for (let fi = 0; fi < TOTAL_FRAMES; fi++) {
    // Frame stutter: duplicate previous frame
    if (stutterFrames.has(fi) && prevFrame) {
      frames.push(new Uint8ClampedArray(prevFrame));
      continue;
    }

    const t = (fi / TOTAL_FRAMES) * Math.PI * 2;
    const grid = computeGrid(gridSize, emitters, t);
    const pixels = new Uint8ClampedArray(size * size * 4);

    // Draw cells as rounded rectangles
    renderCells(pixels, size, gridSize, grid, color, cellPx, gap, innerSize, radius);

    // Apply glitch effects (mutates pixels)
    // Create a per-frame PRNG for stochastic effects (static noise, etc.)
    // Seed it deterministically from frame index so static is consistent
    const framePrng = createPrng((fi * 7919 + 104729) | 0);
    applyGlitchEffects(pixels, size, size, glitchEffects, fi, TOTAL_FRAMES, color, framePrng);

    prevFrame = pixels;
    frames.push(pixels);
  }

  return { frames, width: size, height: size, frameDelayMs: FRAME_DELAY_MS };
}

// ── Cell rendering ───────────────────────────────────────

function renderCells(
  pixels: Uint8ClampedArray,
  size: number,
  gridSize: number,
  grid: Float32Array,
  color: HackatarColor,
  cellPx: number,
  gap: number,
  innerSize: number,
  radius: number,
): void {
  const halfGap = gap / 2;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const brightness = grid[row * gridSize + col];
      if (brightness < 0.02) continue; // pure black, skip

      const r = (color.r * brightness) | 0;
      const g = (color.g * brightness) | 0;
      const b = (color.b * brightness) | 0;

      // Cell bounding box in pixel space
      const x0 = Math.floor(col * cellPx + halfGap);
      const y0 = Math.floor(row * cellPx + halfGap);
      const x1 = Math.floor(col * cellPx + halfGap + innerSize);
      const y1 = Math.floor(row * cellPx + halfGap + innerSize);

      fillRoundedRect(pixels, size, x0, y0, x1, y1, radius, r, g, b);
    }
  }
}

/** Fill a rounded rectangle into the pixel buffer */
function fillRoundedRect(
  pixels: Uint8ClampedArray,
  stride: number,
  x0: number, y0: number, x1: number, y1: number,
  radius: number,
  r: number, g: number, b: number,
): void {
  const clampedRadius = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  const r2 = clampedRadius * clampedRadius;

  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= stride) continue;
    for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= stride) continue;

      // Check rounded corners
      if (clampedRadius > 0) {
        let dx = 0, dy = 0;
        if (x < x0 + clampedRadius && y < y0 + clampedRadius) {
          dx = x - (x0 + clampedRadius); dy = y - (y0 + clampedRadius);
        } else if (x >= x1 - clampedRadius && y < y0 + clampedRadius) {
          dx = x - (x1 - clampedRadius - 1); dy = y - (y0 + clampedRadius);
        } else if (x < x0 + clampedRadius && y >= y1 - clampedRadius) {
          dx = x - (x0 + clampedRadius); dy = y - (y1 - clampedRadius - 1);
        } else if (x >= x1 - clampedRadius && y >= y1 - clampedRadius) {
          dx = x - (x1 - clampedRadius - 1); dy = y - (y1 - clampedRadius - 1);
        }
        if (dx * dx + dy * dy > r2) continue;
      }

      const i = (y * stride + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
}
