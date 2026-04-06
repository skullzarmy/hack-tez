import type { Prng } from "./prng.ts";
import type { HackatarColor } from "./palette.ts";
import { PRIMARY_COLORS, COLOR_WEIGHTS } from "./palette.ts";

// ── Emitter ──────────────────────────────────────────────

export interface Emitter {
  x: number;        // fractional grid position
  y: number;
  frequency: number; // wave density
  amplitude: number; // wave strength
  phase: number;     // starting phase offset
  decay: number;     // distance falloff
}

// ── Glitch effect configs ────────────────────────────────

export interface RowJitterConfig {
  type: "row-jitter";
  intensity: number;   // max px offset
  rowCount: number;    // how many rows affected per frame
  drift: number;       // how fast the affected rows move through the loop
}

export interface FrameSplitConfig {
  type: "frame-split";
  bands: number;       // 2-3 horizontal bands
  maxOffset: number;   // max px shift per band
}

export interface BlockDisplaceConfig {
  type: "block-displace";
  x: number;           // block position (0-1 normalized)
  y: number;
  w: number;           // block size (0-1 normalized)
  h: number;
  offsetX: number;     // displacement amount
  offsetY: number;
}

export interface RgbShiftConfig {
  type: "rgb-shift";
  rx: number; ry: number;  // red channel offset
  gx: number; gy: number;  // green (usually 0,0 — anchor)
  bx: number; by: number;  // blue channel offset
  pulse: boolean;          // does shift intensity oscillate?
}

export interface ChannelDropoutConfig {
  type: "channel-dropout";
  channel: 0 | 1 | 2;     // r/g/b
  frames: number[];        // which frame indices drop out
}

export interface StaticNoiseConfig {
  type: "static";
  density: number;         // 0-1, fraction of cells that get noise
  frames: number[];        // which frames get static bursts
}

export interface ScanlinesConfig {
  type: "scanlines";
  spacing: number;         // every N pixels
  opacity: number;         // 0.1-0.3
}

export interface FrameStutterConfig {
  type: "frame-stutter";
  holdFrames: number[];    // which frames hold (repeat previous)
}

export interface BrightnessSurgeConfig {
  type: "brightness-surge";
  peakFrame: number;       // which frame is the brightest
  intensity: number;       // how much extra brightness (0.1-0.4)
}

export type GlitchEffect =
  | RowJitterConfig
  | FrameSplitConfig
  | BlockDisplaceConfig
  | RgbShiftConfig
  | ChannelDropoutConfig
  | StaticNoiseConfig
  | ScanlinesConfig
  | FrameStutterConfig
  | BrightnessSurgeConfig;

// ── Full trait set ───────────────────────────────────────

export interface HackatarTraits {
  gridSize: number;
  emitters: Emitter[];
  color: HackatarColor;
  glitchEffects: GlitchEffect[];
  cellGap: number;         // px gap between cells
  cellRadius: number;      // border-radius on cells (0 = square, 1 = full round)
}

// ── Trait selection ──────────────────────────────────────

const TOTAL_FRAMES = 30;

export function selectTraits(prng: Prng): HackatarTraits {
  // Grid
  const gridSize = prng.int(8, 14);

  // Color
  const color = prng.weighted([...PRIMARY_COLORS], [...COLOR_WEIGHTS]);

  // Emitters
  const emitterCount = prng.int(2, 5);
  const emitters: Emitter[] = [];
  for (let i = 0; i < emitterCount; i++) {
    emitters.push({
      x: prng.float(0, gridSize),
      y: prng.float(0, gridSize),
      frequency: prng.float(0.3, 2.0),
      amplitude: prng.float(0.4, 1.0),
      phase: prng.float(0, Math.PI * 2),
      decay: prng.float(0.02, 0.15),
    });
  }

  // Cell styling — LED pixel feel
  const cellGap = prng.float(0.8, 1.6);
  const cellRadius = prng.float(0.15, 0.35);

  // Glitch effects
  const effects: GlitchEffect[] = [];

  // Always 1 spatial
  const spatialType = prng.weighted(
    ["row-jitter", "frame-split", "block-displace"] as const,
    [50, 30, 20],
  );
  if (spatialType === "row-jitter") {
    effects.push({
      type: "row-jitter",
      intensity: prng.float(1, 4),
      rowCount: prng.int(1, 3),
      drift: prng.float(0.5, 2.0),
    });
  } else if (spatialType === "frame-split") {
    effects.push({
      type: "frame-split",
      bands: prng.int(2, 3),
      maxOffset: prng.float(2, 6),
    });
  } else {
    effects.push({
      type: "block-displace",
      x: prng.float(0.1, 0.7),
      y: prng.float(0.1, 0.7),
      w: prng.float(0.15, 0.35),
      h: prng.float(0.15, 0.35),
      offsetX: prng.float(-4, 4),
      offsetY: prng.float(-2, 2),
    });
  }

  // 80% chance: 1 color effect
  if (prng.chance(0.8)) {
    const colorType = prng.weighted(
      ["rgb-shift", "channel-dropout"] as const,
      [70, 30],
    );
    if (colorType === "rgb-shift") {
      const strength = prng.float(1, 3);
      const angle = prng.float(0, Math.PI * 2);
      effects.push({
        type: "rgb-shift",
        rx: Math.cos(angle) * strength,
        ry: Math.sin(angle) * strength,
        gx: 0, gy: 0,
        bx: Math.cos(angle + Math.PI) * strength,
        by: Math.sin(angle + Math.PI) * strength,
        pulse: prng.chance(0.6),
      });
    } else {
      const channel = prng.int(0, 2) as 0 | 1 | 2;
      const frameCount = prng.int(1, 3);
      const frames: number[] = [];
      for (let i = 0; i < frameCount; i++) {
        frames.push(prng.int(0, TOTAL_FRAMES - 1));
      }
      effects.push({ type: "channel-dropout", channel, frames });
    }
  }

  // 70% chance: 1 noise effect
  if (prng.chance(0.7)) {
    const noiseType = prng.weighted(
      ["scanlines", "static"] as const,
      [55, 45],
    );
    if (noiseType === "scanlines") {
      effects.push({
        type: "scanlines",
        spacing: prng.int(2, 4),
        opacity: prng.float(0.1, 0.3),
      });
    } else {
      const burstCount = prng.int(2, 5);
      const frames: number[] = [];
      for (let i = 0; i < burstCount; i++) {
        frames.push(prng.int(0, TOTAL_FRAMES - 1));
      }
      effects.push({
        type: "static",
        density: prng.float(0.05, 0.2),
        frames,
      });
    }
  }

  // 40% chance: 1 temporal effect
  if (prng.chance(0.4)) {
    const tempType = prng.weighted(
      ["frame-stutter", "brightness-surge"] as const,
      [50, 50],
    );
    if (tempType === "frame-stutter") {
      const holdCount = prng.int(1, 3);
      const holdFrames: number[] = [];
      for (let i = 0; i < holdCount; i++) {
        holdFrames.push(prng.int(0, TOTAL_FRAMES - 1));
      }
      effects.push({ type: "frame-stutter", holdFrames });
    } else {
      effects.push({
        type: "brightness-surge",
        peakFrame: prng.int(0, TOTAL_FRAMES - 1),
        intensity: prng.float(0.1, 0.4),
      });
    }
  }

  return { gridSize, emitters, color, glitchEffects: effects, cellGap, cellRadius };
}
