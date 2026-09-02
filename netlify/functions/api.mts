/**
 * hack.tez Public API — Netlify Function v2
 *
 * Routes:
 *   GET /api/v1/domain/:name        — domain record by full name or label
 *   GET /api/v1/profile/:name       — domain record + parsed profile data
 *   GET /api/v1/availability/:label — check if a label is free to register
 *   GET /api/v1/members             — directory: one row per domain, full profile
 *   GET /api/v1/hackers             — directory: one row per person (primary domain)
 *   GET /api/v1/owner/:address      — all hack.tez domains owned by a wallet
 *   GET /api/v1/resolve/:address    — reverse-resolve wallet → primary domain
 *   GET /api/v1/config              — contract config (commit age, max, paused)
 *   GET /api/v1/activity            — recent on-chain claim + commit events
 *   GET /api/v1/hackatar/:label     — generated avatar GIF (?static=1 for single frame)
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { Resvg } from "@resvg/resvg-js";
import { getPkhfromPk, verifySignature } from "@taquito/utils";
import { Redis } from "@upstash/redis";
// @ts-expect-error — gifenc is CJS, no proper ESM types
import gifenc from "gifenc";
import {
	createPrng,
	renderFrames,
	renderSingleFrame,
	seedFromHash,
	selectTraits,
} from "../../src/lib/hackatar/index.ts";
import type { HackProfile, ProjectEntry } from "../../src/types/profile.ts";
import {
	parseProfileFromData,
	projectSlug,
	resolvePrimary,
} from "../../src/types/profile.ts";
import type { TipCountersWithProjects } from "./tipCounters.ts";
import {
	readTipCounters,
	readTipCountersBulk,
	recordTip,
	TipVerifyError,
	verifyTipOperation,
} from "./tipCounters.ts";
import {
	formatShareStatus,
	getDefaultProfileShareState,
	getProfileShareUrl,
	PROFILE_SHARE_PRESETS,
	PROFILE_SHARE_SIZES,
} from "../../src/lib/profileShare.ts";
import {
	createAtprotoRecord,
	createSubdomainCname,
	deleteAtprotoRecord,
	ensureDomainAlias,
	findRecordByDid,
	getAtprotoRecord,
} from "./netlifyDns.ts";
import pinHandler from "./pin.mts";
import { textToPath } from "./textToPath.ts";

// ---------------------------------------------------------------------------
// Network config (mirrors src/config/tezos.ts without Vite import.meta.env)
// ---------------------------------------------------------------------------

type TezosNetwork = "mainnet" | "ghostnet";

interface NetworkConfig {
	tld: "tez" | "gho";
	tzktApi: string;
	domainsGraphql: string;
	registrarAddress: string;
}

const NETWORKS: Record<TezosNetwork, NetworkConfig> = {
	mainnet: {
		tld: "tez",
		tzktApi: "https://api.tzkt.io",
		domainsGraphql: "https://api.tezos.domains/graphql",
		registrarAddress: process.env.VITE_REGISTRAR_ADDRESS ?? "",
	},
	ghostnet: {
		tld: "gho",
		tzktApi: "https://api.ghostnet.tzkt.io",
		domainsGraphql: "https://ghostnet-api.tezos.domains/graphql",
		registrarAddress: process.env.VITE_REGISTRAR_ADDRESS ?? "",
	},
};

function getNetwork(): NetworkConfig & { name: TezosNetwork } {
	const name = (process.env.VITE_TEZOS_NETWORK ?? "ghostnet") as TezosNetwork;
	return { name, ...(NETWORKS[name] ?? NETWORKS.ghostnet) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const SHARE_CARD_DEBUG_VERSION = "share-card-debug-2026-04-10-v1";

// ---------------------------------------------------------------------------
// Upstash Redis — shared cache across serverless invocations
// ---------------------------------------------------------------------------

function getRedis(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) return null;
	return new Redis({ url, token });
}

/** SWR cache entry stored in Redis */
interface RedisCacheEntry {
	json: string;
	builtAt: number;
}

/** Soft freshness window — serve cached if within this age (seconds) */
const DOMAINS_CACHE_FRESH_SEC = 60;
/** Hard TTL in Redis — auto-expire after this (seconds) */
const DOMAINS_CACHE_TTL_SEC = 600;

/**
 * Convert a typed array (Uint8Array, Buffer, etc.) to a clean ArrayBuffer.
 *
 * TS 5.7+ widened `TypedArray.buffer` to `ArrayBufferLike` (= ArrayBuffer |
 * SharedArrayBuffer).  At runtime, views created by gifenc / Resvg / Node
 * Buffer are never backed by SharedArrayBuffer, but the type system doesn't
 * know that.  One cast here eliminates the mismatch at every Response / Blob /
 * store.set boundary.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
	const { buffer, byteOffset, byteLength } = data;
	return (buffer as ArrayBuffer).slice(byteOffset, byteOffset + byteLength);
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...CORS_HEADERS,
			...extra,
		},
	});
}

function err(message: string, code: string, status = 400): Response {
	return json({ error: message, code }, status);
}

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const TZ_ADDRESS_RE =
	/^(tz[123][1-9A-HJ-NP-Za-km-z]{33}|KT1[1-9A-HJ-NP-Za-km-z]{33})$/;

function validateLabel(label: string): string | null {
	if (!label || label.length === 0) return "Label is required";
	if (label.length > 63) return "Label must be 63 characters or fewer";
	if (!LABEL_RE.test(label))
		return "Label must be lowercase alphanumeric with hyphens";
	return null;
}

function normalizeLabel(nameOrLabel: string, tld: "tez" | "gho"): string {
	const value = nameOrLabel.trim().toLowerCase();
	const suffix = `.hack.${tld}`;
	if (value.endsWith(suffix)) return value.slice(0, -suffix.length);
	return value;
}

// Directory reference for path resolution
const _fnDir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Share card SVG builder using vector paths (no font rendering required)
// ---------------------------------------------------------------------------

import type { ProfileShareSvgOptions } from "../../src/lib/profileShare.ts";

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

function wrapSvgText(
	text: string,
	maxChars: number,
	maxLines: number,
): string[] {
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

function buildProfileShareSvgWithPaths(
	options: ProfileShareSvgOptions,
): string {
	const palette = PROFILE_SHARE_PRESETS[options.preset];
	const isWide = options.width > options.height;
	const titleLines = wrapSvgText(
		options.title,
		isWide ? 22 : 20,
		isWide ? 2 : 3,
	);
	const subtitleLines = wrapSvgText(options.subtitle, isWide ? 44 : 30, 3);
	const accentTwo =
		options.preset === "scanline-glitch" ? "#59f4ff" : palette.accent;
	const status = options.statusLabel
		? escapeXml(options.statusLabel.toUpperCase())
		: null;
	const statusLine = status ? `// ${status}` : null;
	const frameX = 56;
	const frameY = 56;
	const frameWidth = options.width - frameX * 2;
	const frameHeight = options.height - frameY * 2;
	const titleY = statusLine ? 246 : 212;
	const subtitleY = titleY + (isWide ? 184 : 238);
	const ctaY = options.height - 118;
	const fullNameY = options.height - 78;

	// Convert all text to vector paths
	const headerPath = textToPath({
		text: "HACK.TEZ PROFILE",
		x: options.width - 96,
		y: 114,
		fontSize: 19,
		fill: palette.text,
		fillOpacity: 0.54,
		fontWeight: 400,
		letterSpacing: 1.2,
		textAnchor: "end",
	});

	const statusPath = statusLine
		? textToPath({
				text: statusLine,
				x: 110,
				y: 156,
				fontSize: 22,
				fill: palette.accent,
				fontWeight: 700,
				letterSpacing: 0.9,
				textAnchor: "start",
			})
		: "";

	// Title lines (multiple with line height)
	const titlePaths = titleLines
		.map((line, index) =>
			textToPath({
				text: line,
				x: 110,
				y: titleY + index * 86,
				fontSize: 72,
				fill: palette.text,
				fontWeight: 700,
				letterSpacing: -1.9,
				textAnchor: "start",
			}),
		)
		.join("\n    ");

	// Subtitle lines
	const subtitlePaths = subtitleLines
		.map((line, index) =>
			textToPath({
				text: line,
				x: 110,
				y: subtitleY + index * 38,
				fontSize: 31,
				fill: palette.muted,
				fontWeight: 400,
				textAnchor: "start",
			}),
		)
		.join("\n    ");

	const ctaPath = textToPath({
		text: options.cta,
		x: 110,
		y: ctaY,
		fontSize: 30,
		fill: palette.accent,
		fontWeight: 700,
		textAnchor: "start",
	});

	const fullNamePath = textToPath({
		text: `// ${options.fullName}`,
		x: 110,
		y: fullNameY,
		fontSize: 24,
		fill: palette.text,
		fillOpacity: 0.72,
		fontWeight: 400,
		textAnchor: "start",
	});

	const profileUrlPath = textToPath({
		text: options.profileUrl,
		x: options.width - 96,
		y: fullNameY,
		fontSize: 21,
		fill: palette.text,
		fillOpacity: 0.52,
		fontWeight: 400,
		textAnchor: "end",
	});

	return `
<svg width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
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
  ${headerPath}
  ${statusPath}
  ${titlePaths}
  ${subtitlePaths}
  <path d="M110 ${ctaY - 22}H${options.width - 110}" stroke="${palette.muted}" stroke-opacity="0.24" stroke-width="2"/>
  ${ctaPath}
  ${fullNamePath}
  ${profileUrlPath}
</svg>`;
}

async function tedGql<T>(
	graphqlUrl: string,
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const res = await fetch(graphqlUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query, variables }),
	});
	if (!res.ok) throw new Error(`TED GraphQL HTTP ${res.status}`);
	const data = await res.json();
	if (data.errors?.length) throw new Error(data.errors[0].message);
	return data.data as T;
}

// ---------------------------------------------------------------------------
// Profile parsing
// ---------------------------------------------------------------------------
// Shared verbatim with the client via src/types/profile.ts — that module is
// import-free precisely so this runtime can use it. Never fork a second copy.

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/v1/tezosx/:nameOrAddress — Tezos X identity resolution.
 *
 *  Input: a hack.tez name (label or full), or any tz1/tz2/tz3/KT1/0x address.
 *  Output: the identity's addresses on both Tezos X interfaces plus live
 *  previewnet state (materialized, balance) for each, best-effort.
 *
 *  Resolution precedence for a name's EVM address: the declared TED
 *  `etherlink:address` record wins; otherwise the deterministic Tezos X
 *  alias of the resolved tz address (keccak256 of the base58 string). */
async function handleTezosX(
	nameOrAddress: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const xray = await import("../../src/lib/xray/index.ts");
	const input = nameOrAddress.trim();

	let name: string | null = null;
	let tz: string | null = null;
	let evm: string | null = null;
	let evmSource: "declared" | "derived" | "native" | null = null;
	let kt1Alias: string | null = null;

	const kind = xray.classifyAddress(input);
	if (kind === "invalid") {
		// Treat as a hack.tez name.
		const label = input
			.toLowerCase()
			.replace(new RegExp(`\\.hack\\.${net.tld}$`), "");
		const labelErr = validateLabel(label);
		if (labelErr) return err(labelErr, "INVALID_INPUT");
		name = `${label}.hack.${net.tld}`;

		const data = await tedGql<{
			domain: {
				address: string | null;
				data: Array<{ key: string; value: unknown }> | null;
			} | null;
		}>(
			net.domainsGraphql,
			`query GetDomainForTezosX($name: String!) {
              domain(name: $name) {
                address
                data { key value }
              }
            }`,
			{ name },
		);
		if (!data.domain) return err("name not found", "NOT_FOUND", 404);
		tz = data.domain.address;
		const declared = data.domain.data?.find(
			(d) => d.key === "etherlink:address",
		)?.value;
		if (typeof declared === "string" && xray.classifyAddress(declared) === "evm") {
			evm = declared.toLowerCase();
			evmSource = "declared";
		} else if (tz) {
			evm = xray.evmAliasOfTezos(tz);
			evmSource = "derived";
		}
		if (!tz && !evm)
			return err(`no address set for ${name}`, "NOT_FOUND", 404);
	} else if (kind === "evm") {
		evm = input.toLowerCase();
		evmSource = "native";
		kt1Alias = xray.kt1AliasOfEvm(evm);
	} else {
		tz = input;
		evm = xray.evmAliasOfTezos(tz);
		evmSource = "derived";
	}

	// Best-effort live previewnet state for every address we resolved.
	interface Corner {
		role: "native" | "alias" | "declared";
		address: string;
		interface: "evm" | "michelson";
		materialized: boolean;
		balance: string;
		hasCode?: boolean;
	}
	const corners: Corner[] = [];
	let cornersError: string | null = null;
	try {
		const jobs: Array<Promise<Corner>> = [];
		if (tz)
			jobs.push(
				xray.getMichelsonCorner(tz).then((c) => ({ role: "native" as const, ...c })),
			);
		if (evm)
			jobs.push(
				xray.getEvmCorner(evm).then((c) => ({
					role:
						evmSource === "native"
							? ("native" as const)
							: evmSource === "declared"
								? ("declared" as const)
								: ("alias" as const),
					...c,
				})),
			);
		if (kt1Alias)
			jobs.push(
				xray
					.getMichelsonCorner(kt1Alias)
					.then((c) => ({ role: "alias" as const, ...c })),
			);
		corners.push(...(await Promise.all(jobs)));
	} catch (e) {
		cornersError = e instanceof Error ? e.message : "previewnet unreachable";
	}

	return json(
		{
			data: { input, name, tz, evm, evmSource, kt1Alias, corners, cornersError },
			network: "tezosx-previewnet",
		},
		200,
		{ "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
	);
}

/** GET /api/v1/domain/:name — domain record by label or full name */
async function handleDomain(
	name: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const label = name.endsWith(`.hack.${net.tld}`)
		? name.replace(`.hack.${net.tld}`, "")
		: name;
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const fullName = `${label}.hack.${net.tld}`;

	const data = await tedGql<{
		domain: {
			name: string;
			address: string | null;
			owner: string;
		} | null;
	}>(
		net.domainsGraphql,
		`query GetDomain($name: String!) {
          domain(name: $name) {
            name
            address
            owner
          }
        }`,
		{ name: fullName },
	);

	if (!data.domain) {
		return json({ data: null, available: true, network: net.name }, 200, {
			"Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
		});
	}

	return json(
		{
			data: {
				name: data.domain.name,
				label,
				address: data.domain.address,
				owner: data.domain.owner,
			},
			available: false,
			network: net.name,
		},
		200,
		{ "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
	);
}

/** GET /api/v1/profile/:name — domain record + parsed profile data */
async function handleProfile(
	name: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const label = name.endsWith(`.hack.${net.tld}`)
		? name.replace(`.hack.${net.tld}`, "")
		: name;
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const fullName = `${label}.hack.${net.tld}`;

	const [result, regInfo] = await Promise.all([
		tedGql<{
			domain: {
				name: string;
				address: string | null;
				owner: string;
				data: Array<{ key: string; value: unknown }>;
			} | null;
		}>(
			net.domainsGraphql,
			`query GetProfile($name: String!) {
              domain(name: $name) {
                name
                address
                owner
                data { key value }
              }
            }`,
			{ name: fullName },
		),
		getRegistrationHash(label, net),
	]);

	if (!result.domain) {
		return json({ error: "not found" }, 404, {
			"Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
		});
	}

	const profile = parseProfileFromData(result.domain.data ?? []);

	return json(
		{
			data: {
				name: result.domain.name,
				owner: result.domain.owner,
				address: result.domain.address,
				profile,
				registrationHash: regInfo?.hash ?? null,
				registeredAt: regInfo?.timestamp ?? null,
			},
			network: net.name,
		},
		200,
		{ "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
	);
}

/** GET /api/v1/availability/:label */
async function handleAvailability(
	label: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const fullName = `${label}.hack.${net.tld}`;
	const data = await tedGql<{ domain: { name: string } | null }>(
		net.domainsGraphql,
		`query CheckDomain($name: String!) {
          domain(name: $name) { name }
        }`,
		{ name: fullName },
	);

	return json(
		{ label, available: data.domain === null, network: net.name },
		200,
		{
			"Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
		},
	);
}

/** GET /api/v1/owner/:address */
async function handleOwner(
	address: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	if (!TZ_ADDRESS_RE.test(address))
		return err("Invalid Tezos address", "INVALID_INPUT");

	const data = await tedGql<{
		domains: {
			items: Array<{
				name: string;
				address: string | null;
				owner: string;
				data: Array<{ key: string; value: unknown }>;
			}>;
		};
	}>(
		net.domainsGraphql,
		`query OwnerDomains($owner: Address!, $parent: String!) {
          domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }, order: { field: NAME, direction: ASC }) {
            items { name address owner data { key value } }
          }
        }`,
		{ owner: address, parent: `.hack.${net.tld}` },
	);

	const suffix = `.hack.${net.tld}`;
	const candidates = data.domains.items.flatMap((d) =>
		d.name.slice(0, -suffix.length).includes(".")
			? []
			: [
					{
						name: d.name,
						owner: d.owner,
						profile: parseProfileFromData(d.data ?? []),
					},
				],
	);
	const primary = resolvePrimary(address, candidates);

	const domains = data.domains.items.map((d) => ({
		name: d.name,
		label: d.name.replace(suffix, ""),
		address: d.address,
		owner: d.owner,
		primary: d.name === primary,
	}));

	return json(
		{ data: domains, count: domains.length, primary, network: net.name },
		200,
		{
			"Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
		},
	);
}

/** GET /api/v1/resolve/:address — reverse-resolve address → primary domain name */
async function handleResolve(
	address: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	if (!TZ_ADDRESS_RE.test(address))
		return err("Invalid Tezos address", "INVALID_INPUT");

	// Run both queries in parallel
	const [ownerData, reverseData] = await Promise.all([
		tedGql<{
			domains: {
				items: Array<{
					name: string;
					owner: string;
					data: Array<{ key: string; value: unknown }>;
				}>;
			};
		}>(
			net.domainsGraphql,
			`query OwnerDomains($owner: Address!, $parent: String!) {
              domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }, order: { field: NAME, direction: ASC }) {
                items { name owner data { key value } }
              }
            }`,
			{ owner: address, parent: `.hack.${net.tld}` },
		),
		tedGql<{
			reverseRecord: { domain: { name: string } } | null;
		}>(
			net.domainsGraphql,
			`query ReverseLookup($address: String!) {
              reverseRecord(address: $address) {
                domain { name }
              }
            }`,
			{ address },
		),
	]);

	const hackTezDomains = ownerData.domains.items.map((d) => d.name);
	const suffix = `.hack.${net.tld}`;
	const hackTezPrimary = resolvePrimary(
		address,
		ownerData.domains.items.flatMap((d) =>
			// Sub-subdomains belong to a member, they are not one.
			d.name.slice(0, -suffix.length).includes(".")
				? []
				: [
						{
							name: d.name,
							owner: d.owner,
							profile: parseProfileFromData(d.data ?? []),
						},
					],
		),
	);

	// `primary` keeps its published contract: the TED reverse record wins
	// outright, so a wallet whose reverse record is a .tez name still resolves
	// to it. Only the old arbitrary `hackTezDomains[0]` fallback changes, and
	// that value was never deterministic (the query had no ORDER BY).
	const primary =
		reverseData.reverseRecord?.domain?.name ?? hackTezPrimary ?? null;

	return json(
		{
			address,
			primary,
			hackTez: hackTezDomains,
			hackTezPrimary,
			network: net.name,
		},
		200,
		{ "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
	);
}

/** Decode a hex string (TzKT Michelson bytes) to UTF-8 */
function hexToUtf8(hex: string): string {
	try {
		const bytes = new Uint8Array(
			(hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
		);
		return new TextDecoder().decode(bytes);
	} catch {
		return hex;
	}
}

/** Encode a UTF-8 string to hex bytes (for TzKT parameter filtering) */
function utf8ToHex(str: string): string {
	return Array.from(new TextEncoder().encode(str))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Fetch the registration opHash for a single label from TzKT.
 * Returns { hash, timestamp } or null if not found.
 */
async function getRegistrationHash(
	label: string,
	net: ReturnType<typeof getNetwork>,
): Promise<{ hash: string; timestamp: string } | null> {
	const registrars = getRegistrarAddresses(net);
	const hexLabel = utf8ToHex(label);

	for (const addr of registrars) {
		try {
			const url =
				`${net.tzktApi}/v1/operations/transactions` +
				`?target=${addr}` +
				`&entrypoint=register` +
				`&parameter.value.label=${hexLabel}` +
				`&status=applied` +
				`&limit=1` +
				`&select=hash,timestamp`;
			const res = await fetch(url);
			if (!res.ok) continue;
			const ops: Array<{ hash: string; timestamp: string }> = await res.json();
			if (ops.length > 0) return ops[0];
		} catch {}
	}
	return null;
}

/**
 * Batch-fetch registration opHashes for all register operations.
 * Returns a map of UTF-8 label → { hash, timestamp }.
 * Results are cached in-memory for 5 minutes to avoid repeated large TzKT fetches.
 */

const REGISTRATION_HASHES_TTL_MS = 5 * 60 * 1000;
const registrationHashesCache = new Map<
	string,
	{ expiresAt: number; value: Map<string, { hash: string; timestamp: string }> }
>();
const registrationHashesInflight = new Map<
	string,
	Promise<Map<string, { hash: string; timestamp: string }>>
>();

async function getAllRegistrationHashes(
	net: ReturnType<typeof getNetwork>,
): Promise<Map<string, { hash: string; timestamp: string }>> {
	const cacheKey = net.tzktApi;
	const now = Date.now();
	const cached = registrationHashesCache.get(cacheKey);
	if (cached && cached.expiresAt > now) {
		return new Map(cached.value);
	}

	const inflight = registrationHashesInflight.get(cacheKey);
	if (inflight) {
		return new Map(await inflight);
	}

	type TzKTRegOp = {
		hash: string;
		timestamp: string;
		parameter: { value: { label: string } };
	};

	const loadPromise = (async () => {
		const registrars = getRegistrarAddresses(net);
		const map = new Map<string, { hash: string; timestamp: string }>();

		await Promise.all(
			registrars.map(async (addr) => {
				try {
					const url =
						`${net.tzktApi}/v1/operations/transactions` +
						`?target=${addr}` +
						`&entrypoint=register` +
						`&status=applied` +
						`&select=hash,timestamp,parameter` +
						`&sort.asc=id` +
						`&limit=10000`;
					const res = await fetch(url);
					if (!res.ok) return;
					const ops: TzKTRegOp[] = await res.json();
					for (const op of ops) {
						const rawLabel = op.parameter?.value?.label;
						if (!rawLabel) continue;
						const label = hexToUtf8(rawLabel);
						// Keep first match (earliest registration — TzKT sorted ascending by id)
						if (!map.has(label)) {
							map.set(label, { hash: op.hash, timestamp: op.timestamp });
						}
					}
				} catch {
					// skip failing contracts
				}
			}),
		);

		registrationHashesCache.set(cacheKey, {
			expiresAt: now + REGISTRATION_HASHES_TTL_MS,
			value: map,
		});
		return map;
	})();

	registrationHashesInflight.set(cacheKey, loadPromise);
	try {
		return new Map(await loadPromise);
	} finally {
		registrationHashesInflight.delete(cacheKey);
	}
}

/** Type alias for the paginated TED domains response — extracted to break
 *  circular type inference when `page` and `after` reference each other. */
interface TedDomainsPage {
	domains: {
		items: Array<{
			name: string;
			owner: string;
			address: string | null;
			data: Array<{ key: string; value: unknown }>;
		}>;
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
	};
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000; // safety cap on internal pagination

/**
 * Page through TED for every domain under `parent`, up to `limit` items.
 * TED GraphQL caps `first` at 50 — paginate via cursor to satisfy larger limits.
 */
async function fetchTedDomains(
	parent: string,
	limit: number,
	net: ReturnType<typeof getNetwork>,
): Promise<TedDomainsPage["domains"]["items"]> {
	const items: TedDomainsPage["domains"]["items"] = [];
	let after: string | null = null;

	while (items.length < limit) {
		const pageSize = Math.min(50, limit - items.length);
		const page: TedDomainsPage = await tedGql(
			net.domainsGraphql,
			`query AllDomains($parent: String!, $first: Int!, $after: String) {
              domains(where: { name: { endsWith: $parent } }, first: $first, after: $after, order: { field: NAME, direction: ASC }) {
                items {
                  name
                  owner
                  address
                  data { key value }
                }
                pageInfo { hasNextPage endCursor }
              }
            }`,
			{ parent: `.${parent}`, first: pageSize, after },
		);
		items.push(...page.domains.items);
		if (!page.domains.pageInfo.hasNextPage || !page.domains.pageInfo.endCursor)
			break;
		after = page.domains.pageInfo.endCursor;
	}

	return items;
}

/** GET /api/v1/domains?limit=50 — list all hack.tez registrations */
async function handleDomains(
	url: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const parent = `hack.${net.tld}`;

	const rawLimit = parseInt(
		url.searchParams.get("limit") ?? String(DEFAULT_LIMIT),
		10,
	);
	if (Number.isNaN(rawLimit) || rawLimit < 1)
		return err("limit must be a positive integer", "INVALID_INPUT");
	const limit = Math.min(rawLimit, MAX_LIMIT);

	// ---------------------------------------------------------------------------
	// Redis SWR cache — only for the default full-list request
	// ---------------------------------------------------------------------------
	const redis = getRedis();
	const cacheKey = `hackers:v1:${net.name}:${limit}`;

	if (redis) {
		try {
			const cached = await redis.get<RedisCacheEntry>(cacheKey);
			if (cached?.json && cached?.builtAt) {
				const ageSeconds = (Date.now() - cached.builtAt) / 1000;
				if (ageSeconds < DOMAINS_CACHE_FRESH_SEC) {
					// Fresh — serve directly from Redis
					return new Response(cached.json, {
						status: 200,
						headers: {
							"Content-Type": "application/json",
							...CORS_HEADERS,
							"Cache-Control":
								"public, s-maxage=120, stale-while-revalidate=300",
							"X-Cache": "HIT",
						},
					});
				}
				// Stale — serve immediately, then revalidate in background
				const staleResponse = new Response(cached.json, {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						...CORS_HEADERS,
						"Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
						"X-Cache": "STALE",
					},
				});
				// Fire-and-forget: rebuild and update cache
				buildDomainsAndCache(parent, limit, net, redis, cacheKey).catch(
					() => {},
				);
				return staleResponse;
			}
		} catch {
			// Redis unavailable — fall through to live build
		}
	}

	// Cache miss or Redis unavailable — build from upstream
	const responseBody = await buildDomainsResponse(parent, limit, net);

	// Write to Redis (fire-and-forget)
	if (redis) {
		const entry: RedisCacheEntry = {
			json: JSON.stringify(responseBody),
			builtAt: Date.now(),
		};
		redis.set(cacheKey, entry, { ex: DOMAINS_CACHE_TTL_SEC }).catch(() => {});
	}

	return json(responseBody, 200, {
		"Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
		"X-Cache": "MISS",
	});
}

/** Build the full domains response payload from upstream APIs */
async function buildDomainsResponse(
	parent: string,
	limit: number,
	net: ReturnType<typeof getNetwork>,
): Promise<{ data: unknown[]; count: number; limit: number; network: string }> {
	const [items, regHashes] = await Promise.all([
		fetchTedDomains(parent, limit, net),
		getAllRegistrationHashes(net),
	]);

	const rows = items.flatMap((d) => {
		const label = d.name.replace(`.${parent}`, "");
		if (label.includes(".")) return [];
		const reg = regHashes.get(label);
		return [
			{
				name: d.name,
				label,
				owner: d.owner,
				address: d.address,
				registeredAt: reg?.timestamp ?? null,
				opHash: reg?.hash ?? null,
				profile: parseProfileFromData(d.data ?? []),
			},
		];
	});

	// `primary` is owner-scoped, so it needs the whole page grouped by owner.
	const primaries = primaryByOwner(rows);
	const domains = rows.map((d) => ({
		...d,
		primary: primaries.get(d.owner) === d.name,
	}));

	return {
		data: domains,
		count: domains.length,
		limit,
		network: net.name,
	};
}

/** Background revalidation — build fresh data and write to Redis */
async function buildDomainsAndCache(
	parent: string,
	limit: number,
	net: ReturnType<typeof getNetwork>,
	redis: Redis,
	cacheKey: string,
): Promise<void> {
	const responseBody = await buildDomainsResponse(parent, limit, net);
	const entry: RedisCacheEntry = {
		json: JSON.stringify(responseBody),
		builtAt: Date.now(),
	};
	await redis.set(cacheKey, entry, { ex: DOMAINS_CACHE_TTL_SEC });
}

/** All registrar addresses: current + any legacy contracts (env: comma-separated) */
function getRegistrarAddresses(net: ReturnType<typeof getNetwork>): string[] {
	const addrs: string[] = [];
	if (net.registrarAddress) addrs.push(net.registrarAddress);
	const legacy = process.env.LEGACY_REGISTRARS;
	if (legacy) {
		for (const a of legacy.split(",")) {
			const trimmed = a.trim();
			if (trimmed && !addrs.includes(trimmed)) addrs.push(trimmed);
		}
	}
	return addrs;
}

// ---------------------------------------------------------------------------
// Members & projects directory
// ---------------------------------------------------------------------------
//
// `/domains` is the registry view: one row per registration, profile attached
// as parsed. `/members` is the *directory* view of the same data — every
// member with their whole profile, every project carrying its slug and the
// canonical URLs the site itself uses, so a consumer never has to re-derive
// `projectSlug()` or guess a path. `/projects` is that same set pivoted so
// projects are the rows.
//
// Both are built from one cached snapshot of the directory, then filtered in
// memory: filters are cheap and would otherwise fragment the cache key.

/**
 * Group rows by owner and resolve each owner's primary domain name.
 * One pass, no I/O: `resolvePrimary` reads the `hack:primary` marker already
 * parsed into each profile and falls back to lexicographic order.
 */
function primaryByOwner(
	rows: Array<{ name: string; owner: string; profile: HackProfile }>,
): Map<string, string> {
	const byOwner = new Map<string, typeof rows>();
	for (const r of rows) {
		const list = byOwner.get(r.owner);
		if (list) list.push(r);
		else byOwner.set(r.owner, [r]);
	}
	const out = new Map<string, string>();
	for (const [owner, list] of byOwner) {
		const primary = resolvePrimary(owner, list);
		if (primary) out.set(owner, primary);
	}
	return out;
}

/** The owner-level block attached to every member row. */
interface HackerBlock {
	owner: string;
	primary: string | null;
	domains: string[];
}

/** Upper bound on how many members one snapshot materializes. */
const MEMBERS_MAX = 1000;
/** Soft freshness window for the snapshot (seconds). */
const MEMBERS_CACHE_FRESH_SEC = 60;
/** Hard TTL in Redis (seconds). */
const MEMBERS_CACHE_TTL_SEC = 600;

/** One member: a hack.tez registration plus its parsed profile. */
interface MemberRecord {
	name: string;
	label: string;
	owner: string;
	address: string | null;
	registeredAt: string | null;
	opHash: string | null;
	profile: HackProfile;
}

/** A ProjectEntry with the slug and page URL the site resolves it at. */
interface ApiProject extends ProjectEntry {
	slug: string;
	urls: { page: string };
}

/** A profile whose projects carry the API's added routing fields. */
interface ApiMemberProfile extends Omit<HackProfile, "projects"> {
	projects?: ApiProject[];
}

interface ApiMember {
	name: string;
	label: string;
	owner: string;
	address: string | null;
	registeredAt: string | null;
	opHash: string | null;
	urls: {
		profile: string;
		api: string;
		avatar: string;
		hackatar: string;
		shareCard: string;
		tips: string;
	};
	profile: ApiMemberProfile;
	counts: { projects: number; skills: number };
	/** True when this is its owner's designated primary domain. */
	primary: boolean;
	/** The person this membership belongs to. */
	hacker: HackerBlock;
	tipCounters?: TipCountersWithProjects | null;
	/** Only on /hackers: the owner's other domains, same shape as this row. */
	alternates?: ApiMember[];
}

/** Build the directory snapshot from upstream (TED + TzKT). */
async function fetchMemberRecords(
	net: ReturnType<typeof getNetwork>,
): Promise<MemberRecord[]> {
	const parent = `hack.${net.tld}`;
	const [items, regHashes] = await Promise.all([
		fetchTedDomains(parent, MEMBERS_MAX, net),
		getAllRegistrationHashes(net),
	]);

	return items.flatMap((d) => {
		const label = d.name.replace(`.${parent}`, "");
		// Deeper subdomains (a.b.hack.tez) belong to a member, they are not one.
		if (label.includes(".")) return [];
		const reg = regHashes.get(label);
		return [
			{
				name: d.name,
				label,
				owner: d.owner,
				address: d.address,
				registeredAt: reg?.timestamp ?? null,
				opHash: reg?.hash ?? null,
				profile: parseProfileFromData(d.data ?? []),
			},
		];
	});
}

async function refreshMemberRecords(
	net: ReturnType<typeof getNetwork>,
	redis: Redis,
	cacheKey: string,
): Promise<void> {
	const members = await fetchMemberRecords(net);
	await redis.set(
		cacheKey,
		{ json: JSON.stringify(members), builtAt: Date.now() },
		{ ex: MEMBERS_CACHE_TTL_SEC },
	);
}

/** Directory snapshot, Redis-backed with serve-stale-while-revalidate. */
async function getMemberRecords(net: ReturnType<typeof getNetwork>): Promise<{
	members: MemberRecord[];
	builtAt: number;
	cache: "HIT" | "STALE" | "MISS";
}> {
	const redis = getRedis();
	const cacheKey = `members:v2:${net.name}`;

	if (redis) {
		try {
			const cached = await redis.get<RedisCacheEntry>(cacheKey);
			if (cached?.json && cached?.builtAt) {
				const members = JSON.parse(cached.json) as MemberRecord[];
				const ageSeconds = (Date.now() - cached.builtAt) / 1000;
				if (ageSeconds >= MEMBERS_CACHE_FRESH_SEC) {
					// Stale — answer from it now, rebuild for the next caller.
					refreshMemberRecords(net, redis, cacheKey).catch(() => {});
					return { members, builtAt: cached.builtAt, cache: "STALE" };
				}
				return { members, builtAt: cached.builtAt, cache: "HIT" };
			}
		} catch {
			// Redis unavailable or entry unparseable — fall through to a live build.
		}
	}

	const members = await fetchMemberRecords(net);
	const builtAt = Date.now();
	if (redis) {
		redis
			.set(
				cacheKey,
				{ json: JSON.stringify(members), builtAt },
				{ ex: MEMBERS_CACHE_TTL_SEC },
			)
			.catch(() => {});
	}
	return { members, builtAt, cache: "MISS" };
}

function shapeProjects(
	member: MemberRecord,
	siteUrl: string,
): ApiProject[] {
	return (member.profile.projects ?? []).map((p) => {
		const slug = projectSlug(p.name);
		return {
			...p,
			slug,
			urls: {
				page: `${siteUrl}/u/${encodeURIComponent(member.label)}/p/${encodeURIComponent(slug)}`,
			},
		};
	});
}

function shapeMember(
	member: MemberRecord,
	siteUrl: string,
	hacker: HackerBlock,
): ApiMember {
	const label = encodeURIComponent(member.label);
	const projects = shapeProjects(member, siteUrl);

	const { projects: _raw, ...rest } = member.profile;
	const profile: ApiMemberProfile = { ...rest };
	if (projects.length > 0) profile.projects = projects;

	return {
		name: member.name,
		label: member.label,
		owner: member.owner,
		address: member.address,
		registeredAt: member.registeredAt,
		opHash: member.opHash,
		urls: {
			profile: `${siteUrl}/u/${label}`,
			api: `${siteUrl}/api/v1/members/${label}`,
			avatar: `${siteUrl}/api/v1/avatar/${label}`,
			hackatar: `${siteUrl}/api/v1/hackatar/${label}`,
			shareCard: `${siteUrl}/api/v1/share-card/${label}`,
			tips: `${siteUrl}/api/v1/tips/${label}`,
		},
		profile,
		counts: {
			projects: projects.length,
			skills: member.profile.skills?.length ?? 0,
		},
		primary: hacker.primary === member.name,
		hacker,
	};
}

/** Build the owner-level block for one member out of the whole snapshot. */
function hackerBlockFor(
	member: MemberRecord,
	byOwner: Map<string, MemberRecord[]>,
	primaries: Map<string, string>,
): HackerBlock {
	const siblings = byOwner.get(member.owner) ?? [member];
	return {
		owner: member.owner,
		primary: primaries.get(member.owner) ?? null,
		domains: siblings.map((m) => m.name),
	};
}

/** Index the snapshot by owner once per request. */
function groupByOwner(members: MemberRecord[]): Map<string, MemberRecord[]> {
	const byOwner = new Map<string, MemberRecord[]>();
	for (const m of members) {
		const list = byOwner.get(m.owner);
		if (list) list.push(m);
		else byOwner.set(m.owner, [m]);
	}
	return byOwner;
}

/** Case-insensitive substring match across a set of optional haystacks. */
function matchesQuery(haystacks: Array<string | undefined>, q: string): boolean {
	const needle = q.toLowerCase();
	return haystacks.some((h) => h?.toLowerCase().includes(needle));
}

/** True when the member or any of their projects has a tip jar switched on. */
function hasTipJar(member: MemberRecord): boolean {
	if (member.profile.tips?.enabled) return true;
	return (member.profile.projects ?? []).some((p) => p.tips?.enabled);
}

/**
 * Attach chain-verified tip counters to the given members (`?tips=1`).
 * Only members with a jar are looked up, and the lookup is pipelined, so the
 * whole directory costs two Redis round trips. Sets `null` when the counter
 * store is unavailable, so a consumer can tell "no tips" from "unknown".
 */
async function attachTipCounters(
	shaped: ApiMember[],
	records: Map<string, MemberRecord>,
	net: ReturnType<typeof getNetwork>,
): Promise<void> {
	const redis = getRedis();
	if (!redis) {
		for (const m of shaped) m.tipCounters = null;
		return;
	}

	const labels = shaped
		.filter((m) => {
			const rec = records.get(m.label);
			return rec ? hasTipJar(rec) : false;
		})
		.map((m) => m.label);

	let counters: Map<string, TipCountersWithProjects>;
	try {
		counters = await readTipCountersBulk({ redis, net: net.name, labels });
	} catch {
		for (const m of shaped) m.tipCounters = null;
		return;
	}

	for (const m of shaped) {
		m.tipCounters = counters.get(m.label) ?? {
			count: 0,
			totals: [],
			projects: [],
		};
	}
}

/** Parse and clamp `limit` / `offset`. Returns an error message when invalid. */
function parseWindow(
	url: URL,
	defaultLimit: number,
	maxLimit: number,
): { limit: number; offset: number } | string {
	const rawLimit = url.searchParams.get("limit");
	let limit = defaultLimit;
	if (rawLimit !== null) {
		const parsed = Number.parseInt(rawLimit, 10);
		if (Number.isNaN(parsed) || parsed < 1)
			return "limit must be a positive integer";
		limit = Math.min(parsed, maxLimit);
	}

	const rawOffset = url.searchParams.get("offset");
	let offset = 0;
	if (rawOffset !== null) {
		const parsed = Number.parseInt(rawOffset, 10);
		if (Number.isNaN(parsed) || parsed < 0)
			return "offset must be a non-negative integer";
		offset = parsed;
	}

	return { limit, offset };
}

/** GET /api/v1/members — every member with their whole profile and projects */
async function handleMembers(
	url: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const window = parseWindow(url, MEMBERS_MAX, MEMBERS_MAX);
	if (typeof window === "string") return err(window, "INVALID_INPUT");

	const status = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
	const skill = url.searchParams.get("skill")?.trim().toLowerCase() ?? "";
	const q = url.searchParams.get("q")?.trim() ?? "";
	const owner = url.searchParams.get("owner")?.trim() ?? "";
	if (owner && !TZ_ADDRESS_RE.test(owner))
		return err("owner must be a Tezos address", "INVALID_INPUT");
	const primaryOnly = url.searchParams.get("primary") === "1";
	const hasProjects = url.searchParams.get("hasProjects") === "1";
	const withProjects = url.searchParams.get("projects") !== "none";
	const withTips = url.searchParams.get("tips") === "1";
	const sort = url.searchParams.get("sort") ?? "name";
	if (sort !== "name" && sort !== "newest" && sort !== "oldest")
		return err("sort must be one of: name, newest, oldest", "INVALID_INPUT");

	const { members, builtAt, cache } = await getMemberRecords(net);

	// Owner grouping is computed over the WHOLE snapshot, never the filtered
	// page: a member's `hacker.domains` must list every domain they own, even
	// when a filter excludes some of them from the rows.
	const byOwner = groupByOwner(members);
	const primaries = primaryByOwner(members);

	let filtered = members;
	if (owner) filtered = filtered.filter((m) => m.owner === owner);
	if (primaryOnly)
		filtered = filtered.filter((m) => primaries.get(m.owner) === m.name);
	if (status) filtered = filtered.filter((m) => m.profile.status === status);
	if (skill) {
		filtered = filtered.filter((m) =>
			(m.profile.skills ?? []).some((s) => s.toLowerCase() === skill),
		);
	}
	if (hasProjects)
		filtered = filtered.filter((m) => (m.profile.projects ?? []).length > 0);
	if (q) {
		filtered = filtered.filter((m) =>
			matchesQuery(
				[
					m.label,
					m.profile.name,
					m.profile.nickname,
					m.profile.bio,
					m.profile.location,
					...(m.profile.skills ?? []),
					...(m.profile.projects ?? []).flatMap((p) => [p.name, p.desc]),
				],
				q,
			),
		);
	}

	if (sort !== "name") {
		// Registration time is unknown for preloaded domains — park those last
		// either way, so the head of the list is always meaningful.
		const dir = sort === "newest" ? -1 : 1;
		filtered = [...filtered].sort((a, b) => {
			if (!a.registeredAt && !b.registeredAt) return 0;
			if (!a.registeredAt) return 1;
			if (!b.registeredAt) return -1;
			return dir * a.registeredAt.localeCompare(b.registeredAt);
		});
	}

	const total = filtered.length;
	const page = filtered.slice(window.offset, window.offset + window.limit);
	const siteUrl = url.origin;
	const shaped = page.map((m) =>
		shapeMember(m, siteUrl, hackerBlockFor(m, byOwner, primaries)),
	);

	if (!withProjects) {
		// Counts stay accurate — only the project bodies are dropped.
		for (const m of shaped) delete m.profile.projects;
	}

	if (withTips) {
		await attachTipCounters(
			shaped,
			new Map(page.map((m) => [m.label, m])),
			net,
		);
	}

	return json(
		{
			data: shaped,
			count: shaped.length,
			total,
			limit: window.limit,
			offset: window.offset,
			network: net.name,
			generatedAt: new Date(builtAt).toISOString(),
		},
		200,
		{
			"Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
			"X-Cache": cache,
		},
	);
}

/**
 * GET /api/v1/hackers — the people-level directory: one row per owner.
 *
 * The row IS that owner's primary member object, so anything written against
 * /members works on it unchanged; their other domains hang off `alternates`.
 * Filters match if ANY of the owner's domains match, and the row returned is
 * still the primary.
 */
async function handleHackers(
	url: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const window = parseWindow(url, MEMBERS_MAX, MEMBERS_MAX);
	if (typeof window === "string") return err(window, "INVALID_INPUT");

	const status = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
	const skill = url.searchParams.get("skill")?.trim().toLowerCase() ?? "";
	const q = url.searchParams.get("q")?.trim() ?? "";
	const owner = url.searchParams.get("owner")?.trim() ?? "";
	if (owner && !TZ_ADDRESS_RE.test(owner))
		return err("owner must be a Tezos address", "INVALID_INPUT");
	const hasProjects = url.searchParams.get("hasProjects") === "1";
	const withProjects = url.searchParams.get("projects") !== "none";
	const withTips = url.searchParams.get("tips") === "1";
	const sort = url.searchParams.get("sort") ?? "name";
	if (sort !== "name" && sort !== "newest" && sort !== "oldest")
		return err("sort must be one of: name, newest, oldest", "INVALID_INPUT");

	const { members, builtAt, cache } = await getMemberRecords(net);
	const byOwner = groupByOwner(members);
	const primaries = primaryByOwner(members);

	const matches = (m: MemberRecord): boolean => {
		if (status && m.profile.status !== status) return false;
		if (
			skill &&
			!(m.profile.skills ?? []).some((s) => s.toLowerCase() === skill)
		)
			return false;
		if (hasProjects && (m.profile.projects ?? []).length === 0) return false;
		if (
			q &&
			!matchesQuery(
				[
					m.label,
					m.profile.name,
					m.profile.nickname,
					m.profile.bio,
					m.profile.location,
					...(m.profile.skills ?? []),
					...(m.profile.projects ?? []).flatMap((p) => [p.name, p.desc]),
				],
				q,
			)
		)
			return false;
		return true;
	};

	// One entry per owner, represented by their primary domain.
	let rows: MemberRecord[] = [];
	for (const [ownerAddr, list] of byOwner) {
		if (owner && ownerAddr !== owner) continue;
		if (!list.some(matches)) continue;
		const primaryName = primaries.get(ownerAddr);
		const rep = list.find((m) => m.name === primaryName) ?? list[0];
		if (rep) rows.push(rep);
	}

	rows.sort((a, b) => a.name.localeCompare(b.name));
	if (sort !== "name") {
		const dir = sort === "newest" ? -1 : 1;
		rows = [...rows].sort((a, b) => {
			if (!a.registeredAt && !b.registeredAt) return 0;
			if (!a.registeredAt) return 1;
			if (!b.registeredAt) return -1;
			return dir * a.registeredAt.localeCompare(b.registeredAt);
		});
	}

	const total = rows.length;
	const page = rows.slice(window.offset, window.offset + window.limit);
	const siteUrl = url.origin;

	const shaped = page.map((m) => {
		const hacker = hackerBlockFor(m, byOwner, primaries);
		const row = shapeMember(m, siteUrl, hacker);
		const others = (byOwner.get(m.owner) ?? []).filter(
			(o) => o.name !== m.name,
		);
		if (others.length > 0) {
			row.alternates = others.map((o) => shapeMember(o, siteUrl, hacker));
		}
		return row;
	});

	if (!withProjects) {
		for (const m of shaped) {
			delete m.profile.projects;
			for (const alt of m.alternates ?? []) delete alt.profile.projects;
		}
	}

	if (withTips) {
		await attachTipCounters(
			shaped,
			new Map(page.map((m) => [m.label, m])),
			net,
		);
	}

	return json(
		{
			data: shaped,
			count: shaped.length,
			total,
			limit: window.limit,
			offset: window.offset,
			network: net.name,
			generatedAt: new Date(builtAt).toISOString(),
		},
		200,
		{
			"Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
			"X-Cache": cache,
		},
	);
}

/**
 * Every top-level hack.tez domain an address owns, with profiles parsed.
 * Used by the read-through paths that need owner-scoped facts (`primary`)
 * without going near the directory snapshot.
 */
async function fetchOwnerCandidates(
	owner: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Array<{ name: string; owner: string; profile: HackProfile }>> {
	const suffix = `.hack.${net.tld}`;
	const data = await tedGql<{
		domains: {
			items: Array<{
				name: string;
				owner: string;
				data: Array<{ key: string; value: unknown }>;
			}>;
		};
	}>(
		net.domainsGraphql,
		`query OwnerCandidates($owner: Address!, $parent: String!) {
              domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }, order: { field: NAME, direction: ASC }) {
                items { name owner data { key value } }
              }
            }`,
		{ owner, parent: suffix },
	);
	return data.domains.items.flatMap((d) => {
		// Sub-subdomains belong to a member, they are not one.
		if (d.name.slice(0, -suffix.length).includes(".")) return [];
		return [
			{
				name: d.name,
				owner: d.owner,
				profile: parseProfileFromData(d.data ?? []),
			},
		];
	});
}

/** GET /api/v1/members/:name — one member in the same shape as the list */
async function handleMember(
	name: string,
	url: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const label = normalizeLabel(name, net.tld);
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const fullName = `${label}.hack.${net.tld}`;

	// Read through to TED rather than the directory snapshot: a single lookup
	// should reflect a profile edit immediately, not on the next snapshot.
	const [result, regInfo] = await Promise.all([
		tedGql<{
			domain: {
				name: string;
				address: string | null;
				owner: string;
				data: Array<{ key: string; value: unknown }>;
			} | null;
		}>(
			net.domainsGraphql,
			`query GetMember($name: String!) {
              domain(name: $name) {
                name
                address
                owner
                data { key value }
              }
            }`,
			{ name: fullName },
		),
		getRegistrationHash(label, net),
	]);

	if (!result.domain) return err("Member not found", "NOT_FOUND", 404);

	const record: MemberRecord = {
		name: result.domain.name,
		label,
		owner: result.domain.owner,
		address: result.domain.address,
		registeredAt: regInfo?.timestamp ?? null,
		opHash: regInfo?.hash ?? null,
		profile: parseProfileFromData(result.domain.data ?? []),
	};

	// `primary` is owner-scoped, so it cannot be derived from this record
	// alone. One extra read-through query keeps the field as live as the
	// profile beside it. If it fails, fall back to this domain standing alone
	// rather than failing the whole request.
	let siblings: Array<{ name: string; owner: string; profile: HackProfile }> = [
		record,
	];
	try {
		siblings = await fetchOwnerCandidates(record.owner, net);
	} catch {
		// Degrade: the member is still fully described, `primary` just reflects
		// this domain in isolation.
	}
	const hacker: HackerBlock = {
		owner: record.owner,
		primary: resolvePrimary(record.owner, siblings),
		domains: siblings.map((d) => d.name),
	};

	const shaped = shapeMember(record, url.origin, hacker);
	if (url.searchParams.get("tips") === "1") {
		await attachTipCounters([shaped], new Map([[label, record]]), net);
	}

	return json({ data: shaped, network: net.name }, 200, {
		"Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
	});
}

/** GET /api/v1/projects — every project from every member, flattened */
async function handleProjects(
	url: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const window = parseWindow(url, MEMBERS_MAX, MEMBERS_MAX);
	if (typeof window === "string") return err(window, "INVALID_INPUT");

	const environment =
		url.searchParams.get("environment")?.trim().toLowerCase() ?? "";
	const status = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
	const memberFilter = url.searchParams.get("member")?.trim() ?? "";
	const q = url.searchParams.get("q")?.trim() ?? "";

	const { members, builtAt, cache } = await getMemberRecords(net);
	const siteUrl = url.origin;
	const primaries = primaryByOwner(members);

	const memberLabel = memberFilter
		? normalizeLabel(memberFilter, net.tld)
		: "";

	let rows = members.flatMap((m) => {
		if (memberLabel && m.label !== memberLabel) return [];
		const label = encodeURIComponent(m.label);
		return shapeProjects(m, siteUrl).map((p) => ({
			...p,
			member: {
				name: m.name,
				label: m.label,
				address: m.address,
				owner: m.owner,
				displayName: m.profile.name ?? m.profile.nickname ?? m.label,
				picture: m.profile.picture ?? null,
				primary: primaries.get(m.owner) === m.name,
				primaryDomain: primaries.get(m.owner) ?? null,
				urls: {
					profile: `${siteUrl}/u/${label}`,
					api: `${siteUrl}/api/v1/members/${label}`,
					avatar: `${siteUrl}/api/v1/avatar/${label}`,
				},
			},
		}));
	});

	if (environment) rows = rows.filter((p) => p.environment === environment);
	if (status) rows = rows.filter((p) => p.status === status);
	if (q) {
		rows = rows.filter((p) =>
			matchesQuery([p.name, p.desc, p.url, p.repo, p.member.label], q),
		);
	}

	const total = rows.length;
	const page = rows.slice(window.offset, window.offset + window.limit);

	return json(
		{
			data: page,
			count: page.length,
			total,
			limit: window.limit,
			offset: window.offset,
			network: net.name,
			generatedAt: new Date(builtAt).toISOString(),
		},
		200,
		{
			"Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
			"X-Cache": cache,
		},
	);
}

/** GET /api/v1/activity?limit=30 — recent claim (register) and commit events */
async function handleActivity(
	url: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const registrars = getRegistrarAddresses(net);
	if (registrars.length === 0) {
		return err(
			"Registrar address not configured for this network",
			"UPSTREAM_ERROR",
			503,
		);
	}

	const rawLimit = parseInt(url.searchParams.get("limit") ?? "30", 10);
	if (Number.isNaN(rawLimit) || rawLimit < 1)
		return err("limit must be a positive integer", "INVALID_INPUT");
	const limit = Math.min(rawLimit, 100);

	// Fan out queries to all registrar contracts (current + legacy).
	// Individual fetch failures are treated as empty results — a contract
	// that doesn't exist on this network shouldn't take down the whole endpoint.
	type TzKTOp = {
		hash: string;
		sender: { address: string };
		timestamp: string;
		parameter?: { value?: { label?: string } };
	};

	const allClaims: TzKTOp[] = [];
	const allCommits: TzKTOp[] = [];

	await Promise.all(
		registrars.map(async (addr) => {
			const base =
				`${net.tzktApi}/v1/operations/transactions` +
				`?target=${addr}` +
				`&status=applied` +
				`&sort.desc=id`;
			try {
				const [claimRes, commitRes] = await Promise.all([
					fetch(`${base}&entrypoint=register&limit=${limit}`),
					fetch(`${base}&entrypoint=commit&limit=${Math.min(limit, 50)}`),
				]);
				if (claimRes.ok) allClaims.push(...(await claimRes.json()));
				if (commitRes.ok) allCommits.push(...(await commitRes.json()));
			} catch {
				// Contract may not exist on this network — skip silently
			}
		}),
	);

	const claims = allClaims.map((op) => {
		const rawLabel = op.parameter?.value?.label ?? null;
		const label = rawLabel ? hexToUtf8(rawLabel) : null;
		return {
			type: "claimed" as const,
			address: op.sender.address,
			name: label ? `${label}.hack.${net.tld}` : null,
			timestamp: op.timestamp,
			opHash: op.hash,
		};
	});

	const commits = allCommits.map((op) => ({
		type: "committed" as const,
		address: op.sender.address,
		name: null, // commitment hash is not recoverable
		timestamp: op.timestamp,
		opHash: op.hash,
	}));

	// Merge, sort descending, deduplicate by opHash
	const seen = new Set<string>();
	const events = [...claims, ...commits]
		.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		)
		.filter((e) => {
			if (seen.has(e.opHash)) return false;
			seen.add(e.opHash);
			return true;
		})
		.slice(0, limit);

	return json(
		{ data: events, count: events.length, limit, network: net.name },
		200,
		{
			"Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
		},
	);
}

/** GET /api/v1/config — contract storage config */
async function handleConfig(
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	if (!net.registrarAddress) {
		return json(
			{
				data: {
					minCommitAgeSec: 0,
					maxCommitAgeSec: 0,
					maxPerWallet: 1,
					paused: true,
					registrarAddress: "",
				},
				network: net.name,
			},
			200,
			{ "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
		);
	}

	let storage: Record<string, unknown> = {};
	try {
		const res = await fetch(
			`${net.tzktApi}/v1/contracts/${net.registrarAddress}/storage`,
		);
		if (res.ok) storage = await res.json();
	} catch {
		// Contract may not exist on this network
	}

	return json(
		{
			data: {
				minCommitAgeSec: Number(storage.min_commit_age ?? 0),
				maxCommitAgeSec: Number(storage.max_commit_age ?? 0),
				maxPerWallet: Number(storage.max_per_wallet ?? 1),
				paused: Boolean(storage.paused),
				registrarAddress: net.registrarAddress,
				bskyStarterPackUrl: process.env.BSKY_STARTER_PACK_URL ?? null,
				bskyListUrl: process.env.BSKY_LIST_URL ?? null,
			},
			network: net.name,
		},
		200,
		{ "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
	);
}

// ---------------------------------------------------------------------------
// Hackatar — generative avatar GIF
// ---------------------------------------------------------------------------

const { GIFEncoder, quantize, applyPalette } = gifenc;
const HACKATAR_SIZE = 192;

function encodeGif(
	frames: Uint8ClampedArray[],
	w: number,
	h: number,
	delayMs: number,
): ArrayBuffer {
	const gif = GIFEncoder();
	for (const frame of frames) {
		const palette = quantize(frame, 256, { format: "rgba4444" });
		const indexed = applyPalette(frame, palette, "rgba4444");
		gif.writeFrame(indexed, w, h, {
			palette,
			delay: delayMs,
			transparent: true,
			transparentIndex: 0,
		});
	}
	gif.finish();
	return toArrayBuffer(gif.bytes());
}

async function handleHackatar(
	label: string,
	url: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const isStatic = url.searchParams.has("static");

	// Try blob cache first
	const blobKey = isStatic ? `${label}-static.gif` : `${label}.gif`;
	try {
		const store = getStore("hackatars");
		const cached = await store.get(blobKey, { type: "arrayBuffer" });
		if (cached) {
			return new Response(cached, {
				headers: {
					"Content-Type": "image/gif",
					"Cache-Control": "public, max-age=31536000, immutable",
					...CORS_HEADERS,
				},
			});
		}
	} catch {
		// Blob store unavailable — generate on the fly
	}

	// Verify domain is registered (TED lookup)
	const fullName = `${label}.hack.${net.tld}`;
	const domainRecord = await tedGql<{ domain: { name: string } | null }>(
		net.domainsGraphql,
		`query($name:String!){domain(name:$name){name}}`,
		{ name: fullName },
	);
	if (!domainRecord?.domain) {
		return err("Domain not registered", "NOT_FOUND", 404);
	}

	// Phase 1 seed: salted domain name (deterministic, no opHash required)
	const HACKATAR_SALT = "ReggieRocksFAFO4life";
	const seedStr = `${HACKATAR_SALT}:a7f3c9e2b1d4f805:${label}`;
	const seed = seedFromHash(seedStr);
	const prng = createPrng(seed);
	const traits = selectTraits(prng);

	let rendered: {
		imageBytes: ArrayBuffer;
		altBlobKey: string;
		altImageBytes: ArrayBuffer;
	};
	try {
		if (isStatic) {
			const frame = renderSingleFrame(traits, HACKATAR_SIZE);
			const animResult = renderFrames(traits, HACKATAR_SIZE);
			rendered = {
				imageBytes: encodeGif([frame], HACKATAR_SIZE, HACKATAR_SIZE, 0),
				altBlobKey: `${label}.gif`,
				altImageBytes: encodeGif(
					animResult.frames,
					HACKATAR_SIZE,
					HACKATAR_SIZE,
					animResult.frameDelayMs,
				),
			};
		} else {
			const result = renderFrames(traits, HACKATAR_SIZE);
			const staticFrame = renderSingleFrame(traits, HACKATAR_SIZE);
			rendered = {
				imageBytes: encodeGif(
					result.frames,
					HACKATAR_SIZE,
					HACKATAR_SIZE,
					result.frameDelayMs,
				),
				altBlobKey: `${label}-static.gif`,
				altImageBytes: encodeGif(
					[staticFrame],
					HACKATAR_SIZE,
					HACKATAR_SIZE,
					0,
				),
			};
		}
	} catch {
		return err("Failed to generate hackatar", "GENERATION_FAILED", 500);
	}

	const { imageBytes, altBlobKey, altImageBytes } = rendered;

	// Cache both variants
	try {
		const store = getStore("hackatars");
		await store.set(blobKey, imageBytes);
		await store.set(altBlobKey, altImageBytes);
	} catch {
		// Cache write failed — that's OK
	}

	return new Response(imageBytes, {
		headers: {
			"Content-Type": "image/gif",
			"Cache-Control": "public, max-age=31536000, immutable",
			...CORS_HEADERS,
		},
	});
}

async function handleAvatar(
	label: string,
	reqUrl: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const normalizedLabel = normalizeLabel(label, net.tld);
	const labelErr = validateLabel(normalizedLabel);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const fullName = `${normalizedLabel}.hack.${net.tld}`;
	const result = await tedGql<{
		domain: {
			data: Array<{ key: string; value: unknown }>;
		} | null;
	}>(
		net.domainsGraphql,
		`query GetAvatar($name: String!) {
          domain(name: $name) {
            data { key value }
          }
        }`,
		{ name: fullName },
	);

	if (!result.domain) {
		return err("Domain not registered", "NOT_FOUND", 404);
	}

	const data = result.domain.data ?? [];
	const profile = parseProfileFromData(data);
	const gravatar = data.find((entry) => entry.key === "gravatar:hash")?.value;

	let sourceUrls: string[] = [];
	if (profile.picture?.startsWith("ipfs://")) {
		const cid = profile.picture.replace("ipfs://", "");
		sourceUrls = IPFS_GATEWAYS.map((base) => `${base}${cid}`);
	} else if (profile.picture?.startsWith("https://")) {
		sourceUrls = [profile.picture];
	} else if (typeof gravatar === "string" && gravatar.trim().length > 0) {
		sourceUrls = [
			`https://www.gravatar.com/avatar/${gravatar}?s=400&d=identicon`,
		];
	}

	const fallbackToHackatar = async () => {
		const staticHackatarUrl = new URL(reqUrl);
		staticHackatarUrl.searchParams.set("static", "1");
		return await handleHackatar(normalizedLabel, staticHackatarUrl, net);
	};

	if (sourceUrls.length === 0) return await fallbackToHackatar();

	try {
		// Race the candidates: IPFS gateways vary wildly in latency for the same
		// CID, and a single slow one used to hang the whole function past
		// Netlify's timeout. First image to arrive within the budget wins.
		const image = await Promise.any(
			sourceUrls.map((url) => fetchAvatarImage(url)),
		);
		return new Response(image.bytes, {
			headers: {
				"Content-Type": image.contentType,
				"Cache-Control":
					"public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
				...CORS_HEADERS,
			},
		});
	} catch {
		return await fallbackToHackatar();
	}
}

const IPFS_GATEWAYS = [
	"https://ipfs.fileship.xyz/ipfs/",
	"https://ipfs.io/ipfs/",
	"https://gateway.pinata.cloud/ipfs/",
];

/** Hard ceiling on an upstream avatar fetch, well under the function timeout. */
const AVATAR_FETCH_TIMEOUT_MS = 6000;

async function fetchAvatarImage(
	url: string,
): Promise<{ contentType: string; bytes: ArrayBuffer }> {
	const upstream = await fetch(url, {
		headers: { Accept: "image/*" },
		redirect: "follow",
		signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
	});
	if (!upstream.ok)
		throw new Error(`Avatar upstream returned ${upstream.status}`);

	const contentType = upstream.headers.get("Content-Type")?.toLowerCase() ?? "";
	if (!contentType.startsWith("image/"))
		throw new Error("Avatar upstream did not return an image");

	return { contentType, bytes: await upstream.arrayBuffer() };
}

async function handleShareCard(
	label: string,
	reqUrl: URL,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const normalizedLabel = normalizeLabel(label, net.tld);
	const labelErr = validateLabel(normalizedLabel);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const fullName = `${normalizedLabel}.hack.${net.tld}`;
	const result = await tedGql<{
		domain: {
			name: string;
			owner: string;
			address: string | null;
			data: Array<{ key: string; value: unknown }>;
		} | null;
	}>(
		net.domainsGraphql,
		`query GetShareCard($name: String!) {
          domain(name: $name) {
            name
            owner
            address
            data { key value }
          }
        }`,
		{ name: fullName },
	);

	if (!result.domain) {
		return err("Domain not registered", "NOT_FOUND", 404);
	}

	const profile = parseProfileFromData(result.domain.data ?? []);
	const displayName = profile.name || profile.nickname || label;
	const siteUrl = reqUrl.origin;
	const defaults = getDefaultProfileShareState({
		label: normalizedLabel,
		tld: net.tld,
		fullName,
		displayName,
		bio: profile.bio,
		status: profile.status,
		siteUrl,
	});
	const profileUrl = getProfileShareUrl(normalizedLabel, siteUrl);
	const svg = buildProfileShareSvgWithPaths({
		...PROFILE_SHARE_SIZES.og,
		preset: defaults.preset,
		title: defaults.title,
		subtitle: defaults.subtitle,
		cta: defaults.cta,
		fullName,
		profileUrl,
		statusLabel: formatShareStatus(profile.status),
	});
	// With vector paths, no font rendering needed - count paths instead
	const pathNodeCount = (svg.match(/<path\b/g) ?? []).length;

	console.info("[share-card] render (vector paths)", {
		version: SHARE_CARD_DEBUG_VERSION,
		label: normalizedLabel,
		network: net.name,
		pathNodeCount,
		cwd: process.cwd(),
		fnDir: _fnDir,
	});

	// No font loading needed - text is pre-converted to vector paths
	const pngData = toArrayBuffer(
		new Resvg(svg, {
			fitTo: { mode: "width", value: PROFILE_SHARE_SIZES.og.width },
		})
			.render()
			.asPng(),
	);

	return new Response(pngData, {
		headers: {
			"Content-Type": "image/png",
			// Temporary debug mode: force function execution on every request.
			"Cache-Control": "no-store, max-age=0",
			"X-Share-Card-Version": SHARE_CARD_DEBUG_VERSION,
			"X-Share-Card-Label": normalizedLabel,
			"X-Share-Card-Path-Count": String(pathNodeCount),
			"X-Share-Card-Mode": "vector-paths",
			...CORS_HEADERS,
		},
	});
}

// ---------------------------------------------------------------------------
// Bluesky handle linking handlers
// ---------------------------------------------------------------------------

const DID_RE = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;
const BLUESKY_TIMESTAMP_WINDOW_SEC = 5 * 60;

/** Pack a string as a Micheline expression: 05 01 <4-byte-big-endian-length> <utf8-bytes> */
function packMichelineStringBsky(str: string): string {
	const bytes = new TextEncoder().encode(str);
	const lenHex = bytes.length.toString(16).padStart(8, "0");
	return (
		"0501" +
		lenHex +
		Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	);
}

function buildBlueskyChallenge(
	action: string,
	label: string,
	timestamp: string,
	nonce: string,
): string {
	return `hack.tez — Bluesky ${action} · ${label}.hacktez.com · ${timestamp} · ${nonce}`;
}

async function verifyBlueskyAuth(
	body: Record<string, unknown>,
	action: string,
	label: string,
): Promise<{ address: string } | Response> {
	const { address, publicKey, signature, timestamp, nonce } = body as {
		address?: string;
		publicKey?: string;
		signature?: string;
		timestamp?: string;
		nonce?: string;
	};

	if (!address || !publicKey || !signature || !timestamp || !nonce) {
		return err("Missing auth fields", "BAD_REQUEST");
	}

	// Validate timestamp window
	const ts = new Date(timestamp).getTime();
	if (Number.isNaN(ts)) return err("Invalid timestamp", "BAD_REQUEST");
	const nowMs = Date.now();
	if (Math.abs(nowMs - ts) > BLUESKY_TIMESTAMP_WINDOW_SEC * 1000) {
		return err("Timestamp expired", "TIMESTAMP_INVALID", 401);
	}

	// Verify publicKey hashes to address
	let derivedAddress: string;
	try {
		derivedAddress = getPkhfromPk(publicKey);
	} catch {
		return err("Invalid public key", "INVALID_PUBLIC_KEY", 401);
	}
	if (derivedAddress !== address) {
		return err("Public key does not match address", "KEY_MISMATCH", 401);
	}

	// Verify signature
	const message = buildBlueskyChallenge(action, label, timestamp, nonce);
	const payloadHex = packMichelineStringBsky(message);
	let sigValid: boolean;
	try {
		sigValid = verifySignature(payloadHex, publicKey, signature);
	} catch {
		return err("Signature verification failed", "INVALID_SIGNATURE", 401);
	}
	if (!sigValid) return err("Invalid signature", "INVALID_SIGNATURE", 401);

	return { address };
}

async function verifyLabelOwnership(
	label: string,
	address: string,
	net: NetworkConfig & { name: TezosNetwork },
): Promise<boolean> {
	const fullName = `${label}.hack.${net.tld}`;
	const data = await tedGql<{ domain: { owner: string } | null }>(
		net.domainsGraphql,
		`query DomainOwner($name: String!) {
          domain(name: $name) { owner }
        }`,
		{ name: fullName },
	);
	return data.domain?.owner === address;
}

async function handleBlueskyLink(
	req: Request,
	net: NetworkConfig & { name: TezosNetwork },
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return err("Invalid JSON body", "BAD_REQUEST");
	}

	const label = body.label as string | undefined;
	if (!label) return err("Missing label", "BAD_REQUEST");
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_LABEL");

	const authResult = await verifyBlueskyAuth(body, "link", label);
	if (authResult instanceof Response) return authResult;
	const { address } = authResult;

	const did = body.did as string | undefined;
	if (!did || !DID_RE.test(did)) {
		return err("Invalid or missing DID", "INVALID_DID");
	}

	// Verify label ownership
	let ownsLabel: boolean;
	try {
		ownsLabel = await verifyLabelOwnership(label, address, net);
	} catch {
		return err("Failed to verify domain ownership", "UPSTREAM_ERROR", 502);
	}
	if (!ownsLabel) {
		return err(
			`Address does not own ${label}.hack.${net.tld}`,
			"NOT_OWNER",
			403,
		);
	}

	// DID uniqueness — ensure this DID isn't already linked to a different label
	let existingDid: { hostname: string } | null;
	try {
		existingDid = await findRecordByDid(did);
	} catch {
		return err("Failed to check DID uniqueness", "UPSTREAM_ERROR", 502);
	}
	if (existingDid) {
		const existingLabel = existingDid.hostname
			.replace("_atproto.", "")
			.replace(".hacktez.com", "");
		if (existingLabel !== label) {
			return err(
				`DID is already linked to ${existingLabel}.hacktez.com`,
				"DID_CONFLICT",
				409,
			);
		}
	}

	// Delete any existing record for this label before creating a new one
	try {
		await deleteAtprotoRecord(label);
	} catch {
		// Non-fatal — proceed to create
	}

	let record: { id: string };
	try {
		record = await createAtprotoRecord(label, did);
	} catch {
		return err("Failed to create DNS record", "DNS_ERROR", 502);
	}

	return json({
		data: {
			label,
			did,
			hostname: `_atproto.${label}.hacktez.com`,
			recordId: record.id,
			status: "created",
		},
	});
}

async function handleBlueskyUnlink(
	req: Request,
	net: NetworkConfig & { name: TezosNetwork },
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return err("Invalid JSON body", "BAD_REQUEST");
	}

	const label = body.label as string | undefined;
	if (!label) return err("Missing label", "BAD_REQUEST");
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_LABEL");

	const authResult = await verifyBlueskyAuth(body, "unlink", label);
	if (authResult instanceof Response) return authResult;
	const { address } = authResult;

	let ownsLabel: boolean;
	try {
		ownsLabel = await verifyLabelOwnership(label, address, net);
	} catch {
		return err("Failed to verify domain ownership", "UPSTREAM_ERROR", 502);
	}
	if (!ownsLabel) {
		return err(
			`Address does not own ${label}.hack.${net.tld}`,
			"NOT_OWNER",
			403,
		);
	}

	try {
		await deleteAtprotoRecord(label);
	} catch {
		return err("Failed to remove DNS record", "DNS_ERROR", 502);
	}

	return json({ data: { label, status: "removed" } });
}

async function handleBlueskyStatus(label: string): Promise<Response> {
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_LABEL");

	let record: { id: string; value: string } | null;
	try {
		record = await getAtprotoRecord(label);
	} catch {
		return err("Failed to check DNS record", "DNS_ERROR", 502);
	}

	if (!record) {
		return json({ data: { label, linked: false } });
	}

	const did = record.value.replace(/^did=/, "");
	return json({
		data: {
			label,
			linked: true,
			did,
			handle: `${label}.hacktez.com`,
		},
	});
}

// ---------------------------------------------------------------------------
// Subdomain provisioning
// ---------------------------------------------------------------------------

/** POST /api/v1/domain/:label/provision — create CNAME + domain alias for label.hacktez.com */
async function handleProvision(
	label: string,
	net: NetworkConfig & { name: TezosNetwork },
): Promise<Response> {
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_LABEL");

	// Verify domain is registered before provisioning
	let domainExists: boolean;
	try {
		const data = await tedGql<{ domain: { name: string } | null }>(
			net.domainsGraphql,
			`query CheckDomain($name: String!) { domain(name: $name) { name } }`,
			{ name: `${label}.hack.${net.tld}` },
		);
		domainExists = data.domain !== null;
	} catch {
		return err("Failed to verify domain registration", "UPSTREAM_ERROR", 502);
	}

	if (!domainExists) return err("Domain not registered", "NOT_FOUND", 404);

	const errors: string[] = [];
	await Promise.all([
		createSubdomainCname(label).catch((e) => {
			errors.push(`CNAME: ${e instanceof Error ? e.message : String(e)}`);
		}),
		ensureDomainAlias(label).catch((e) => {
			errors.push(`Alias: ${e instanceof Error ? e.message : String(e)}`);
		}),
	]);

	if (errors.length > 0) {
		return json({ data: { label, status: "partial", errors } }, 207);
	}

	return json({
		data: { label, status: "provisioned", subdomain: `${label}.hacktez.com` },
	});
}

// ---------------------------------------------------------------------------
// Tip counters
// ---------------------------------------------------------------------------

/** Tezos operation hash — base58, 51 chars, always "o"-prefixed. */
const OP_HASH_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;

/**
 * Fetch a domain's TED record and derive every address it legitimately accepts
 * tips at: its resolution address, its owner, and any `payTo` override on the
 * profile jar or a project jar.
 */
async function getTipRecipients(
	label: string,
	net: ReturnType<typeof getNetwork>,
): Promise<{ recipients: Set<string>; projectSlugs: Set<string> } | null> {
	const result = await tedGql<{
		domain: {
			address: string | null;
			owner: string;
			data: Array<{ key: string; value: unknown }>;
		} | null;
	}>(
		net.domainsGraphql,
		`query GetTipTargets($name: String!) {
          domain(name: $name) { address owner data { key value } }
        }`,
		{ name: `${label}.hack.${net.tld}` },
	);
	if (!result.domain) return null;

	const profile = parseProfileFromData(result.domain.data ?? []);

	const recipients = new Set<string>();
	if (result.domain.address) recipients.add(result.domain.address);
	if (result.domain.owner) recipients.add(result.domain.owner);
	if (profile.tips?.payTo) recipients.add(profile.tips.payTo);

	const projectSlugs = new Set<string>();
	for (const p of profile.projects ?? []) {
		projectSlugs.add(projectSlug(p.name));
		if (p.tips?.payTo) recipients.add(p.tips.payTo);
	}

	return { recipients, projectSlugs };
}

/** POST /api/v1/tips/report — body { opHash, label, project? } */
async function handleTipReport(
	req: Request,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const redis = getRedis();
	if (!redis) return err("Tip counters unavailable", "UNAVAILABLE", 503);

	let body: { opHash?: unknown; label?: unknown; project?: unknown };
	try {
		body = await req.json();
	} catch {
		return err("Invalid JSON body", "INVALID_INPUT");
	}

	const opHash = typeof body.opHash === "string" ? body.opHash.trim() : "";
	if (!OP_HASH_RE.test(opHash))
		return err("Invalid operation hash", "INVALID_INPUT");

	const rawLabel = typeof body.label === "string" ? body.label.trim() : "";
	const label = rawLabel.endsWith(`.hack.${net.tld}`)
		? rawLabel.replace(`.hack.${net.tld}`, "")
		: rawLabel;
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const targets = await getTipRecipients(label, net);
	if (!targets) return err("Domain not found", "NOT_FOUND", 404);
	if (targets.recipients.size === 0)
		return err("Domain has no tip recipient", "NO_RECIPIENT");

	// Only count against a project that actually exists on the profile.
	const rawProject = typeof body.project === "string" ? body.project.trim() : "";
	const project =
		rawProject && targets.projectSlugs.has(rawProject) ? rawProject : undefined;

	let amounts: Awaited<ReturnType<typeof verifyTipOperation>>;
	try {
		amounts = await verifyTipOperation({
			tzktApi: net.tzktApi,
			opHash,
			recipients: targets.recipients,
		});
	} catch (e) {
		if (e instanceof TipVerifyError)
			return err(e.message, "NOT_VERIFIED", 422);
		return err("Verification failed", "UPSTREAM_ERROR", 502);
	}

	const counted = await recordTip({
		redis,
		net: net.name,
		label,
		projectSlug: project,
		opHash,
		amounts,
	});

	return json({ data: { counted, label, project: project ?? null }, network: net.name });
}

/** GET /api/v1/tips/:name */
async function handleTips(
	name: string,
	net: ReturnType<typeof getNetwork>,
): Promise<Response> {
	const label = name.endsWith(`.hack.${net.tld}`)
		? name.replace(`.hack.${net.tld}`, "")
		: name;
	const labelErr = validateLabel(label);
	if (labelErr) return err(labelErr, "INVALID_INPUT");

	const redis = getRedis();
	if (!redis) {
		return json(
			{ data: { label, count: 0, totals: [], projects: [] }, network: net.name },
			200,
			{ "Cache-Control": "public, s-maxage=30" },
		);
	}

	const counters = await readTipCounters({ redis, net: net.name, label });
	return json({ data: { label, ...counters }, network: net.name }, 200, {
		"Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
	});
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default async function handler(
	req: Request,
	ctx: Context,
): Promise<Response> {
	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	const route = ctx.params?.route ?? "";
	const segments = route.split("/").filter(Boolean);
	const [resource, param] = segments;

	// Keep pin uploads addressable at /api/v1/pin even when this catch-all route matches first.
	if (req.method === "POST" && resource === "pin") {
		return pinHandler(req, ctx);
	}

	// Delegate ALL /api/v1/wiki/* requests (any method) to the wiki function
	if (resource === "wiki") {
		const wiki = await import("./wiki.mts");
		return wiki.default(req, ctx);
	}

	// Delegate ALL /api/v1/arcade/* requests (any method) to the arcade function
	if (resource === "arcade") {
		const arcade = await import("./arcade.mts");
		return arcade.default(req, ctx);
	}

	// Subdomain provisioning — POST /api/v1/domain/:label/provision
	if (resource === "domain" && param && segments[2] === "provision") {
		if (req.method !== "POST")
			return err("Method not allowed", "METHOD_NOT_ALLOWED", 405);
		const net = getNetwork();
		return handleProvision(decodeURIComponent(param), net);
	}

	// Bluesky handle linking
	//   POST /api/v1/bluesky/link    — label in request body
	//   POST /api/v1/bluesky/unlink  — label in request body
	//   GET  /api/v1/bluesky/:label  — check status
	if (resource === "bluesky") {
		const net = getNetwork();
		if (req.method === "POST" && param === "link")
			return handleBlueskyLink(req, net);
		if (req.method === "POST" && param === "unlink")
			return handleBlueskyUnlink(req, net);
		if (req.method === "GET" && param)
			return handleBlueskyStatus(decodeURIComponent(param));
		if (req.method === "POST")
			return err("Unknown bluesky action", "NOT_FOUND", 404);
		return err("Method not allowed", "METHOD_NOT_ALLOWED", 405);
	}

	// Tip counters — POST /api/v1/tips/report, GET /api/v1/tips/:name
	if (resource === "tips") {
		const net = getNetwork();
		if (req.method === "POST" && param === "report")
			return handleTipReport(req, net);
		if (req.method === "POST")
			return err("Unknown tips action", "NOT_FOUND", 404);
	}

	if (req.method !== "GET") {
		return err("Method not allowed", "METHOD_NOT_ALLOWED", 405);
	}

	const net = getNetwork();

	try {
		if (resource === "domains")
			return await handleDomains(new URL(req.url), net);
		if (resource === "members")
			return param
				? await handleMember(
						decodeURIComponent(param),
						new URL(req.url),
						net,
					)
				: await handleMembers(new URL(req.url), net);
		if (resource === "hackers")
			return param
				? await handleMember(
						decodeURIComponent(param),
						new URL(req.url),
						net,
					)
				: await handleHackers(new URL(req.url), net);
		if (resource === "projects")
			return await handleProjects(new URL(req.url), net);
		if (resource === "domain" && param)
			return await handleDomain(decodeURIComponent(param), net);
		if (resource === "profile" && param)
			return await handleProfile(decodeURIComponent(param), net);
		if (resource === "tips" && param)
			return await handleTips(decodeURIComponent(param), net);
		if (resource === "availability" && param)
			return await handleAvailability(decodeURIComponent(param), net);
		if (resource === "owner" && param)
			return await handleOwner(decodeURIComponent(param), net);
		if (resource === "resolve" && param)
			return await handleResolve(decodeURIComponent(param), net);
		if (resource === "tezosx" && param)
			return await handleTezosX(decodeURIComponent(param), net);
		if (resource === "config") return await handleConfig(net);
		if (resource === "activity")
			return await handleActivity(new URL(req.url), net);
		if (resource === "hackatar" && param)
			return await handleHackatar(
				decodeURIComponent(param),
				new URL(req.url),
				net,
			);
		if (resource === "avatar" && param)
			return await handleAvatar(
				decodeURIComponent(param),
				new URL(req.url),
				net,
			);
		if (resource === "share-card" && param)
			return await handleShareCard(
				decodeURIComponent(param),
				new URL(req.url),
				net,
			);

		return json(
			{
				api: "hack.tez",
				version: "1",
				network: net.name,
				endpoints: [
					`/api/v1/members`,
					`/api/v1/members/:name`,
					`/api/v1/hackers`,
					`/api/v1/projects`,
					`/api/v1/domains?limit=50`,
					`/api/v1/domain/:name`,
					`/api/v1/profile/:name`,
					`/api/v1/availability/:label`,
					`/api/v1/owner/:address`,
					`/api/v1/resolve/:address`,
					`/api/v1/tezosx/:nameOrAddress`,
					`/api/v1/config`,
					`/api/v1/activity?limit=30`,
					`/api/v1/hackatar/:label`,
					`/api/v1/avatar/:label`,
					`/api/v1/share-card/:label`,
				],
				docs: "/developers",
			},
			200,
		);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		return err(message, "UPSTREAM_ERROR", 502);
	}
}

export const config: Config = {
	path: "/api/v1/:route*",
};
