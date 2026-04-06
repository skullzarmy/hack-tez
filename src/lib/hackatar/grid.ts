import type { Emitter } from "./traits.ts";

/**
 * Compute cell brightness for the entire grid at time t.
 * Returns a flat Float32Array of gridSize×gridSize values in [0, 1].
 */
export function computeGrid(
  gridSize: number,
  emitters: readonly Emitter[],
  t: number,
): Float32Array {
  const cells = new Float32Array(gridSize * gridSize);
  const TWO_PI = Math.PI * 2;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Cell center in grid space
      const cx = col + 0.5;
      const cy = row + 0.5;

      let val = 0;
      for (let e = 0; e < emitters.length; e++) {
        const em = emitters[e];
        const dx = cx - em.x;
        const dy = cy - em.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        val +=
          em.amplitude *
          Math.sin(TWO_PI * em.frequency * dist - em.phase + t) *
          Math.exp(-em.decay * dist);
      }

      // Normalize: the raw sum can exceed [-1, 1] with multiple emitters.
      // Use a soft sigmoid-like clamp for smoother falloff.
      cells[row * gridSize + col] = Math.max(0, Math.min(1, (val + 1) / 2));
    }
  }

  return cells;
}
