import type { GlitchEffect } from "./traits.ts";
import type { HackatarColor } from "./palette.ts";
import type { Prng } from "./prng.ts";

/**
 * Apply glitch effects to raw pixel data (RGBA Uint8ClampedArray).
 * Mutates `pixels` in place.
 */
export function applyGlitchEffects(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  effects: readonly GlitchEffect[],
  frameIndex: number,
  totalFrames: number,
  color: HackatarColor,
  prng: Prng,
): void {
  const t = (frameIndex / totalFrames) * Math.PI * 2;

  for (const fx of effects) {
    switch (fx.type) {
      case "scanlines":
        applyScanlines(pixels, width, height, fx.spacing, fx.opacity);
        break;
      case "row-jitter":
        applyRowJitter(pixels, width, height, fx.intensity, fx.rowCount, fx.drift, t);
        break;
      case "frame-split":
        applyFrameSplit(pixels, width, height, fx.bands, fx.maxOffset, t);
        break;
      case "block-displace":
        applyBlockDisplace(pixels, width, height, fx.x, fx.y, fx.w, fx.h, fx.offsetX, fx.offsetY, t);
        break;
      case "rgb-shift":
        applyRgbShift(pixels, width, height, fx.rx, fx.ry, fx.bx, fx.by, fx.pulse, t);
        break;
      case "channel-dropout":
        if (fx.frames.includes(frameIndex)) {
          applyChannelDropout(pixels, width, height, fx.channel);
        }
        break;
      case "static":
        if (fx.frames.includes(frameIndex)) {
          applyStatic(pixels, width, height, fx.density, color, prng);
        }
        break;
      case "frame-stutter":
        // Handled in render.ts (frame duplication logic)
        break;
      case "brightness-surge":
        applyBrightnessSurge(pixels, width, height, frameIndex, fx.peakFrame, totalFrames, fx.intensity);
        break;
    }
  }
}

// ── Scanlines ────────────────────────────────────────────

function applyScanlines(
  pixels: Uint8ClampedArray, w: number, h: number,
  spacing: number, opacity: number,
): void {
  const darken = 1 - opacity;
  for (let y = 0; y < h; y++) {
    if (y % spacing === 0) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        pixels[i] = (pixels[i] * darken) | 0;
        pixels[i + 1] = (pixels[i + 1] * darken) | 0;
        pixels[i + 2] = (pixels[i + 2] * darken) | 0;
      }
    }
  }
}

// ── Row Jitter ───────────────────────────────────────────

function applyRowJitter(
  pixels: Uint8ClampedArray, w: number, h: number,
  intensity: number, rowCount: number, drift: number, t: number,
): void {
  const temp = new Uint8ClampedArray(w * 4);
  for (let r = 0; r < rowCount; r++) {
    // Which row to jitter drifts through the image over time
    const rowF = ((r / rowCount + drift * t / (Math.PI * 2)) % 1) * h;
    const row = Math.floor(rowF) % h;
    const offset = Math.round(Math.sin(t * (r + 1) * 1.7) * intensity);
    if (offset === 0) continue;

    const rowStart = row * w * 4;
    temp.set(pixels.subarray(rowStart, rowStart + w * 4));

    for (let x = 0; x < w; x++) {
      const srcX = ((x - offset) % w + w) % w;
      const di = rowStart + x * 4;
      const si = srcX * 4;
      pixels[di] = temp[si];
      pixels[di + 1] = temp[si + 1];
      pixels[di + 2] = temp[si + 2];
      pixels[di + 3] = temp[si + 3];
    }
  }
}

// ── Frame Split ──────────────────────────────────────────

function applyFrameSplit(
  pixels: Uint8ClampedArray, w: number, h: number,
  bands: number, maxOffset: number, t: number,
): void {
  const bandHeight = Math.floor(h / bands);
  const temp = new Uint8ClampedArray(w * 4);

  for (let b = 0; b < bands; b++) {
    const offset = Math.round(Math.sin(t * (b + 1) * 0.8 + b * 2.1) * maxOffset);
    if (offset === 0) continue;

    const yStart = b * bandHeight;
    const yEnd = b === bands - 1 ? h : yStart + bandHeight;

    for (let y = yStart; y < yEnd; y++) {
      const rowStart = y * w * 4;
      temp.set(pixels.subarray(rowStart, rowStart + w * 4));

      for (let x = 0; x < w; x++) {
        const srcX = ((x - offset) % w + w) % w;
        const di = rowStart + x * 4;
        const si = srcX * 4;
        pixels[di] = temp[si];
        pixels[di + 1] = temp[si + 1];
        pixels[di + 2] = temp[si + 2];
        pixels[di + 3] = temp[si + 3];
      }
    }
  }
}

// ── Block Displace ───────────────────────────────────────

function applyBlockDisplace(
  pixels: Uint8ClampedArray, w: number, h: number,
  bx: number, by: number, bw: number, bh: number,
  ox: number, oy: number, t: number,
): void {
  const x0 = Math.floor(bx * w);
  const y0 = Math.floor(by * h);
  const x1 = Math.min(w, Math.floor((bx + bw) * w));
  const y1 = Math.min(h, Math.floor((by + bh) * h));

  // Oscillate displacement
  const factor = Math.sin(t * 1.3) * 0.5 + 0.5;
  const dx = Math.round(ox * factor);
  const dy = Math.round(oy * factor);
  if (dx === 0 && dy === 0) return;

  // Copy block, then paste at offset
  const blockW = x1 - x0;
  const blockH = y1 - y0;
  const block = new Uint8ClampedArray(blockW * blockH * 4);

  for (let y = 0; y < blockH; y++) {
    const srcRow = (y0 + y) * w * 4 + x0 * 4;
    block.set(pixels.subarray(srcRow, srcRow + blockW * 4), y * blockW * 4);
  }

  for (let y = 0; y < blockH; y++) {
    const destY = y0 + y + dy;
    if (destY < 0 || destY >= h) continue;
    for (let x = 0; x < blockW; x++) {
      const destX = x0 + x + dx;
      if (destX < 0 || destX >= w) continue;
      const si = (y * blockW + x) * 4;
      const di = (destY * w + destX) * 4;
      pixels[di] = block[si];
      pixels[di + 1] = block[si + 1];
      pixels[di + 2] = block[si + 2];
      pixels[di + 3] = block[si + 3];
    }
  }
}

// ── RGB Shift ────────────────────────────────────────────

function applyRgbShift(
  pixels: Uint8ClampedArray, w: number, h: number,
  rx: number, ry: number, bx: number, by: number,
  pulse: boolean, t: number,
): void {
  const factor = pulse ? Math.sin(t * 0.7) * 0.5 + 0.5 : 1;
  const rdx = Math.round(rx * factor);
  const rdy = Math.round(ry * factor);
  const bdx = Math.round(bx * factor);
  const bdy = Math.round(by * factor);
  if (rdx === 0 && rdy === 0 && bdx === 0 && bdy === 0) return;

  const orig = new Uint8ClampedArray(pixels);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;

      // Red channel from offset position
      const rsx = ((x - rdx) % w + w) % w;
      const rsy = ((y - rdy) % h + h) % h;
      pixels[di] = orig[(rsy * w + rsx) * 4];

      // Green stays in place (anchor)

      // Blue channel from offset position
      const bsx = ((x - bdx) % w + w) % w;
      const bsy = ((y - bdy) % h + h) % h;
      pixels[di + 2] = orig[(bsy * w + bsx) * 4 + 2];
    }
  }
}

// ── Channel Dropout ──────────────────────────────────────

function applyChannelDropout(
  pixels: Uint8ClampedArray, w: number, h: number,
  channel: 0 | 1 | 2,
): void {
  for (let i = channel; i < w * h * 4; i += 4) {
    pixels[i] = 0;
  }
}

// ── Static Noise ─────────────────────────────────────────

function applyStatic(
  pixels: Uint8ClampedArray, w: number, h: number,
  density: number, color: HackatarColor, prng: Prng,
): void {
  const count = Math.floor(w * h * density);
  for (let i = 0; i < count; i++) {
    const x = prng.int(0, w - 1);
    const y = prng.int(0, h - 1);
    const idx = (y * w + x) * 4;
    const bright = prng.float(0.3, 1.0);
    pixels[idx] = (color.r * bright) | 0;
    pixels[idx + 1] = (color.g * bright) | 0;
    pixels[idx + 2] = (color.b * bright) | 0;
    pixels[idx + 3] = 255;
  }
}

// ── Brightness Surge ─────────────────────────────────────

function applyBrightnessSurge(
  pixels: Uint8ClampedArray, w: number, h: number,
  frameIndex: number, peakFrame: number, totalFrames: number,
  intensity: number,
): void {
  // Gaussian-ish falloff from peak frame
  const dist = Math.min(
    Math.abs(frameIndex - peakFrame),
    totalFrames - Math.abs(frameIndex - peakFrame),
  );
  const falloff = Math.exp(-(dist * dist) / 4);
  const boost = 1 + intensity * falloff;
  if (boost <= 1.01) return;

  for (let i = 0; i < w * h * 4; i += 4) {
    pixels[i] = Math.min(255, (pixels[i] * boost) | 0);
    pixels[i + 1] = Math.min(255, (pixels[i + 1] * boost) | 0);
    pixels[i + 2] = Math.min(255, (pixels[i + 2] * boost) | 0);
  }
}
