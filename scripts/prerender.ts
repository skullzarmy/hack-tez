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

function metaForRoute(route: string): { title: string; description: string; image?: string } {
    const staticMeta = STATIC_ROUTE_META[route];
    if (staticMeta) return { title: staticMeta.title, description: staticMeta.description, image: staticMeta.image };
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
    full = applyPageMetaToHtml(
        full,
        { title: meta.title, description: meta.description, path: route, image: meta.image },
        SITE_URL,
    );

    const dir = join(root, "dist", route.slice(1));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), full);
    console.log(`  ✓ ${route}  (${meta.title})`);
    count++;
}

console.log(`\nPre-rendered ${count} routes.`);

// ---------------------------------------------------------------------------
// Generate dist/sitemap.xml — overwrites the static fallback in public/.
// Combines all prerendered routes, key SPA routes, and the live game catalogue
// (fetched from the arcade API; safe-falls back to empty if unreachable).
// ---------------------------------------------------------------------------

interface SitemapEntry {
    loc: string;
    changefreq?: "hourly" | "daily" | "weekly" | "monthly" | "yearly";
    priority?: string;
    lastmod?: string;
}

const today = new Date().toISOString().slice(0, 10);

const staticEntries: SitemapEntry[] = [
    { loc: "/",            changefreq: "daily",   priority: "1.0", lastmod: today },
    { loc: "/arcade",      changefreq: "hourly",  priority: "0.9", lastmod: today },
    { loc: "/arcade/submit", changefreq: "monthly", priority: "0.5" },
    { loc: "/wiki",        changefreq: "daily",   priority: "0.8" },
    { loc: "/hackers",     changefreq: "daily",   priority: "0.8" },
    { loc: "/chat",        changefreq: "weekly",  priority: "0.6" },
    { loc: "/developers",  changefreq: "monthly", priority: "0.7" },
    { loc: "/skills",      changefreq: "weekly",  priority: "0.7" },
    { loc: "/manifesto",   changefreq: "monthly", priority: "0.6" },
    { loc: "/policies",    changefreq: "yearly",  priority: "0.3" },
    ...skillSlugs.map<SitemapEntry>((slug) => ({
        loc: `/skills/${slug}`,
        changefreq: "monthly",
        priority: "0.5",
    })),
];

// Live game catalogue — soft failure if the API isn't reachable from CI.
const gameEntries: SitemapEntry[] = [];
const apiBase = (process.env.VITE_API_BASE_URL || `${SITE_URL}/api/v1/arcade`).replace(/\/$/, "");
try {
    const res = await fetch(`${apiBase}/games`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
        const body = (await res.json()) as { games?: Array<{ slug: string; updatedAt?: string }> };
        for (const g of body.games ?? []) {
            gameEntries.push({
                loc: `/arcade/play/${encodeURIComponent(g.slug)}`,
                changefreq: "weekly",
                priority: "0.6",
                lastmod: g.updatedAt?.slice(0, 10),
            });
        }
        console.log(`\nIncluded ${gameEntries.length} games in sitemap from ${apiBase}/games`);
    } else {
        console.warn(`\nSitemap: arcade API responded ${res.status} — skipping game entries`);
    }
} catch (err) {
    console.warn(`\nSitemap: could not reach arcade API (${(err as Error).message}) — skipping game entries`);
}

const allEntries = [...staticEntries, ...gameEntries];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries
    .map((e) => {
        const tags = [`<loc>${SITE_URL}${e.loc}</loc>`];
        if (e.lastmod) tags.push(`<lastmod>${e.lastmod}</lastmod>`);
        if (e.changefreq) tags.push(`<changefreq>${e.changefreq}</changefreq>`);
        if (e.priority) tags.push(`<priority>${e.priority}</priority>`);
        return `  <url>${tags.join("")}</url>`;
    })
    .join("\n")}
</urlset>
`;

writeFileSync(join(root, "dist/sitemap.xml"), xml);
console.log(`Wrote dist/sitemap.xml (${allEntries.length} URLs).`);
