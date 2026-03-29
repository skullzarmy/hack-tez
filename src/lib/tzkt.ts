import config from "../config/tezos";

export type OperationStatus = "applied" | "failed" | "backtracked" | "skipped";

export interface OperationResult {
    status: OperationStatus;
    errorMessage: string | null;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

/** Parse tzkt error array into a human-readable string */
function parseErrors(errors: unknown[]): string {
    if (!Array.isArray(errors) || errors.length === 0) return "Transaction failed";
    for (const err of errors) {
        if (typeof err !== "object" || !err) continue;
        const e = err as Record<string, unknown>;
        // SmartPy assert: { type: "script.runtime_error", with: { string: "MAX_REGISTRATIONS_REACHED" } }
        if (e.type === "script.runtime_error") {
            const w = e.with as Record<string, unknown> | undefined;
            if (w?.string && typeof w.string === "string") return w.string;
            if (w?.int) return `Contract error (code ${w.int})`;
            return "Contract execution failed";
        }
        if (typeof e.type === "string") {
            const humanMap: Record<string, string> = {
                "contract.non_existing_contract": "Contract not found",
                "contract.balance_too_low": "Insufficient balance",
                "contract.empty_transaction": "Empty transaction",
                "michelson_v1.script_rejected": "Contract rejected the transaction",
            };
            if (humanMap[e.type]) return humanMap[e.type];
            return e.type;
        }
    }
    return "Transaction failed";
}

/**
 * Poll tzkt until the operation is included in a block and finalized.
 * Resolves with { status, errorMessage } or rejects on timeout.
 */
export async function waitForOperation(opHash: string): Promise<OperationResult> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const res = await fetch(
            `${config.tzktApi}/v1/operations/transactions/${opHash}?select=status,errors`,
        );
        if (!res.ok) continue;

        const ops = await res.json();
        if (!Array.isArray(ops) || ops.length === 0) continue;

        // All internal ops must be applied for the tx to be considered successful
        const statuses: OperationStatus[] = ops.map((op) => op.status);
        const allApplied = statuses.every((s) => s === "applied");

        if (allApplied) return { status: "applied", errorMessage: null };

        const failed = ops.find((op) => op.status !== "applied");
        if (failed) {
            return {
                status: failed.status,
                errorMessage: parseErrors(failed.errors ?? []),
            };
        }
    }

    throw new Error("Timed out waiting for transaction confirmation");
}
