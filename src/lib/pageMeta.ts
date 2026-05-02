/**
 * Per-page metadata: title, description, canonical, OpenGraph, Twitter card.
 *
 * Used both at build time (scripts/prerender.ts) and at runtime
 * (src/hooks/usePageMeta.ts) so static and SPA navigation stay in sync.
 */

export interface PageMeta {
    title: string;
    description: string;
    /** Path portion only, e.g. "/manifesto". Will be combined with siteUrl. */
    path: string;
    /** Absolute or root-relative image URL. Defaults to /og-image.png. */
    image?: string;
}

const SITE_URL = (import.meta.env?.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") || "https://hacktez.com";

function absoluteUrl(path: string, siteUrl = SITE_URL): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function setMetaContent(selector: string, content: string): void {
    const el = document.head.querySelector<HTMLMetaElement>(selector);
    if (el) el.setAttribute("content", content);
}

function setLinkHref(selector: string, href: string): void {
    const el = document.head.querySelector<HTMLLinkElement>(selector);
    if (el) el.setAttribute("href", href);
}

/** Apply meta to the live document. Safe to call repeatedly. */
export function applyPageMeta(meta: PageMeta): void {
    if (typeof document === "undefined") return;
    const url = absoluteUrl(meta.path);
    const image = absoluteUrl(meta.image ?? "/og-image.png");

    document.title = meta.title;
    setMetaContent('meta[name="description"]', meta.description);
    setLinkHref('link[rel="canonical"]', url);

    setMetaContent('meta[property="og:url"]', url);
    setMetaContent('meta[property="og:title"]', meta.title);
    setMetaContent('meta[property="og:description"]', meta.description);
    setMetaContent('meta[property="og:image"]', image);

    setMetaContent('meta[name="twitter:url"]', url);
    setMetaContent('meta[name="twitter:title"]', meta.title);
    setMetaContent('meta[name="twitter:description"]', meta.description);
    setMetaContent('meta[name="twitter:image"]', image);
}

const TITLE_RE = /<title>[\s\S]*?<\/title>/;
const META_RE = (name: string, attr: "name" | "property" = "name") =>
    new RegExp(`<meta ${attr}="${name}" content="[^"]*"\\s*/?\\s*>`);
const CANONICAL_RE = /<link rel="canonical" href="[^"]*"\s*\/?>/;

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
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

    let next = html;
    next = next.replace(TITLE_RE, `<title>${title}</title>`);
    next = next.replace(META_RE("description"), `<meta name="description" content="${desc}" />`);
    next = next.replace(CANONICAL_RE, `<link rel="canonical" href="${url}" />`);
    next = next.replace(META_RE("og:url", "property"), `<meta property="og:url" content="${url}" />`);
    next = next.replace(META_RE("og:title", "property"), `<meta property="og:title" content="${title}" />`);
    next = next.replace(META_RE("og:description", "property"), `<meta property="og:description" content="${desc}" />`);
    next = next.replace(META_RE("og:image", "property"), `<meta property="og:image" content="${image}" />`);
    next = next.replace(META_RE("twitter:url"), `<meta name="twitter:url" content="${url}" />`);
    next = next.replace(META_RE("twitter:title"), `<meta name="twitter:title" content="${title}" />`);
    next = next.replace(META_RE("twitter:description"), `<meta name="twitter:description" content="${desc}" />`);
    next = next.replace(META_RE("twitter:image"), `<meta name="twitter:image" content="${image}" />`);
    return next;
}
