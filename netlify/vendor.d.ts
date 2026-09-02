// Ambient declarations for dependencies that ship no types of their own.
// Only the members this repo actually calls are declared, so a typo in a call
// site is still caught rather than silently widened to any.

declare module "opentype.js" {
    export interface Path {
        toPathData(decimalPlaces?: number): string;
    }

    export interface Glyph {
        advanceWidth: number;
        getPath(x: number, y: number, fontSize: number): Path;
    }

    export interface Font {
        unitsPerEm: number;
        charToGlyph(char: string): Glyph;
        getPath(text: string, x: number, y: number, fontSize: number): Path;
    }

    export function loadSync(path: string): Font;
    export function parse(buffer: ArrayBuffer): Font;

    const opentype: {
        loadSync: typeof loadSync;
        parse: typeof parse;
    };
    export default opentype;
}

declare module "gifenc" {
    export interface GifEncoder {
        writeFrame(
            index: Uint8Array,
            width: number,
            height: number,
            opts?: Record<string, unknown>,
        ): void;
        finish(): void;
        bytes(): Uint8Array;
        bytesView(): Uint8Array;
    }

    export function GIFEncoder(opts?: Record<string, unknown>): GifEncoder;
    export function quantize(
        rgba: Uint8Array | Uint8ClampedArray,
        maxColors: number,
        opts?: Record<string, unknown>,
    ): number[][];
    export function applyPalette(
        rgba: Uint8Array | Uint8ClampedArray,
        palette: number[][],
        format?: string,
    ): Uint8Array;

    const gifenc: {
        GIFEncoder: typeof GIFEncoder;
        quantize: typeof quantize;
        applyPalette: typeof applyPalette;
    };
    export default gifenc;
}
