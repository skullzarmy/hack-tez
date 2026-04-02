/**
 * Pre-render static routes to HTML after the Vite build.
 * The client bundle stays in dist/ and hydrates normally.
 * This script injects server-rendered HTML into the index.html shell.
 *
 * Usage (run automatically via npm run build):
 *   tsx scripts/prerender.ts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");

// Derive skill slugs automatically from src/skills/ filenames
const skillSlugs = readdirSync(join(root, "src/skills"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));

// Routes to pre-render — these are static and benefit from SSG
const routes = ["/manifesto", "/policies", "/developers", "/skills", ...skillSlugs.map((slug) => `/skills/${slug}`)];

// Import the server bundle built by: vite build --ssr src/entry-server.tsx --outDir dist-server
const serverEntry = join(root, "dist-server/entry-server.js");
const { render } = (await import(serverEntry)) as { render: (url: string) => Promise<string> };

const template = readFileSync(join(root, "dist/index.html"), "utf-8");

let count = 0;
for (const route of routes) {
    const html = await render(route);
    const full = template.replace('<div id="root"></div>', `<div id="root">${html}</div>`);

    // Write to dist/<route>/index.html so Netlify serves it as static HTML
    const dir = join(root, "dist", route.slice(1)); // strip leading /
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), full);
    console.log(`  ✓ ${route}`);
    count++;
}

console.log(`\nPre-rendered ${count} routes.`);
