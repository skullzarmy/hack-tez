/**
 * Generate a square hack.tez profile avatar (e.g. for the @hacktez.com Bluesky
 * account). Stacks "HACK" over "TEZ" using the same Space Mono Bold styling as
 * the site nav logo — solid white "HACK", 55% opacity "TEZ", black background.
 *
 * Renders one high-res PNG (2048) and one downscaled PNG (640) into scripts/out/.
 *
 *   tsx scripts/gen-bsky-avatar.ts
 */
import { Resvg } from "@resvg/resvg-js";
import opentype from "opentype.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { textToPath } from "../netlify/functions/textToPath";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const OUT_DIR = resolve(__dirname, "out");
const SIZES = [2048, 640];

const BG = "#000000";
const FG = "#ffffff";
const TEZ_OPACITY = 0.55;
const LETTER_SPACING_EM = 0.05;

// Load the same Space Mono Bold the site uses, so we can measure actual glyph
// advances rather than guessing the em width.
function loadFont(): opentype.Font {
    const candidates = [
        resolve(
            process.cwd(),
            "node_modules/@fontsource/space-mono/files/space-mono-latin-700-normal.woff",
        ),
    ];
    for (const path of candidates) {
        if (existsSync(path)) return opentype.loadSync(path);
    }
    throw new Error("space-mono-latin-700 not found in node_modules");
}

const font = loadFont();

function measureWidth(text: string, fontSize: number, letterSpacing: number): number {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        const glyph = font.charToGlyph(text[i]);
        width += (glyph.advanceWidth || 0) * (fontSize / font.unitsPerEm);
        if (i < text.length - 1) width += letterSpacing;
    }
    return width;
}

/** Pick a fontSize so `text` spans exactly `targetWidth` with em-relative letter spacing. */
function fitFontSize(text: string, targetWidth: number): number {
    // Measure at fontSize=1000, then linearly scale (advances scale with fontSize).
    const probe = 1000;
    const w = measureWidth(text, probe, probe * LETTER_SPACING_EM);
    return (targetWidth / w) * probe;
}

/**
 * Lay out `text` so its glyphs are horizontally stretched by `scaleX` while
 * letter-spacing stays at the same absolute pixel value. Returns a single SVG
 * fragment with one transformed `<path>` per glyph, plus the total width.
 */
function buildStretchedLine(opts: {
    text: string;
    centerX: number;
    baselineY: number;
    fontSize: number;
    letterSpacing: number;
    scaleX: number;
    fill: string;
    fillOpacity?: number;
}): { svg: string; width: number } {
    const { text, centerX, baselineY, fontSize, letterSpacing, scaleX, fill, fillOpacity } = opts;

    // Compute glyph advances at the base fontSize (unscaled), then x-stretch
    // each glyph in place. Spacing between glyphs stays in absolute units.
    const glyphs = [...text].map((ch) => {
        const g = font.charToGlyph(ch);
        const advance = (g.advanceWidth || 0) * (fontSize / font.unitsPerEm);
        return { glyph: g, advance };
    });

    const totalWidth =
        glyphs.reduce((sum, { advance }) => sum + advance * scaleX, 0) +
        letterSpacing * (glyphs.length - 1);

    let cursor = centerX - totalWidth / 2;
    const opacityAttr =
        fillOpacity != null && fillOpacity !== 1 ? ` fill-opacity="${fillOpacity}"` : "";

    const paths = glyphs.map(({ glyph, advance }) => {
        // Generate the glyph path centered at (0, baselineY), then translate +
        // scale into final position so scaleX widens just the glyph, not its
        // own internal advance.
        const pathData = glyph.getPath(0, baselineY, fontSize).toPathData(2);
        // Transform: translate to cursor, then scale x about that translate point
        // (which is x=0 in the local glyph coords). Apply scale around (cursor, baselineY)
        // to keep the baseline anchored. Using matrix(a,b,c,d,e,f) for clarity:
        //   x' = scaleX * x + cursor
        //   y' = y
        const transform = `matrix(${scaleX} 0 0 1 ${cursor} 0)`;
        cursor += advance * scaleX + letterSpacing;
        return `<path d="${pathData}" fill="${fill}"${opacityAttr} transform="${transform}"/>`;
    });

    return { svg: paths.join(""), width: totalWidth };
}

function buildSvg(canvas: number): string {
    // Padding: keep widest line at ~72% of canvas (was 84%) so the icon
    // has visible breathing room when shown small / circle-cropped.
    const usableWidth = canvas * 0.72;
    const fontSize = fitFontSize("HACK", usableWidth);
    const letterSpacing = fontSize * LETTER_SPACING_EM;

    // Pick a horizontal scale for TEZ so the 3 stretched glyphs (with the
    // same letter-spacing as HACK) span the same visual width as HACK.
    //   hackWidth = 4·g + 3·s
    //   tezWidth  = 3·g·k + 2·s
    //   solve hackWidth = tezWidth for k:
    const glyphAdvance = (font.charToGlyph("H").advanceWidth || 0) * (fontSize / font.unitsPerEm);
    const hackWidth = 4 * glyphAdvance + 3 * letterSpacing;
    const tezScaleX = (hackWidth - 2 * letterSpacing) / (3 * glyphAdvance);

    // Vertical layout — Space Mono cap height ≈ 0.72em, line-height 0.9em
    // packs the two lines snug. Vertically center the whole block.
    const lineHeight = fontSize * 0.9;
    const capHeight = fontSize * 0.72;
    const blockHeight = lineHeight + capHeight;
    const blockTop = (canvas - blockHeight) / 2;
    const baseline1 = blockTop + capHeight;
    const baseline2 = baseline1 + lineHeight;

    const hackPath = textToPath({
        text: "HACK",
        x: canvas / 2,
        y: baseline1,
        fontSize,
        fill: FG,
        fontWeight: 700,
        letterSpacing,
        textAnchor: "middle",
    });

    const { svg: tezPath } = buildStretchedLine({
        text: "TEZ",
        centerX: canvas / 2,
        baselineY: baseline2,
        fontSize,
        letterSpacing,
        scaleX: tezScaleX,
        fill: FG,
        fillOpacity: TEZ_OPACITY,
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
    <rect width="${canvas}" height="${canvas}" fill="${BG}"/>
    ${hackPath}
    ${tezPath}
</svg>`;
}

function render(size: number, outPath: string): void {
    // Always build the SVG at the target size — text-to-path output is
    // resolution-independent, but rendering at native size avoids any subpixel
    // weirdness from resvg's fitTo scaling.
    const svg = buildSvg(size);
    const png = new Resvg(svg, {
        fitTo: { mode: "width", value: size },
    })
        .render()
        .asPng();
    writeFileSync(outPath, png);
    console.log(`  ✓ ${outPath} (${size}×${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}

mkdirSync(OUT_DIR, { recursive: true });
console.log("Generating hack.tez Bluesky avatar…");
for (const size of SIZES) {
    render(size, resolve(OUT_DIR, `bsky-avatar-${size}.png`));
}
console.log("Done.");
