/**
 * Pack a Hackcade game directory into a clean zip ready for upload.
 *
 * Usage:
 *   npx tsx scripts/pack-game.ts <game-dir> [--out <path>]
 *   npx tsx scripts/pack-game.ts whack-a-reggie
 *   npx tsx scripts/pack-game.ts hackcade/games/whack-a-reggie
 *
 * If <game-dir> isn't an absolute or existing path, looks under hackcade/games/.
 * Output defaults to dist-zips/<basename>.zip.
 *
 * Excludes: .DS_Store, *.zip, .git*, node_modules, hackcade-sdk.js (server injects canonical),
 * any dotfiles, common editor turds.
 *
 * Verifies index.html exists at the zip root and contains a <script type="module">
 * tag for the entry. Refuses to pack if index.html missing.
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, join, basename, isAbsolute } from "node:path";
import { zipSync, strToU8 } from "fflate";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const GAMES_ROOT = resolve(REPO_ROOT, "hackcade/games");
const DEFAULT_OUT_DIR = resolve(REPO_ROOT, "dist-zips");

const EXCLUDE_NAMES = new Set([
    ".DS_Store",
    "Thumbs.db",
    "node_modules",
    ".git",
    ".gitignore",
    "hackcade-sdk.js", // server injects the canonical SDK; never ship a local copy
]);

const EXCLUDE_EXTS = new Set([".zip", ".swp", ".swo"]);

function isExcluded(name: string): boolean {
    if (EXCLUDE_NAMES.has(name)) return true;
    if (name.startsWith(".")) return true;
    const dot = name.lastIndexOf(".");
    if (dot >= 0 && EXCLUDE_EXTS.has(name.slice(dot).toLowerCase())) return true;
    return false;
}

function walk(dir: string, base: string, out: Record<string, Uint8Array>) {
    for (const entry of readdirSync(dir)) {
        if (isExcluded(entry)) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            walk(full, base, out);
        } else if (st.isFile()) {
            const rel = relative(base, full).split("\\").join("/");
            out[rel] = readFileSync(full);
        }
    }
}

function resolveGameDir(input: string): string {
    if (isAbsolute(input) && existsSync(input)) return input;
    const cwdPath = resolve(process.cwd(), input);
    if (existsSync(cwdPath)) return cwdPath;
    const gamesPath = resolve(GAMES_ROOT, input);
    if (existsSync(gamesPath)) return gamesPath;
    throw new Error(`Game directory not found: ${input}`);
}

function parseArgs(argv: string[]): { gameDir: string; outPath?: string } {
    const args = argv.slice(2);
    if (args.length === 0) {
        console.error("Usage: pack-game.ts <game-dir> [--out <path>]");
        process.exit(1);
    }
    let gameDir = "";
    let outPath: string | undefined;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--out" || a === "-o") {
            outPath = args[++i];
        } else if (!gameDir) {
            gameDir = a;
        }
    }
    return { gameDir, outPath };
}

const { gameDir: inputDir, outPath: outArg } = parseArgs(process.argv);
const gameDir = resolveGameDir(inputDir);
const name = basename(gameDir);

const files: Record<string, Uint8Array> = {};
walk(gameDir, gameDir, files);

if (!files["index.html"]) {
    console.error(`✗ ${name}: missing index.html at zip root`);
    process.exit(1);
}

const html = new TextDecoder().decode(files["index.html"]);
const moduleScripts = html.match(/<script\b[^>]*type\s*=\s*["']module["'][^>]*>/gi) ?? [];
if (moduleScripts.length === 0) {
    console.warn(
        `⚠ ${name}: index.html has no <script type="module"> tag. ` +
            `Game.js using import statements will fail unless loaded as a module.`,
    );
}

const sortedFiles: Record<string, Uint8Array> = {};
for (const k of Object.keys(files).sort()) sortedFiles[k] = files[k];

const zipped = zipSync(sortedFiles, { level: 9 });

const outPath = outArg
    ? isAbsolute(outArg)
        ? outArg
        : resolve(process.cwd(), outArg)
    : resolve(DEFAULT_OUT_DIR, `${name}.zip`);

mkdirSync(resolve(outPath, ".."), { recursive: true });
writeFileSync(outPath, zipped);

const sizeKb = (zipped.byteLength / 1024).toFixed(1);
console.log(`✓ ${name}: packed ${Object.keys(files).length} files → ${outPath} (${sizeKb} KB)`);
for (const k of Object.keys(sortedFiles)) {
    console.log(`    ${k}`);
}
// strToU8 import suppressed by type-check; consumed below if needed by future hooks
void strToU8;
