/**
 * MatterDeFi farm discovery and "reap" (full exit) op builder.
 *
 * MatterDeFi is mainnet-only. All addresses + tzkt URLs here are mainnet —
 * do not parameterize by config. The page that uses this gates on
 * config.name === "mainnet" and explains the requirement to the user.
 *
 * Every farm — core and user-created — lives on one contract ("Matter Live",
 * a Genius Contracts / SalsaDAO deployment). Storage is MasterChef-shaped:
 *   farms_internal    : farm_id → { staking_token, reward_token, total_staked,
 *                                   reward_per_sec, reward_per_share, ... }
 *   accounts_internal : (farm_id, user_address) → { staked, reward, last_rps }
 *
 * How a full exit works:
 *   1. `unstake(amount, farm_id)` — returns the staking tokens and folds any
 *      newly accrued reward into the account's `reward` accumulator.
 *   2. `claim(farm_id)` — pays out floor(reward / 1e18) in the reward token
 *      (accumulators are scaled by 1e18; the remainder stays behind as dust).
 *
 * `claim` with nothing pending succeeds and transfers 0 (verified on-chain),
 * so the reaper always batches unstake + claim per farm — after both, the
 * farm is empty for the user.
 */
import type { DAppClient, MichelineMichelsonV1Expression, TezosOperationType } from "@tezos-x/octez.connect-sdk";
// Generic raw-nat formatters + token ref shape shared with the coldmilk lab.
import { formatBalance, formatTokenAmount, type TokenRef } from "./spicy";

/** "Matter Live" — the single MatterDeFi farms contract (mainnet). */
export const MATTER_FARMS = "KT1FYct7DUK1mUkk9BPJEg7AeH7Fq3hQ9ah3";

/** SalsaDAO Staking Admin — creator of the core farms. Farms created by
 *  anyone else are the community ("user created") farms. */
export const MATTER_ADMIN = "tz1YFxWGfE7K8wQkKBVerB21HbNEiLpA2ch9";

/** Hardcoded mainnet TzKT — the matter reaper is mainnet-only. */
export const MATTER_TZKT = "https://api.tzkt.io";

/** Reward accumulators (`reward`, `reward_per_share`, `last_rps`) are scaled
 *  by 1e18; `claim` pays floor(reward / 1e18) in raw reward-token units. */
const REWARD_SCALE = 10n ** 18n;

export { formatBalance, formatTokenAmount };
export type { TokenRef };

interface FarmTokenId {
    fa2_address: string;
    token_id: string;
}

export interface MatterFarm {
    id: string;
    creator: string;
    /** true when the farm was created by the SalsaDAO admin ("core" farm). */
    core: boolean;
    inactive: boolean;
    endTime: string;
    lastUpdateTime: string;
    totalStaked: string;
    rewardPerSec: string;
    rewardPerShare: string;
    stakingToken: FarmTokenId;
    rewardToken: FarmTokenId;
    /** FA2 metadata for the tokens — undefined while loading or on failure. */
    stakingMeta?: TokenRef;
    rewardMeta?: TokenRef;
}

export interface MatterPosition {
    farmId: string;
    /** Raw staked amount in staking-token units. */
    staked: string;
    /** Reward accumulator, scaled by 1e18 (NOT raw token units). */
    reward: string;
    lastRps: string;
    /** Enriched farm details — undefined while loading or if enrichment failed. */
    farm?: MatterFarm;
}

interface TzktAccountKeyRow {
    key: { farm_id: string; user_address: string };
    value: { staked: string; reward: string; last_rps: string };
}

interface TzktFarmKeyRow {
    key: string;
    value: {
        creator: string;
        inactive: boolean;
        end_time: string;
        lastUpdateTime: string;
        total_staked: string;
        reward_per_sec: string;
        reward_per_share: string;
        staking_token: FarmTokenId;
        reward_token: FarmTokenId;
    };
}

interface TzktTokenRow {
    contract: { address: string };
    tokenId: string;
    metadata?: { symbol?: string; name?: string; decimals?: string };
}

/** Find every Matter farm position the address holds — anything with stake
 *  still in, or enough accumulated reward to pay out at least 1 raw unit.
 *  Returned positions have account state only; call enrichMatterPositions
 *  to add farm/token details. */
export async function findUserMatterPositions(address: string): Promise<MatterPosition[]> {
    const url =
        `${MATTER_TZKT}/v1/contracts/${MATTER_FARMS}/bigmaps/accounts_internal/keys` +
        `?key.user_address=${encodeURIComponent(address)}` +
        `&active=true&select=key,value&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`matter: position lookup failed (${res.status})`);
    const rows = (await res.json()) as TzktAccountKeyRow[];
    const positions: MatterPosition[] = [];
    for (const row of rows) {
        const staked = row.value.staked;
        const reward = row.value.reward;
        // Skip rows that would reap nothing: no stake and a reward accumulator
        // too small to pay a single raw unit of the reward token.
        if (staked === "0" && BigInt(reward) < REWARD_SCALE) continue;
        positions.push({
            farmId: row.key.farm_id,
            staked,
            reward,
            lastRps: row.value.last_rps,
        });
    }
    positions.sort((a, b) => Number(a.farmId) - Number(b.farmId));
    return positions;
}

/** Fetch farm rows + token metadata for the given positions. Non-destructive —
 *  returns a new array with `farm` populated where possible. Failures are
 *  tolerated per-farm; that position just keeps `farm: undefined`. */
export async function enrichMatterPositions(positions: MatterPosition[]): Promise<MatterPosition[]> {
    if (positions.length === 0) return positions;

    // Step 1: fetch the farm rows for all held farm_ids in one request.
    const ids = positions.map((p) => p.farmId);
    const farmsById = new Map<string, MatterFarm>();
    try {
        const res = await fetch(
            `${MATTER_TZKT}/v1/contracts/${MATTER_FARMS}/bigmaps/farms_internal/keys` +
                `?key.in=${ids.join(",")}&select=key,value&limit=${ids.length}`,
        );
        if (!res.ok) throw new Error(`matter: farm lookup failed (${res.status})`);
        const rows = (await res.json()) as TzktFarmKeyRow[];
        for (const r of rows) {
            farmsById.set(r.key, {
                id: r.key,
                creator: r.value.creator,
                core: r.value.creator === MATTER_ADMIN,
                inactive: r.value.inactive,
                endTime: r.value.end_time,
                lastUpdateTime: r.value.lastUpdateTime,
                totalStaked: r.value.total_staked,
                rewardPerSec: r.value.reward_per_sec,
                rewardPerShare: r.value.reward_per_share,
                stakingToken: r.value.staking_token,
                rewardToken: r.value.reward_token,
            });
        }
    } catch {
        return positions;
    }

    // Step 2: collect unique (contract, tokenId) pairs across staking + reward tokens.
    const tokenKeys = new Set<string>();
    for (const farm of farmsById.values()) {
        tokenKeys.add(`${farm.stakingToken.fa2_address}|${farm.stakingToken.token_id}`);
        tokenKeys.add(`${farm.rewardToken.fa2_address}|${farm.rewardToken.token_id}`);
    }

    // Step 3: batch-fetch metadata, grouped by contract to minimize requests.
    const tokenMeta = new Map<string, TokenRef>();
    const byContract = new Map<string, Set<string>>();
    for (const key of tokenKeys) {
        const [contract, id] = key.split("|");
        if (!byContract.has(contract)) byContract.set(contract, new Set());
        byContract.get(contract)?.add(id);
    }
    await Promise.all(
        Array.from(byContract.entries()).map(async ([contract, tokenIds]) => {
            try {
                const idList = Array.from(tokenIds).join(",");
                const res = await fetch(
                    `${MATTER_TZKT}/v1/tokens?contract=${contract}&tokenId.in=${idList}&limit=${tokenIds.size}`,
                );
                if (!res.ok) return;
                const rows = (await res.json()) as TzktTokenRow[];
                for (const r of rows) {
                    const key = `${r.contract.address}|${r.tokenId}`;
                    const decRaw = r.metadata?.decimals;
                    tokenMeta.set(key, {
                        contract: r.contract.address,
                        tokenId: r.tokenId,
                        symbol: r.metadata?.symbol ?? r.metadata?.name ?? "?",
                        decimals: decRaw ? Number.parseInt(decRaw, 10) || 0 : 0,
                    });
                }
            } catch {
                /* per-contract failure is tolerated */
            }
        }),
    );

    // Step 4: stitch farm + metadata back onto each position.
    return positions.map((p) => {
        const farm = farmsById.get(p.farmId);
        if (!farm) return p;
        return {
            ...p,
            farm: {
                ...farm,
                stakingMeta: tokenMeta.get(`${farm.stakingToken.fa2_address}|${farm.stakingToken.token_id}`),
                rewardMeta: tokenMeta.get(`${farm.rewardToken.fa2_address}|${farm.rewardToken.token_id}`),
            },
        };
    });
}

/** Estimate the raw reward-token payout a claim would produce right now:
 *  stored accumulator + accrual since the farm's last update, divided by the
 *  1e18 scale. Display-only — the contract does the authoritative math.
 *  Returns null when the farm isn't enriched yet. */
export function computePendingReward(position: MatterPosition): string | null {
    const farm = position.farm;
    if (!farm) return null;
    try {
        let rps = BigInt(farm.rewardPerShare);
        const totalStaked = BigInt(farm.totalStaked);
        const now = Math.floor(Date.now() / 1000);
        const end = Math.floor(Date.parse(farm.endTime) / 1000);
        const last = Math.floor(Date.parse(farm.lastUpdateTime) / 1000);
        const until = Math.min(now, end);
        if (totalStaked > 0n && until > last) {
            rps += (BigInt(until - last) * BigInt(farm.rewardPerSec)) / totalStaked;
        }
        const delta = rps - BigInt(position.lastRps);
        const accrued = BigInt(position.reward) + (delta > 0n ? BigInt(position.staked) * delta : 0n);
        return (accrued / REWARD_SCALE).toString();
    } catch {
        return null;
    }
}

/** Build the op batch that fully exits a single farm: unstake everything
 *  (skipped when nothing is staked), then claim whatever is owed. */
export function buildReapOps(params: {
    farmId: string;
    /** Raw staked amount to withdraw (string of digits; "0" skips the unstake). */
    staked: string;
}): Array<{
    kind: TezosOperationType.TRANSACTION;
    destination: string;
    amount: string;
    parameters: { entrypoint: string; value: MichelineMichelsonV1Expression };
}> {
    const { farmId, staked } = params;
    const ops: Array<{
        kind: TezosOperationType.TRANSACTION;
        destination: string;
        amount: string;
        parameters: { entrypoint: string; value: MichelineMichelsonV1Expression };
    }> = [];

    if (staked !== "0" && staked !== "") {
        // unstake: pair (nat %amount) (nat %farm_id)
        ops.push({
            kind: "transaction" as TezosOperationType.TRANSACTION,
            destination: MATTER_FARMS,
            amount: "0",
            parameters: {
                entrypoint: "unstake",
                value: { prim: "Pair", args: [{ int: staked }, { int: farmId }] },
            },
        });
    }

    // claim: nat %farm_id — safe with zero pending (transfers 0).
    ops.push({
        kind: "transaction" as TezosOperationType.TRANSACTION,
        destination: MATTER_FARMS,
        amount: "0",
        parameters: { entrypoint: "claim", value: { int: farmId } },
    });

    return ops;
}

/** Submit a reap for one or more farm positions in a single op group. */
export async function submitReap(
    client: DAppClient,
    positions: Array<{ farmId: string; staked: string }>,
): Promise<{ transactionHash: string }> {
    if (positions.length === 0) throw new Error("nothing to reap");
    const ops = positions.flatMap((p) => buildReapOps(p));
    const result = await client.requestOperation({ operationDetails: ops });
    return { transactionHash: (result as { transactionHash: string }).transactionHash };
}
