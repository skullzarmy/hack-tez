/**
 * Convert text to SVG paths using opentype.js
 * This eliminates font rendering issues - text becomes vector paths
 */
import opentype from "opentype.js";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Cache loaded fonts
let font400: opentype.Font | null = null;
let font700: opentype.Font | null = null;

function getFontPath(weight: 400 | 700): string {
    const fileName = weight === 400 ? "space-mono-latin-400-normal.woff" : "space-mono-latin-700-normal.woff";

    const candidates = [
        `/var/task/node_modules/@fontsource/space-mono/files/${fileName}`,
        resolve(process.cwd(), `node_modules/@fontsource/space-mono/files/${fileName}`),
    ];

    for (const path of candidates) {
        if (existsSync(path)) return path;
    }
    throw new Error(`Font file not found: ${fileName}`);
}

function getFont(weight: 400 | 700): opentype.Font {
    if (weight === 400 && font400) return font400;
    if (weight === 700 && font700) return font700;

    const path = getFontPath(weight);
    const font = opentype.loadSync(path);

    if (weight === 400) font400 = font;
    else font700 = font;

    return font;
}

export interface TextToPathOptions {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fill: string;
    fillOpacity?: number;
    fontWeight?: 400 | 700;
    letterSpacing?: number;
    textAnchor?: "start" | "middle" | "end";
}

/**
 * Convert a text string to an SVG <path> element
 */
export function textToPath(opts: TextToPathOptions): string {
    const {
        text,
        x,
        y,
        fontSize,
        fill,
        fillOpacity = 1,
        fontWeight = 400,
        letterSpacing = 0,
        textAnchor = "start",
    } = opts;

    const font = getFont(fontWeight);

    // Calculate text width for text-anchor positioning
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
        const glyph = font.charToGlyph(text[i]);
        totalWidth += (glyph.advanceWidth || 0) * (fontSize / font.unitsPerEm);
        if (i < text.length - 1) {
            totalWidth += letterSpacing;
        }
    }

    // Adjust x based on text-anchor
    let startX = x;
    if (textAnchor === "end") {
        startX = x - totalWidth;
    } else if (textAnchor === "middle") {
        startX = x - totalWidth / 2;
    }

    // Build path data for each character
    let currentX = startX;
    const pathDatas: string[] = [];

    for (let i = 0; i < text.length; i++) {
        const glyph = font.charToGlyph(text[i]);
        const path = glyph.getPath(currentX, y, fontSize);
        const pathData = path.toPathData(2);
        if (pathData) {
            pathDatas.push(pathData);
        }
        currentX += (glyph.advanceWidth || 0) * (fontSize / font.unitsPerEm);
        if (i < text.length - 1) {
            currentX += letterSpacing;
        }
    }

    const combinedPath = pathDatas.join(" ");
    const opacity = fillOpacity !== 1 ? ` fill-opacity="${fillOpacity}"` : "";

    return `<path d="${combinedPath}" fill="${fill}"${opacity}/>`;
}

/**
 * Convert multiple tspan-like lines to paths
 */
export function textSpansToPath(opts: TextToPathOptions & { lines: string[]; lineHeight: number }): string {
    const { lines, lineHeight, ...baseOpts } = opts;

    return lines
        .map((line, index) => {
            const lineY = baseOpts.y + index * lineHeight;
            return textToPath({ ...baseOpts, text: line, y: lineY });
        })
        .join("\n    ");
}
