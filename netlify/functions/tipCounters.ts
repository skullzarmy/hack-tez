/**
 * Tip counters — chain-verified, aggregate-only.
 *
 * Tips are ordinary native transfers, so nothing on-chain marks one as a tip.
 * The client reports an operation hash after it confirms; this module then
 * proves the claim against TzKT before counting anything:
 *
 *   1. Resolve the domain's accepted recipient addresses from its TED record
 *      (resolution address, owner, and any payTo overrides on its tip jars).
 *   2. Pull the operation group by hash and keep only `applied` transactions
 *      that actually paid one of those addresses.
 *   3. Sum tez from the transactions and tokens from TzKT's token-transfer
 *      index for the same transaction ids.
 *
 * The only thing the client contributes is "look at this hash" — every number
 * comes from chain. Faking a counter requires really paying the recipient.
 *
 * We store aggregates only: no sender, no per-tip rows, nothing that
 * identifies who tipped. Dedup is keyed on the operation hash so a refresh
 * (or a retry) cannot double-count.
 */
import type { Redis } from "@upstash/redis";

/** Fixed-point scale used for accumulation, independent of token decimals. */
const ACC_DECIMALS = 6;
const ACC_SCALE = 10n ** BigInt(ACC_DECIMALS);

/** Redis INCRBY is int64. Refuse anything that would overflow the counter. */
const INT64_MAX = 9_223_372_036_854_775_807n;

/** Dedup keys live a year — long enough that a replay is never counted twice. */
const DEDUP_TTL_SEC = 365 * 24 * 60 * 60;

export interface TipAssetTotal {
	/** "tez" or "<contract>_<tokenId>" */
	asset: string;
	symbol: string;
	/** Total in display units, e.g. "42.5" */
	total: string;
}

export interface TipCounters {
	count: number;
	totals: TipAssetTotal[];
}

// ── Amount handling ──────────────────────────────────────────────────

/**
 * Raw on-chain units → fixed-point accumulator units (6dp).
 *
 * Accumulating raw units would overflow int64 for high-decimal tokens (kUSD
 * has 18, so ~9.2 kUSD is already past the limit). Normalizing to 6dp first
 * keeps every asset in the same safe range. Sub-microunit dust rounds away,
 * which is irrelevant at tip scale.
 */
export function rawToAcc(raw: string, decimals: number): bigint | null {
	if (!/^\d+$/.test(raw)) return null;
	const n = BigInt(raw);
	if (n <= 0n) return null;
	const acc =
		decimals >= ACC_DECIMALS
			? n / 10n ** BigInt(decimals - ACC_DECIMALS)
			: n * 10n ** BigInt(ACC_DECIMALS - decimals);
	if (acc <= 0n || acc > INT64_MAX) return null;
	return acc;
}

/** Accumulator units → display string, trailing zeros trimmed. */
export function accToDisplay(acc: string | number): string {
	const n = BigInt(acc || 0);
	const whole = n / ACC_SCALE;
	const frac = (n % ACC_SCALE)
		.toString()
		.padStart(ACC_DECIMALS, "0")
		.replace(/0+$/, "");
	return frac ? `${whole}.${frac}` : whole.toString();
}

// ── Redis keys ───────────────────────────────────────────────────────

const profileKey = (net: string, label: string) => `tips:${net}:${label}`;
const projectKey = (net: string, label: string, slug: string) =>
	`tips:${net}:${label}:p:${slug}`;
const projectSetKey = (net: string, label: string) =>
	`tips:${net}:${label}:projects`;
const dedupKey = (net: string, hash: string) => `tips:op:${net}:${hash}`;

// ── Chain verification ───────────────────────────────────────────────

interface TzktTransaction {
	id: number;
	status: string;
	amount: number;
	target?: { address?: string } | null;
	parameter?: { entrypoint?: string } | null;
}

interface TzktTokenTransfer {
	amount: string;
	to?: { address?: string } | null;
	token?: {
		contract?: { address?: string };
		tokenId?: string;
		metadata?: { symbol?: string; name?: string; decimals?: string | number };
	} | null;
}

/** One asset's contribution within a verified operation. */
interface VerifiedAmount {
	asset: string;
	symbol: string;
	acc: bigint;
}

export class TipVerifyError extends Error {}

/**
 * Verify an operation really paid one of `recipients`, and return what it paid.
 * Throws TipVerifyError with a client-safe message when it did not.
 */
export async function verifyTipOperation(params: {
	tzktApi: string;
	opHash: string;
	recipients: Set<string>;
}): Promise<VerifiedAmount[]> {
	const { tzktApi, opHash, recipients } = params;

	const opRes = await fetch(
		`${tzktApi}/v1/operations/transactions/${encodeURIComponent(opHash)}` +
			`?select=id,status,amount,target,parameter`,
	);
	if (!opRes.ok) throw new TipVerifyError("Could not read that operation.");

	const txs: TzktTransaction[] = await opRes.json();
	if (!Array.isArray(txs) || txs.length === 0) {
		throw new TipVerifyError("Operation not found or not yet indexed.");
	}

	const applied = txs.filter((t) => t.status === "applied");
	if (applied.length === 0) {
		throw new TipVerifyError("Operation did not succeed.");
	}

	const byAsset = new Map<string, VerifiedAmount>();
	const add = (asset: string, symbol: string, acc: bigint) => {
		const existing = byAsset.get(asset);
		if (existing) existing.acc += acc;
		else byAsset.set(asset, { asset, symbol, acc });
	};

	// tez — a plain transfer to the recipient, with no entrypoint call.
	for (const t of applied) {
		const to = t.target?.address;
		if (!to || !recipients.has(to)) continue;
		if (t.parameter?.entrypoint) continue;
		const acc = rawToAcc(String(t.amount), 6);
		if (acc) add("tez", "tez", acc);
	}

	// Tokens — resolved via the token-transfer index for the same tx ids, so
	// this works for FA1.2 and FA2 without re-decoding Michelson ourselves.
	const ids = applied.map((t) => t.id).join(",");
	if (ids) {
		const ttRes = await fetch(
			`${tzktApi}/v1/tokens/transfers?transactionId.in=${ids}` +
				`&select=amount,to,token&limit=200`,
		);
		if (ttRes.ok) {
			const transfers: TzktTokenTransfer[] = await ttRes.json();
			for (const tr of transfers) {
				const to = tr.to?.address;
				if (!to || !recipients.has(to)) continue;

				const contract = tr.token?.contract?.address;
				const tokenId = tr.token?.tokenId ?? "0";
				if (!contract) continue;

				const rawDec = tr.token?.metadata?.decimals;
				const decimals =
					typeof rawDec === "number"
						? rawDec
						: typeof rawDec === "string" && /^\d+$/.test(rawDec)
							? Number(rawDec)
							: null;
				if (decimals === null || decimals > 30) continue;

				const acc = rawToAcc(String(tr.amount), decimals);
				if (!acc) continue;

				const symbol = (
					tr.token?.metadata?.symbol ||
					tr.token?.metadata?.name ||
					"token"
				)
					.trim()
					.slice(0, 16);
				add(`${contract}_${tokenId}`, symbol, acc);
			}
		}
	}

	const results = [...byAsset.values()];
	if (results.length === 0) {
		throw new TipVerifyError("That operation didn't pay this profile.");
	}
	return results;
}

// ── Counter writes ───────────────────────────────────────────────────

/**
 * Record a verified tip. Returns false when this hash was already counted.
 *
 * The dedup key is claimed with SET NX before any counter moves, so concurrent
 * reports of the same hash cannot both win.
 */
export async function recordTip(params: {
	redis: Redis;
	net: string;
	label: string;
	projectSlug?: string;
	opHash: string;
	amounts: VerifiedAmount[];
}): Promise<boolean> {
	const { redis, net, label, projectSlug, opHash, amounts } = params;

	const claimed = await redis.set(dedupKey(net, opHash), 1, {
		nx: true,
		ex: DEDUP_TTL_SEC,
	});
	if (claimed === null) return false;

	const targets = [profileKey(net, label)];
	if (projectSlug) targets.push(projectKey(net, label, projectSlug));

	const writes: Promise<unknown>[] = [];
	for (const key of targets) {
		writes.push(redis.hincrby(key, "count", 1));
		for (const a of amounts) {
			writes.push(redis.hincrby(key, `amt:${a.asset}`, Number(a.acc)));
			writes.push(redis.hset(key, { [`sym:${a.asset}`]: a.symbol }));
		}
	}
	if (projectSlug) {
		writes.push(redis.sadd(projectSetKey(net, label), projectSlug));
	}

	await Promise.all(writes);
	return true;
}

// ── Counter reads ────────────────────────────────────────────────────

function shapeCounters(hash: Record<string, unknown> | null): TipCounters {
	if (!hash) return { count: 0, totals: [] };

	const totals: TipAssetTotal[] = [];
	for (const [field, value] of Object.entries(hash)) {
		if (!field.startsWith("amt:")) continue;
		const asset = field.slice(4);
		totals.push({
			asset,
			symbol: String(hash[`sym:${asset}`] ?? asset),
			total: accToDisplay(String(value)),
		});
	}
	// tez first, then biggest totals — stable, useful ordering for display.
	totals.sort((a, b) => {
		if (a.asset === "tez") return -1;
		if (b.asset === "tez") return 1;
		return Number(b.total) - Number(a.total);
	});

	return { count: Number(hash.count ?? 0), totals };
}

export async function readTipCounters(params: {
	redis: Redis;
	net: string;
	label: string;
}): Promise<TipCounters & { projects: Array<TipCounters & { slug: string }> }> {
	const { redis, net, label } = params;

	const [profileHash, slugs] = await Promise.all([
		redis.hgetall<Record<string, unknown>>(profileKey(net, label)),
		redis.smembers<string[]>(projectSetKey(net, label)),
	]);

	const projects: Array<TipCounters & { slug: string }> = [];
	if (Array.isArray(slugs) && slugs.length > 0) {
		const hashes = await Promise.all(
			slugs.map((s) =>
				redis.hgetall<Record<string, unknown>>(projectKey(net, label, s)),
			),
		);
		slugs.forEach((slug, i) => {
			const shaped = shapeCounters(hashes[i]);
			if (shaped.count > 0) projects.push({ slug, ...shaped });
		});
	}

	return { ...shapeCounters(profileHash), projects };
}
