import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "../config.ts";
import type { Subscription } from "../types/index.ts";

// ── Initialise ────────────────────────────────────────────────────────────────

mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL;`);

db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id         INTEGER NOT NULL,
        user_id         INTEGER NOT NULL,
        subdomain       TEXT,                               -- NULL = global
        claims_enabled  INTEGER NOT NULL DEFAULT 1,
        commits_enabled INTEGER NOT NULL DEFAULT 1,
        created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE (chat_id, subdomain)
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS poll_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`);

// ── Poll state ────────────────────────────────────────────────────────────────

export function getPollCursor(key: "last_claim_id" | "last_commit_id"): number {
    const row = db
        .query<{ value: string }, [string]>("SELECT value FROM poll_state WHERE key = ?")
        .get(key);
    return row ? parseInt(row.value, 10) : 0;
}

export function setPollCursor(key: "last_claim_id" | "last_commit_id", value: number): void {
    db.query(
        "INSERT INTO poll_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(key, String(value));
}

// ── Subscription queries ──────────────────────────────────────────────────────

/** Create or return existing subscription (all alerts on by default). */
export function upsertSubscription(
    chatId: number,
    userId: number,
    subdomain: string | null
): Subscription {
    db.query(`
        INSERT INTO subscriptions (chat_id, user_id, subdomain)
        VALUES (?, ?, ?)
        ON CONFLICT (chat_id, subdomain) DO UPDATE SET
            updated_at = unixepoch()
    `).run(chatId, userId, subdomain);

    return getSubscription(chatId, subdomain)!;
}

export function getSubscription(chatId: number, subdomain: string | null): Subscription | null {
    return db
        .query<Subscription, [number, string | null]>(
            "SELECT * FROM subscriptions WHERE chat_id = ? AND subdomain IS ?"
        )
        .get(chatId, subdomain);
}

export function deleteSubscription(chatId: number, subdomain: string | null): boolean {
    const info = db
        .query("DELETE FROM subscriptions WHERE chat_id = ? AND subdomain IS ?")
        .run(chatId, subdomain);
    return info.changes > 0;
}

export function setAlertFlags(
    chatId: number,
    subdomain: string | null,
    patch: { claims_enabled?: 0 | 1; commits_enabled?: 0 | 1 }
): boolean {
    const parts: string[] = [];
    const params: (number | string | null)[] = [];

    if (patch.claims_enabled !== undefined) {
        parts.push("claims_enabled = ?");
        params.push(patch.claims_enabled);
    }
    if (patch.commits_enabled !== undefined) {
        parts.push("commits_enabled = ?");
        params.push(patch.commits_enabled);
    }
    if (parts.length === 0) return false;

    parts.push("updated_at = unixepoch()");
    params.push(chatId, subdomain);

    const info = db
        .query(
            `UPDATE subscriptions SET ${parts.join(", ")} WHERE chat_id = ? AND subdomain IS ?`
        )
        .run(...(params as (string | number | null)[]));
    return info.changes > 0;
}

/** All subscriptions for a chat (ordered: global first, then by subdomain). */
export function listSubscriptions(chatId: number): Subscription[] {
    return db
        .query<Subscription, [number]>(
            "SELECT * FROM subscriptions WHERE chat_id = ? ORDER BY subdomain IS NOT NULL, subdomain"
        )
        .all(chatId);
}

/** All subscriptions in the system (admin view). */
export function listAllSubscriptions(): Subscription[] {
    return db
        .query<Subscription, []>(
            "SELECT * FROM subscriptions ORDER BY chat_id, subdomain IS NOT NULL, subdomain"
        )
        .all();
}

/**
 * Find all chats that should receive a claim alert for `label`.
 * Includes: global claim subscribers + per-subdomain claim subscribers for this label.
 */
export function findClaimRecipients(label: string): Subscription[] {
    return db
        .query<Subscription, [string]>(
            `SELECT * FROM subscriptions
             WHERE claims_enabled = 1
               AND (subdomain IS NULL OR subdomain = ?)
             ORDER BY chat_id`
        )
        .all(label);
}

/** Find all chats that should receive commit alerts (global subscribers only). */
export function findCommitRecipients(): Subscription[] {
    return db
        .query<Subscription, []>(
            "SELECT * FROM subscriptions WHERE commits_enabled = 1 AND subdomain IS NULL ORDER BY chat_id"
        )
        .all();
}
