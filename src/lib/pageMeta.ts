/**
 * Per-page metadata: title, description, canonical, OpenGraph, Twitter card,
 * optional og:image:alt, and optional JSON-LD structured data.
 *
 * Used both at build time (scripts/prerender.ts) and at runtime
 * (src/hooks/usePageMeta.ts) so static and SPA navigation stay in sync.
 */

export type StructuredData = Record<string, unknown>;

export interface PageMeta {
    title: string;
    description: string;
    /** Path portion only, e.g. "/manifesto". Will be combined with siteUrl. */
    path: string;
    /** Absolute or root-relative image URL. Defaults to /og-image.png. */
    image?: string;
    /** Alt text for the OG image — improves accessibility on social platforms. */
    imageAlt?: string;
    /**
     * Additional JSON-LD nodes injected on top of the site-level WebApplication
     * schema baked into index.html. Pass one or many — typically a
     * BreadcrumbList plus a page-specific type (ItemList, VideoGame, Article…).
     */
    structuredData?: StructuredData | StructuredData[];
}

const SITE_URL = (import.meta.env?.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") || "https://hacktez.com";
const PAGEMETA_LD_ATTR = "data-pagemeta-ld";

function absoluteUrl(path: string, siteUrl = SITE_URL): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function setMetaContent(selector: string, content: string): void {
    const el = document.head.querySelector<HTMLMetaElement>(selector);
    if (el) el.setAttribute("content", content);
}

function ensureMetaContent(
    selector: string,
    content: string,
    create: () => HTMLMetaElement,
): void {
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    if (!el) {
        el = create();
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

function setLinkHref(selector: string, href: string): void {
    const el = document.head.querySelector<HTMLLinkElement>(selector);
    if (el) el.setAttribute("href", href);
}

function setStructuredData(nodes: StructuredData[] | undefined): void {
    document.head.querySelectorAll(`script[${PAGEMETA_LD_ATTR}]`).forEach((n) => n.remove());
    if (!nodes || !nodes.length) return;
    for (const node of nodes) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute(PAGEMETA_LD_ATTR, "1");
        script.textContent = JSON.stringify(node);
        document.head.appendChild(script);
    }
}

function asArray<T>(v: T | T[] | undefined): T[] | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v : [v];
}

/** Apply meta to the live document. Safe to call repeatedly. */
export function applyPageMeta(meta: PageMeta): void {
    if (typeof document === "undefined") return;
    const url = absoluteUrl(meta.path);
    const image = absoluteUrl(meta.image ?? "/og-image.png");
    const imageAlt = meta.imageAlt ?? meta.title;

    document.title = meta.title;
    setMetaContent('meta[name="description"]', meta.description);
    setLinkHref('link[rel="canonical"]', url);

    setMetaContent('meta[property="og:url"]', url);
    setMetaContent('meta[property="og:title"]', meta.title);
    setMetaContent('meta[property="og:description"]', meta.description);
    setMetaContent('meta[property="og:image"]', image);
    ensureMetaContent('meta[property="og:image:alt"]', imageAlt, () => {
        const el = document.createElement("meta");
        el.setAttribute("property", "og:image:alt");
        return el;
    });

    setMetaContent('meta[name="twitter:url"]', url);
    setMetaContent('meta[name="twitter:title"]', meta.title);
    setMetaContent('meta[name="twitter:description"]', meta.description);
    setMetaContent('meta[name="twitter:image"]', image);
    ensureMetaContent('meta[name="twitter:image:alt"]', imageAlt, () => {
        const el = document.createElement("meta");
        el.setAttribute("name", "twitter:image:alt");
        return el;
    });

    setStructuredData(asArray(meta.structuredData));
}

const TITLE_RE = /<title>[\s\S]*?<\/title>/;
const META_RE = (name: string, attr: "name" | "property" = "name") =>
    new RegExp(`<meta ${attr}="${name}" content="[^"]*"\\s*/?\\s*>`);
const CANONICAL_RE = /<link rel="canonical" href="[^"]*"\s*\/?>/;
const PAGEMETA_LD_BLOCK_RE = new RegExp(
    `\\s*<script type="application/ld\\+json" ${PAGEMETA_LD_ATTR}="1">[\\s\\S]*?</script>`,
    "g",
);

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

/** Escape `</script>` so JSON-LD content can't break out of the script tag. */
function escapeJsonForScript(json: string): string {
    return json.replace(/<\/script/gi, "<\\/script");
}

function ensureMetaInHead(html: string, name: string, attr: "name" | "property", content: string): string {
    const re = META_RE(name, attr);
    const tag = `<meta ${attr}="${name}" content="${content}" />`;
    if (re.test(html)) return html.replace(re, tag);
    return html.replace("</head>", `        ${tag}\n    </head>`);
}

/**
 * Apply meta to a static HTML string (build-time). Mirrors applyPageMeta.
 * Used by scripts/prerender.ts and netlify/functions/profile-page.mts.
 */
export function applyPageMetaToHtml(html: string, meta: PageMeta, siteUrl?: string): string {
    const url = absoluteUrl(meta.path, siteUrl);
    const image = absoluteUrl(meta.image ?? "/og-image.png", siteUrl);
    const title = escapeHtml(meta.title);
    const desc = escapeHtml(meta.description);
    const imageAlt = escapeHtml(meta.imageAlt ?? meta.title);

    let next = html;
    next = next.replace(TITLE_RE, `<title>${title}</title>`);
    next = next.replace(META_RE("description"), `<meta name="description" content="${desc}" />`);
    next = next.replace(CANONICAL_RE, `<link rel="canonical" href="${url}" />`);
    next = next.replace(META_RE("og:url", "property"), `<meta property="og:url" content="${url}" />`);
    next = next.replace(META_RE("og:title", "property"), `<meta property="og:title" content="${title}" />`);
    next = next.replace(META_RE("og:description", "property"), `<meta property="og:description" content="${desc}" />`);
    next = next.replace(META_RE("og:image", "property"), `<meta property="og:image" content="${image}" />`);
    next = ensureMetaInHead(next, "og:image:alt", "property", imageAlt);
    next = next.replace(META_RE("twitter:url"), `<meta name="twitter:url" content="${url}" />`);
    next = next.replace(META_RE("twitter:title"), `<meta name="twitter:title" content="${title}" />`);
    next = next.replace(META_RE("twitter:description"), `<meta name="twitter:description" content="${desc}" />`);
    next = next.replace(META_RE("twitter:image"), `<meta name="twitter:image" content="${image}" />`);
    next = ensureMetaInHead(next, "twitter:image:alt", "name", imageAlt);

    // Strip any prior page-level JSON-LD and inject fresh nodes
    next = next.replace(PAGEMETA_LD_BLOCK_RE, "");
    const nodes = asArray(meta.structuredData);
    if (nodes && nodes.length) {
        const scripts = nodes
            .map(
                (n) =>
                    `        <script type="application/ld+json" ${PAGEMETA_LD_ATTR}="1">${escapeJsonForScript(JSON.stringify(n))}</script>`,
            )
            .join("\n");
        next = next.replace("</head>", `${scripts}\n    </head>`);
    }
    return next;
}
