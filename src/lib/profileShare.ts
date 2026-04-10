export type ProfileSharePreset = "circuit-hero" | "scanline-glitch" | "mono-poster";
export type ProfileShareFormat = "og" | "portrait" | "square";

export interface ProfileShareState {
    preset: ProfileSharePreset;
    format: ProfileShareFormat;
    title: string;
    subtitle: string;
    cta: string;
    circuitDensity: number;
    circuitGlow: number;
    glitchIntensity: number;
    templateColor: string;
    monoInvert: boolean;
}

export interface ProfileShareSeed {
    label: string;
    tld: string;
    fullName: string;
    displayName: string;
    bio?: string;
    status?: string;
    siteUrl: string;
}

export interface ProfileShareSvgOptions {
    width: number;
    height: number;
    preset: ProfileSharePreset;
    title: string;
    subtitle: string;
    cta: string;
    fullName: string;
    profileUrl: string;
    statusLabel?: string;
}

export const PROFILE_SHARE_SIZES: Record<ProfileShareFormat, { width: number; height: number }> = {
    og: { width: 1200, height: 630 },
    portrait: { width: 1080, height: 1350 },
    square: { width: 1080, height: 1080 },
};

export const PROFILE_SHARE_PRESETS: Record<
    ProfileSharePreset,
    { background: string; accent: string; text: string; muted: string; panel: string }
> = {
    "circuit-hero": {
        background: "#07131a",
        accent: "#5bff8a",
        text: "#f3fff6",
        muted: "#a9c7b3",
        panel: "#0c1b22",
    },
    "scanline-glitch": {
        background: "#07070b",
        accent: "#ff4db8",
        text: "#f5f7ff",
        muted: "#b3bad1",
        panel: "#12131b",
    },
    "mono-poster": {
        background: "#f4f1e8",
        accent: "#121212",
        text: "#111111",
        muted: "#4b4b4b",
        panel: "#e5e0d3",
    },
};

export function formatShareStatus(status: string | undefined): string | undefined {
    if (!status) return undefined;
    switch (status) {
        case "open-to-collab":
            return "Open to Collab";
        case "building":
            return "Building";
        case "available":
            return "Available";
        case "hiring":
            return "Hiring";
        default:
            return status;
    }
}

export function getProfileShareUrl(label: string, siteUrl: string): string {
    return `${siteUrl.replace(/\/+$/, "")}/u/${encodeURIComponent(label)}`;
}

export function getDefaultProfileShareState(seed: ProfileShareSeed): ProfileShareState {
    const title = seed.displayName.trim() || seed.fullName;
    const subtitle = seed.bio?.trim() || `Own ${seed.fullName} on Tezos. Build in public. Ship weird things.`;
    return {
        preset: "circuit-hero",
        format: "og",
        title,
        subtitle,
        cta: `${seed.fullName} on ${new URL(seed.siteUrl).hostname}`,
        circuitDensity: 58,
        circuitGlow: 62,
        glitchIntensity: 44,
        templateColor: "#5bff8a",
        monoInvert: false,
    };
}

export function buildProfileShareIntentText(state: ProfileShareState, profileUrl: string): string {
    const parts = [state.title.trim(), state.subtitle.trim(), state.cta.trim(), profileUrl].filter(Boolean);
    return parts.join("\n\n");
}

function escapeXml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function truncateSvgWord(word: string, maxChars: number): string {
    if (word.length <= maxChars) return word;
    if (maxChars <= 1) return "…";
    return `${word.slice(0, maxChars - 1)}…`;
}

function wrapSvgText(text: string, maxChars: number, maxLines: number): string[] {
    if (maxChars <= 0 || maxLines <= 0) return [];
    const words = text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => truncateSvgWord(word, maxChars));
    if (words.length === 0) return [];
    const lines: string[] = [];
    let current = "";
    let consumedWords = 0;
    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
            current = next;
            consumedWords += 1;
            continue;
        }
        if (current) {
            lines.push(current);
            if (lines.length === maxLines) break;
        }
        current = word;
        consumedWords += 1;
    }
    if (lines.length < maxLines && current) lines.push(current);
    const didOverflow = consumedWords < words.length;
    if (didOverflow && lines.length > 0) {
        const lastIndex = Math.min(lines.length, maxLines) - 1;
        const last = lines[lastIndex] ?? "";
        if (last.endsWith("…")) {
            lines[lastIndex] = last;
        } else if (last.length > 1) {
            lines[lastIndex] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
        } else {
            lines[lastIndex] = "…";
        }
    }
    return lines.slice(0, maxLines);
}

export function buildProfileShareSvg(options: ProfileShareSvgOptions): string {
    const palette = PROFILE_SHARE_PRESETS[options.preset];
    const titleLines = wrapSvgText(options.title, 22, options.width > options.height ? 2 : 3);
    const subtitleLines = wrapSvgText(options.subtitle, options.width > options.height ? 42 : 28, 3);
    const accentTwo = options.preset === "scanline-glitch" ? "#59f4ff" : palette.accent;
    const status = options.statusLabel ? escapeXml(options.statusLabel.toUpperCase()) : null;
    const statusLine = status ? `// ${status}` : null;
    const titleSpans = titleLines
        .map((line, index) => `<tspan x="96" dy="${index === 0 ? 0 : 92}">${escapeXml(line)}</tspan>`)
        .join("");
    const subtitleSpans = subtitleLines
        .map((line, index) => `<tspan x="96" dy="${index === 0 ? 0 : 40}">${escapeXml(line)}</tspan>`)
        .join("");

    return `
<svg width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${options.width}" y2="${options.height}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.background}"/>
      <stop offset="1" stop-color="${palette.panel}"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" stroke="${palette.muted}" stroke-opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="${options.width}" height="${options.height}" fill="url(#bg)"/>
  <rect width="${options.width}" height="${options.height}" fill="url(#grid)"/>
  <path d="M0 72H${options.width}" stroke="${palette.accent}" stroke-width="8"/>
  <path d="M${options.width - 220} 0V${options.height}" stroke="${accentTwo}" stroke-opacity="0.28" stroke-width="2"/>
  <path d="M${options.width - 320} 0V${options.height}" stroke="${palette.accent}" stroke-opacity="0.18" stroke-width="2"/>
  <path d="M0 ${options.height - 132}H${options.width}" stroke="${palette.muted}" stroke-opacity="0.12" stroke-width="2"/>
  <circle cx="${options.width - 176}" cy="132" r="42" fill="${palette.accent}" fill-opacity="0.18" stroke="${palette.accent}" stroke-opacity="0.7"/>
  <circle cx="${options.width - 176}" cy="132" r="10" fill="${palette.accent}"/>
  <rect x="96" y="96" width="${options.width - 192}" height="${options.height - 192}" rx="28" fill="${palette.panel}" fill-opacity="0.78" stroke="${palette.muted}" stroke-opacity="0.15"/>
        ${statusLine ? `<text x="96" y="134" fill="${palette.accent}" font-family="'Space Mono', monospace" font-size="24" font-weight="700" letter-spacing="0.5">${statusLine}</text>` : ""}
        <text x="96" y="${statusLine ? 198 : 168}" fill="${palette.text}" font-family="'Space Mono', monospace" font-size="74" font-weight="700" letter-spacing="-2">${titleSpans}</text>
        <text x="96" y="${statusLine ? 358 : 328}" fill="${palette.muted}" font-family="'Space Mono', monospace" font-size="32">${subtitleSpans}</text>
    <text x="96" y="${options.height - 126}" fill="${palette.accent}" font-family="'Space Mono', monospace" font-size="28" font-weight="700">${escapeXml(options.cta)}</text>
    <text x="96" y="${options.height - 78}" fill="${palette.text}" fill-opacity="0.68" font-family="'Space Mono', monospace" font-size="26">// ${escapeXml(options.fullName)}</text>
    <text x="${options.width - 96}" y="${options.height - 78}" text-anchor="end" fill="${palette.text}" fill-opacity="0.46" font-family="'Space Mono', monospace" font-size="22">${escapeXml(options.profileUrl)}</text>
</svg>`;
}
