import { SPACE_MONO_400_BASE64, SPACE_MONO_700_BASE64 } from "./shareCardFonts";

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
    const isWide = options.width > options.height;
    const titleLines = wrapSvgText(options.title, isWide ? 22 : 20, isWide ? 2 : 3);
    const subtitleLines = wrapSvgText(options.subtitle, isWide ? 44 : 30, 3);
    const accentTwo = options.preset === "scanline-glitch" ? "#59f4ff" : palette.accent;
    const status = options.statusLabel ? escapeXml(options.statusLabel.toUpperCase()) : null;
    const statusLine = status ? `// ${status}` : null;
    const frameX = 56;
    const frameY = 56;
    const frameWidth = options.width - frameX * 2;
    const frameHeight = options.height - frameY * 2;
    const titleY = statusLine ? 246 : 212;
    const subtitleY = titleY + (isWide ? 184 : 238);
    const ctaY = options.height - 118;
    const fullNameY = options.height - 78;
    const titleSpans = titleLines
        .map((line, index) => `<tspan x="110" dy="${index === 0 ? 0 : 86}">${escapeXml(line)}</tspan>`)
        .join("");
    const subtitleSpans = subtitleLines
        .map((line, index) => `<tspan x="110" dy="${index === 0 ? 0 : 38}">${escapeXml(line)}</tspan>`)
        .join("");

    return `
<svg width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style type="text/css">
      @font-face {
        font-family: 'Space Mono';
        font-weight: 400;
        font-style: normal;
        src: url('data:font/woff;base64,${SPACE_MONO_400_BASE64}') format('woff');
      }
      @font-face {
        font-family: 'Space Mono';
        font-weight: 700;
        font-style: normal;
        src: url('data:font/woff;base64,${SPACE_MONO_700_BASE64}') format('woff');
      }
    </style>
        <linearGradient id="bg" x1="0" y1="0" x2="${options.width}" y2="${options.height}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.background}"/>
      <stop offset="1" stop-color="${palette.panel}"/>
    </linearGradient>
        <radialGradient id="orb-a" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${options.width - 240} 104) rotate(90) scale(220 310)">
            <stop stop-color="${palette.accent}" stop-opacity="0.48"/>
            <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="orb-b" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(120 ${options.height - 110}) rotate(90) scale(140 210)">
            <stop stop-color="${accentTwo}" stop-opacity="0.28"/>
            <stop offset="1" stop-color="${accentTwo}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="panel" x1="${frameX}" y1="${frameY}" x2="${options.width - frameX}" y2="${options.height - frameY}" gradientUnits="userSpaceOnUse">
            <stop stop-color="${palette.panel}" stop-opacity="0.92"/>
            <stop offset="1" stop-color="${palette.background}" stop-opacity="0.74"/>
        </linearGradient>
        <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" stroke="${palette.muted}" stroke-opacity="0.1"/>
    </pattern>
        <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" fill="${palette.muted}" fill-opacity="0.14"/>
        </pattern>
  </defs>
  <rect width="${options.width}" height="${options.height}" fill="url(#bg)"/>
    <rect width="${options.width}" height="${options.height}" fill="url(#dots)"/>
    <rect width="${options.width}" height="${options.height}" fill="url(#orb-a)"/>
    <rect width="${options.width}" height="${options.height}" fill="url(#orb-b)"/>
  <rect width="${options.width}" height="${options.height}" fill="url(#grid)"/>
    <path d="M0 0H${options.width}" stroke="${palette.accent}" stroke-opacity="0.42" stroke-width="10"/>
    <path d="M${options.width - 250} 0V${options.height}" stroke="${accentTwo}" stroke-opacity="0.22" stroke-width="2"/>
    <path d="M${options.width - 312} 0V${options.height}" stroke="${palette.accent}" stroke-opacity="0.16" stroke-width="2"/>
    <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="30" fill="url(#panel)" stroke="${palette.muted}" stroke-opacity="0.28"/>
    <rect x="${frameX + 18}" y="${frameY + 18}" width="${frameWidth - 36}" height="${frameHeight - 36}" rx="22" stroke="${palette.muted}" stroke-opacity="0.18"/>
    <rect x="${frameX + 26}" y="${frameY + 24}" width="8" height="${frameHeight - 48}" rx="4" fill="${palette.accent}" fill-opacity="0.82"/>
    <text x="${options.width - 96}" y="114" text-anchor="end" fill="${palette.text}" fill-opacity="0.54" font-size="19" font-family="Space Mono" letter-spacing="1.2">HACK.TEZ PROFILE</text>
    ${statusLine ? `<text x="110" y="156" fill="${palette.accent}" font-size="22" font-family="Space Mono" font-weight="700" letter-spacing="0.9">${statusLine}</text>` : ""}
    <text x="110" y="${titleY}" fill="${palette.text}" font-size="72" font-family="Space Mono" font-weight="700" letter-spacing="-1.9">${titleSpans}</text>
    <text x="110" y="${subtitleY}" fill="${palette.muted}" font-size="31" font-family="Space Mono">${subtitleSpans}</text>
    <path d="M110 ${ctaY - 22}H${options.width - 110}" stroke="${palette.muted}" stroke-opacity="0.24" stroke-width="2"/>
    <text x="110" y="${ctaY}" fill="${palette.accent}" font-size="30" font-family="Space Mono" font-weight="700">${escapeXml(options.cta)}</text>
    <text x="110" y="${fullNameY}" fill="${palette.text}" fill-opacity="0.72" font-size="24" font-family="Space Mono">// ${escapeXml(options.fullName)}</text>
    <text x="${options.width - 96}" y="${fullNameY}" text-anchor="end" fill="${palette.text}" fill-opacity="0.52" font-size="21" font-family="Space Mono">${escapeXml(options.profileUrl)}</text>
</svg>`;
}
