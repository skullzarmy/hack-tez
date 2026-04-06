/** Curated color palette for hackatars — dark native, neon accents. */

export interface HackatarColor {
  hex: string;
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): HackatarColor {
  const n = parseInt(hex.slice(1), 16);
  return { hex, r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Primary colors — the identity color of each hackatar */
export const PRIMARY_COLORS = [
  hexToRgb("#4dff91"), // Terminal Green
  hexToRgb("#00e5ff"), // Electric Cyan
  hexToRgb("#ffc107"), // Phosphor Amber
  hexToRgb("#ff00ff"), // Hot Magenta
  hexToRgb("#e0e0e0"), // Ghost White
  hexToRgb("#ff6b6b"), // Coral
  hexToRgb("#74c0fc"), // Ice Blue
  hexToRgb("#d4a5ff"), // Lavender
  hexToRgb("#c6ff00"), // Acid Lime
  hexToRgb("#ffd740"), // Gold
] as const;

/** Weights for color selection (must match PRIMARY_COLORS order) */
export const COLOR_WEIGHTS = [
  20, // Terminal Green — signature hack.tez
  15, // Electric Cyan
  12, // Phosphor Amber
  10, // Hot Magenta
  10, // Ghost White
  8,  // Coral
  8,  // Ice Blue
  7,  // Lavender
  5,  // Acid Lime
  5,  // Gold
] as const;
