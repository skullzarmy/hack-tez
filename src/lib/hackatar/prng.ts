/**
 * mulberry32 — seeded 32-bit PRNG.
 * Fast, simple, deterministic. Same seed → same sequence, always.
 */
export function createPrng(seed: number) {
  let s = seed | 0;

  /** Returns a float in [0, 1) */
  function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive */
  function int(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  /** Float in [min, max) */
  function float(min: number, max: number): number {
    return next() * (max - min) + min;
  }

  /** Pick from array */
  function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(next() * arr.length)];
  }

  /** Weighted selection. weights[i] corresponds to items[i]. */
  function weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Boolean with given probability (0-1) */
  function chance(probability: number): boolean {
    return next() < probability;
  }

  return { next, int, float, pick, weighted, chance };
}

export type Prng = ReturnType<typeof createPrng>;

/** Derive a 32-bit seed from an opHash string */
export function seedFromHash(hash: string): number {
  const clean = hash.replace(/^op/, "");
  // Use first 8 hex chars as uint32
  const n = parseInt(clean.slice(0, 8), 16);
  if (isNaN(n)) {
    // Fallback: hash the whole string
    let h = 0;
    for (let i = 0; i < hash.length; i++) {
      h = ((h << 5) - h + hash.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
  return n >>> 0;
}
