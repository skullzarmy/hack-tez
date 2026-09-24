/**
 * Sprinkle — hand a group of hack.tez people off to Sprinkler
 * (https://github.com/pixelsushirobot/sprinkler), which pays up to nine
 * wallets in one batched transaction.
 *
 * The whole integration is one link: `?to=` with a comma list of addresses.
 * Sprinkler validates, resolves names/avatars itself, and never lets a link
 * set amounts or sign anything — so there's nothing here to keep in sync
 * beyond the URL. Fewer than nine is fine; Sprinkler leaves open slots.
 *
 * Every mode (random, friends, a directory filter, one profile) is just a
 * different pool fed through `sprinkleRecipients` → `pickRandom` → `sprinkleUrl`.
 */

import type { HackProfile } from "../types/profile";
import { tipJarIsLive } from "../types/profile";

/** Override per deploy (e.g. a fork while the upstream PR is pending). */
export const SPRINKLER_URL: string =
    (import.meta.env.VITE_SPRINKLER_URL || "").trim() || "https://pixelsushirobot.github.io/sprinkler/";

/** Sprinkler's garden is exactly nine. */
export const SPRINKLE_MAX = 9;

/** The fields a directory row / domain record carries that we need. */
export interface SprinkleSource {
    owner: string;
    address: string | null;
    profile: HackProfile;
}

/**
 * Where a sprinkle to this domain should land — the same wallet the tip jar
 * pays (`payTo` → resolution address → owner), or null if the builder hasn't
 * turned their tip jar on. The tip jar is the consent signal: no jar, no pour.
 */
export function sprinkleRecipient(s: SprinkleSource): string | null {
    if (!tipJarIsLive(s.profile.tips)) return null;
    return s.profile.tips?.payTo || s.address || s.owner;
}

/**
 * One recipient per PERSON (owner wallet), not per domain — someone with
 * five names shouldn't be five times as likely to get picked. Prefers the
 * domain they marked primary, else their first domain with a live tip jar.
 */
export function sprinkleRecipients(rows: SprinkleSource[], opts: { exclude?: string | null } = {}): string[] {
    const byOwner = new Map<string, string>();
    const fromPrimary = new Set<string>();
    for (const r of rows) {
        if (opts.exclude && r.owner === opts.exclude) continue;
        const to = sprinkleRecipient(r);
        if (!to || fromPrimary.has(r.owner)) continue;
        const isPrimary = r.profile.primaryFor === r.owner;
        if (isPrimary || !byOwner.has(r.owner)) byOwner.set(r.owner, to);
        if (isPrimary) fromPrimary.add(r.owner);
    }
    // two people can route tips to the same wallet — Sprinkler would drop the dup anyway
    return [...new Set(byOwner.values())];
}

/** Uniform random `n` from `list` (partial Fisher–Yates, crypto-backed). */
export function pickRandom<T>(list: readonly T[], n: number): T[] {
    const a = list.slice();
    const k = Math.min(n, a.length);
    const buf = new Uint32Array(1);
    for (let i = 0; i < k; i++) {
        crypto.getRandomValues(buf);
        const j = i + (buf[0] % (a.length - i));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, k);
}

export function sprinkleUrl(recipients: readonly string[]): string {
    const url = new URL(SPRINKLER_URL);
    url.searchParams.set("to", recipients.slice(0, SPRINKLE_MAX).join(","));
    return url.toString();
}

/** Roll up to nine from the pool and open Sprinkler. Re-rolls every call. */
export function openRandomSprinkle(pool: readonly string[]): void {
    if (pool.length === 0) return;
    window.open(sprinkleUrl(pickRandom(pool, SPRINKLE_MAX)), "_blank", "noopener,noreferrer");
}
