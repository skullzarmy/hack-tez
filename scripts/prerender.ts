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
import { applyPageMetaToHtml } from "../src/lib/pageMeta";
import { STATIC_ROUTE_META } from "../src/lib/staticRouteMeta";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const SITE_URL = (process.env.VITE_SITE_URL || "https://hacktez.com").replace(/\/$/, "");

function parseFrontmatter(raw: string): { title?: string; description?: string } {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};
    const out: { title?: string; description?: string } = {};
    for (const line of match[1].split("\n")) {
        const m = line.match(/^(title|description):\s*(.+)$/);
        if (!m) continue;
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        out[m[1] as "title" | "description"] = val;
    }
    return out;
}

interface SkillMeta {
    slug: string;
    title: string;
    description: string;
}

const skillsDir = join(root, "src/skills");
const skillSlugs = readdirSync(skillsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));

const skills: SkillMeta[] = skillSlugs.map((slug) => {
    const fm = parseFrontmatter(readFileSync(join(skillsDir, `${slug}.md`), "utf8"));
    return {
        slug,
        title: fm.title || slug,
        description: fm.description || `${fm.title || slug} reference docs for the hack.tez stack.`,
    };
});

const routes = ["/manifesto", "/policies", "/developers", "/skills", "/arcade", ...skillSlugs.map((slug) => `/skills/${slug}`)];

const serverEntry = join(root, "dist-server/entry-server.js");
const { render } = (await import(serverEntry)) as { render: (url: string) => Promise<string> };

const template = readFileSync(join(root, "dist/index.html"), "utf-8");

function metaForRoute(route: string): { title: string; description: string } {
    const staticMeta = STATIC_ROUTE_META[route];
    if (staticMeta) return { title: staticMeta.title, description: staticMeta.description };
    if (route.startsWith("/skills/")) {
        const slug = route.slice("/skills/".length);
        const skill = skills.find((s) => s.slug === slug);
        if (skill) {
            return {
                title: `${skill.title} — Skills — hack.tez`,
                description: skill.description,
            };
        }
    }
    return { title: "hack.tez", description: "Free Tezos subdomains for hackers, builders, artists, and tezonians." };
}

let count = 0;
for (const route of routes) {
    const html = await render(route);
    let full = template.replace('<div id="root"></div>', `<div id="root">${html}</div>`);

    const meta = metaForRoute(route);
    full = applyPageMetaToHtml(full, { title: meta.title, description: meta.description, path: route }, SITE_URL);

    const dir = join(root, "dist", route.slice(1));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), full);
    console.log(`  ✓ ${route}  (${meta.title})`);
    count++;
}

console.log(`\nPre-rendered ${count} routes.`);
