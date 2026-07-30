/**
 * Display helpers shared by the profile page, project cards and project
 * detail pages. Pure presentation — no network, no wallet.
 */
import { ipfsUriToGatewayUrl } from "./pin";

/** Only allow https:// and ipfs:// URLs in rendered links — blocks javascript:, data:, etc. */
export function safeHref(url: string | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("https://") || url.startsWith("ipfs://")) return url;
    return null;
}

export function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Resolve a project logo to a renderable URL, or null. */
export function projectLogoUrl(logo: string | undefined): string | null {
    if (!logo) return null;
    if (logo.startsWith("ipfs://")) return ipfsUriToGatewayUrl(logo);
    return safeHref(logo);
}

export const ENV_STYLES: Record<string, { bg: string; color: string }> = {
    tezos: { bg: "var(--info-bg)", color: "var(--info)" },
    etherlink: { bg: "var(--purple-bg)", color: "var(--purple)" },
    tezlink: { bg: "var(--ok-bg)", color: "var(--ok)" },
    web: { bg: "var(--warn-bg)", color: "var(--warn)" },
    other: { bg: "rgba(148,163,184,0.12)", color: "var(--fg-3)" },
};

export const PROJECT_STATUS_STYLES: Record<
    string,
    { bg: string; color: string }
> = {
    live: { bg: "var(--ok-bg)", color: "var(--ok)" },
    wip: { bg: "var(--warn-bg)", color: "var(--warn)" },
    archived: { bg: "rgba(148,163,184,0.15)", color: "var(--fg-3)" },
    "open-source": { bg: "var(--purple-bg)", color: "var(--purple)" },
};

/** Pill style used for status / environment badges. */
export const BADGE_STYLE: React.CSSProperties = {
    padding: "0.1rem 0.45rem",
    borderRadius: "9999px",
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
};
