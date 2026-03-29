import {
    getPollCursor,
    setPollCursor,
    findClaimRecipients,
    findCommitRecipients,
} from "../db/index.ts";
import {
    fetchNewClaims,
    fetchNewCommits,
    decodeHexLabel,
    parseRegisterParams,
    parseCommitHash,
} from "./tzkt.ts";
import { broadcastClaim, broadcastCommit } from "./notifier.ts";
import { NETWORK, POLL_INTERVAL_MS } from "../config.ts";
import type { ClaimEvent, CommitEvent } from "../types/index.ts";

let running = false;

// ── Claim polling ─────────────────────────────────────────────────────────────

async function pollClaims(): Promise<void> {
    const lastId = getPollCursor("last_claim_id");
    const ops = await fetchNewClaims(lastId);

    for (const op of ops) {
        try {
            const params = parseRegisterParams(op);
            const label = decodeHexLabel(params.label);
            const recipients = findClaimRecipients(label);

            if (recipients.length > 0) {
                const event: ClaimEvent = {
                    type: "claim",
                    label,
                    owner: op.sender.address,
                    targetAddress: params.target_address,
                    txHash: op.hash,
                    timestamp: op.timestamp,
                    network: NETWORK.name,
                    tld: NETWORK.tld,
                };
                await broadcastClaim(
                    recipients.map((r) => r.chat_id),
                    event
                );
            }
        } catch (err) {
            console.error(`[poller] Failed to process claim op ${op.id}:`, err);
        }

        setPollCursor("last_claim_id", op.id);
    }
}

// ── Commit polling ────────────────────────────────────────────────────────────

async function pollCommits(): Promise<void> {
    const lastId = getPollCursor("last_commit_id");
    const ops = await fetchNewCommits(lastId);

    for (const op of ops) {
        try {
            const recipients = findCommitRecipients();

            if (recipients.length > 0) {
                const event: CommitEvent = {
                    type: "commit",
                    commitmentHash: parseCommitHash(op),
                    sender: op.sender.address,
                    txHash: op.hash,
                    timestamp: op.timestamp,
                    network: NETWORK.name,
                };
                await broadcastCommit(
                    recipients.map((r) => r.chat_id),
                    event
                );
            }
        } catch (err) {
            console.error(`[poller] Failed to process commit op ${op.id}:`, err);
        }

        setPollCursor("last_commit_id", op.id);
    }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
    await Promise.allSettled([pollClaims(), pollCommits()]);
}

export async function startPoller(): Promise<void> {
    if (running) return;
    running = true;

    console.log(
        `[poller] Started — polling every ${POLL_INTERVAL_MS / 1000}s ` +
        `(${NETWORK.name} / ${NETWORK.registrarAddress})`
    );

    // Run immediately on start, then on interval
    await tick();

    while (running) {
        await Bun.sleep(POLL_INTERVAL_MS);
        await tick();
    }
}

export function stopPoller(): void {
    running = false;
}
