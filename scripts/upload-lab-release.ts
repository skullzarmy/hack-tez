/**
 * Upload a Labs release zip to Netlify Blobs via the Netlify CLI.
 *
 * Stores under blob store `labs-releases` with key `<slug>/<basename(zip)>` —
 * the same key the `/api/labs/download` function reads. Reusable for any
 * future FAFOlab release (extension, CLI, app, etc.).
 *
 * Usage:
 *   tsx scripts/upload-lab-release.ts <slug> <local-zip-path>
 *
 * Example:
 *   tsx scripts/upload-lab-release.ts cloudnine ~/development/cloudnine/cloudnine-v0.4.0.zip
 *
 * Requires the Netlify CLI to be installed and the repo linked
 * (`netlify link`). Auth uses whatever the CLI is already signed into.
 *
 * After uploading, update the lab's frontmatter (`version:`, `file:`) and
 * deploy — the function serves whatever filename the frontmatter points at.
 */
import { spawnSync, execSync } from "node:child_process";
import { statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

function fail(msg: string): never {
    console.error(msg);
    process.exit(1);
}

const [, , slugArg, fileArg] = process.argv;
if (!slugArg || !fileArg) {
    fail("Usage: tsx scripts/upload-lab-release.ts <slug> <local-zip-path>");
}

const slug = slugArg.toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)) {
    fail(`Invalid slug "${slug}" — must be lowercase alphanumeric + hyphens, 1–40 chars.`);
}

const zipPath = isAbsolute(fileArg) ? fileArg : resolve(process.cwd(), fileArg);
const st = statSync(zipPath);
if (!st.isFile()) fail(`Not a file: ${zipPath}`);

const filename = basename(zipPath);
if (!/^[A-Za-z0-9._-]{1,120}$/.test(filename)) {
    fail(`Invalid filename "${filename}" — keep it to alphanumerics, dots, dashes, underscores.`);
}

try {
    execSync("netlify --version", { stdio: "ignore" });
} catch {
    fail("Netlify CLI not found on PATH. Install with: npm i -g netlify-cli");
}

const key = `${slug}/${filename}`;
const sizeKb = (st.size / 1024).toFixed(1);
console.log(`→ uploading ${zipPath} (${sizeKb} KB) → labs-releases:${key}`);

const result = spawnSync(
    "netlify",
    ["blobs:set", "labs-releases", key, "--input", zipPath, "--force"],
    { stdio: "inherit" },
);

if (result.status !== 0) {
    fail(`netlify blobs:set exited with code ${result.status ?? "unknown"}`);
}

console.log(`✓ uploaded labs-releases:${key}`);
console.log(`  next: confirm src/labs/${slug}.md has \`file: ${filename}\` and deploy.`);
