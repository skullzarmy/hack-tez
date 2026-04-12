/**
 * Push notification delivery for hackchat.
 * Uses @pushforge/builder for Web Push protocol (VAPID + RFC 8030/8291).
 * Runs on Cloudflare Workers — Web Crypto API only, no Node.js deps.
 */
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { D1Database } from "@cloudflare/workers-types";

interface PushEnv {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
  [key: string]: unknown;
}

interface PushSubscriptionRow {
  id: number;
  domain: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushResult {
  sent: number;
  failed: number;
}

function parsePrivateKey(raw: string): JsonWebKey {
  try {
    return JSON.parse(raw) as JsonWebKey;
  } catch {
    throw new Error("VAPID_PRIVATE_KEY must be a valid JWK JSON string");
  }
}

/** Check if a domain has push enabled for a given notification type */
async function checkPreferences(
  db: D1Database,
  domain: string,
  type: "dms" | "mentions" | "broadcasts",
): Promise<boolean> {
  const row = await db
    .prepare("SELECT push_enabled, push_dms, push_mentions, push_broadcasts, quiet_start, quiet_end FROM push_preferences WHERE domain = ?")
    .bind(domain)
    .first<{ push_enabled: number; push_dms: number; push_mentions: number; push_broadcasts: number; quiet_start: string | null; quiet_end: string | null }>();

  // No preferences row = all defaults enabled
  if (!row) return true;
  if (!row.push_enabled) return false;

  const typeMap = { dms: row.push_dms, mentions: row.push_mentions, broadcasts: row.push_broadcasts };
  if (!typeMap[type]) return false;

  // Quiet hours check
  if (row.quiet_start && row.quiet_end) {
    const now = new Date();
    const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    const start = row.quiet_start;
    const end = row.quiet_end;
    if (start <= end) {
      if (hhmm >= start && hhmm < end) return false;
    } else {
      // Wraps midnight (e.g. 22:00 → 08:00)
      if (hhmm >= start || hhmm < end) return false;
    }
  }

  return true;
}

/** Send a push notification to a single subscription. Returns HTTP status or 0 on network error. */
async function sendToSubscription(
  sub: PushSubscriptionRow,
  payload: PushPayload,
  privateJWK: JsonWebKey,
  subject: string,
): Promise<number> {
  try {
    const { endpoint, headers, body } = await buildPushHTTPRequest({
      privateJWK,
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      message: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: payload as any,
        adminContact: subject,
      },
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });

    return res.status;
  } catch (err) {
    console.error("Push send error:", err);
    return 0;
  }
}

/** Send push notification to all subscriptions for a domain */
export async function sendPushToUser(
  env: PushEnv,
  domain: string,
  payload: PushPayload,
  type: "dms" | "mentions" | "broadcasts" = "dms",
): Promise<PushResult> {
  // Check user preferences
  const allowed = await checkPreferences(env.DB, domain, type);
  if (!allowed) return { sent: 0, failed: 0 };

  const subs = await env.DB
    .prepare("SELECT id, domain, endpoint, p256dh, auth FROM push_subscriptions WHERE domain = ?")
    .bind(domain)
    .all<PushSubscriptionRow>();

  if (!subs.results?.length) return { sent: 0, failed: 0 };

  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return { sent: 0, failed: 0 };
  const privateJWK = parsePrivateKey(env.VAPID_PRIVATE_KEY);
  let sent = 0;
  let failed = 0;
  const expiredIds: number[] = [];

  await Promise.all(
    subs.results.map(async (sub) => {
      const status = await sendToSubscription(sub, payload, privateJWK, env.VAPID_SUBJECT ?? "");
      if (status >= 200 && status < 300) {
        sent++;
        // Update last_used timestamp
        await env.DB
          .prepare("UPDATE push_subscriptions SET last_used = datetime('now') WHERE id = ?")
          .bind(sub.id)
          .run()
          .catch(() => {});
      } else {
        failed++;
        // Only delete on definitive expired/invalid (404/410)
        if (status === 404 || status === 410) {
          expiredIds.push(sub.id);
        }
      }
    }),
  );

  // Clean up expired/invalid subscriptions
  if (expiredIds.length > 0) {
    await env.DB
      .prepare(`DELETE FROM push_subscriptions WHERE id IN (${expiredIds.map(() => "?").join(",")})`)
      .bind(...expiredIds)
      .run()
      .catch((err) => console.error("Failed to clean expired subs:", err));
  }

  return { sent, failed };
}

/** Broadcast push notification to all subscribers (admin broadcasts) */
export async function sendPushBroadcast(
  env: PushEnv,
  payload: PushPayload,
  excludeDomain?: string,
): Promise<PushResult> {
  // Get all unique domains that have subscriptions
  const domains = await env.DB
    .prepare("SELECT DISTINCT domain FROM push_subscriptions")
    .all<{ domain: string }>();

  if (!domains.results?.length) return { sent: 0, failed: 0 };

  let totalSent = 0;
  let totalFailed = 0;

  await Promise.all(
    domains.results
      .filter((d) => d.domain !== excludeDomain)
      .map(async (d) => {
        const result = await sendPushToUser(env, d.domain, payload, "broadcasts");
        totalSent += result.sent;
        totalFailed += result.failed;
      }),
  );

  return { sent: totalSent, failed: totalFailed };
}

/** Detect @mentions in message content, returns list of full domain names */
export function detectMentions(content: string, networkTld: string): string[] {
  if (!content) return [];
  // Require word boundary before @, match valid TED labels (alphanumeric + internal hyphens)
  const pattern = /(^|[^a-z0-9._-])@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?=$|[^a-z0-9-])/gi;
  const mentions = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const label = match[2].toLowerCase();
    mentions.add(`${label}.hack.${networkTld}`);
  }
  return [...mentions];
}
