/**
 * Hackatar proof-of-concept — generates sample GIFs from the engine.
 *
 * Usage:
 *   npx tsx scripts/hackatar-poc.ts
 *
 * Writes to scripts/hackatar-output/ — one animated GIF + one static PNG per seed.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createPrng, seedFromHash, selectTraits, renderFrames } from "../src/lib/hackatar/index.ts";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;

const OUTPUT_DIR = join(import.meta.dirname!, "hackatar-output");
mkdirSync(OUTPUT_DIR, { recursive: true });

// Sample seeds — simulate different opHash values
const SAMPLES = [
  { name: "alpha",   hash: "opVg3H7iQK7bT8zR9a2N5kP1mL4jD6fE" },
  { name: "beta",    hash: "opXw9F2dC5kN8mQ1rJ4sB7tL3hP6gA0v" },
  { name: "gamma",   hash: "op1234567890abcdef1234567890abcdef" },
  { name: "delta",   hash: "opFFFFFFFF0000000011111111AAAAAAAA" },
  { name: "epsilon", hash: "op00000001deadbeefcafebabe42424242" },
  { name: "zeta",    hash: "opABCDEF1234567890ABCDEF1234567890" },
];

const SIZE = 192;

function writePngRaw(pixels: Uint8ClampedArray, width: number, height: number): Buffer {
  // Minimal uncompressed PNG — IHDR + IDAT (store, no compression) + IEND
  // For a real pipeline we'd use a proper PNG encoder, but for POC this works.
  // Actually let's use a simple PPM format which Preview can open, then we'll
  // do the GIF as the main deliverable.
  // PPM is simpler. But let's just focus on GIF — the first frame IS the static.
  // We'll write a BMP instead (no compression, universally supported).
  return writeBmp(pixels, width, height);
}

function writeBmp(pixels: Uint8ClampedArray, width: number, height: number): Buffer {
  const rowSize = width * 3;
  const paddedRowSize = Math.ceil(rowSize / 4) * 4;
  const pixelDataSize = paddedRowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize);

  // BMP header
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset

  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // negative = top-down
  buf.writeUInt16LE(1, 26);     // planes
  buf.writeUInt16LE(24, 28);    // bits per pixel
  buf.writeUInt32LE(0, 30);     // no compression
  buf.writeUInt32LE(pixelDataSize, 34);

  // Pixel data (BGR, top-down)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = 54 + y * paddedRowSize + x * 3;
      buf[di] = pixels[si + 2];     // B
      buf[di + 1] = pixels[si + 1]; // G
      buf[di + 2] = pixels[si];     // R
    }
  }

  return buf;
}

for (const sample of SAMPLES) {
  const seed = seedFromHash(sample.hash);
  const prng = createPrng(seed);
  const traits = selectTraits(prng);

  console.log(`\n── ${sample.name} (seed: ${seed}) ──`);
  console.log(`  grid: ${traits.gridSize}×${traits.gridSize}`);
  console.log(`  color: ${traits.color.hex}`);
  console.log(`  emitters: ${traits.emitters.length}`);
  console.log(`  glitch: [${traits.glitchEffects.map(e => e.type).join(", ")}]`);
  console.log(`  cellGap: ${traits.cellGap.toFixed(2)}, cellRadius: ${traits.cellRadius.toFixed(2)}`);

  const t0 = performance.now();
  const result = renderFrames(traits, SIZE);
  const renderMs = performance.now() - t0;
  console.log(`  rendered ${result.frames.length} frames in ${renderMs.toFixed(0)}ms`);

  // Encode animated GIF
  const t1 = performance.now();
  const gif = GIFEncoder();

  for (const frame of result.frames) {
    // quantize to 256 colors
    const palette = quantize(frame, 256, { format: "rgba4444" });
    const indexed = applyPalette(frame, palette, "rgba4444");
    gif.writeFrame(indexed, SIZE, SIZE, {
      palette,
      delay: result.frameDelayMs,
      transparent: true,
      transparentIndex: 0,
    });
  }

  gif.finish();
  const gifBytes = gif.bytes();
  const encodeMs = performance.now() - t1;
  console.log(`  GIF encoded in ${encodeMs.toFixed(0)}ms (${(gifBytes.length / 1024).toFixed(1)} KB)`);

  // Write GIF
  const gifPath = join(OUTPUT_DIR, `${sample.name}.gif`);
  writeFileSync(gifPath, gifBytes);
  console.log(`  → ${gifPath}`);

  // Write static first frame as BMP
  const bmpPath = join(OUTPUT_DIR, `${sample.name}.bmp`);
  writeFileSync(bmpPath, writePngRaw(result.frames[0], SIZE, SIZE));
  console.log(`  → ${bmpPath}`);
}

console.log(`\nDone! Open ${OUTPUT_DIR} to review.`);
