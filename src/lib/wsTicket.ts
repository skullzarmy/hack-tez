/**
 * Fetch a short-lived WebSocket ticket from the chat worker.
 *
 * Tickets are single-use, ~60s TTL, signed JWS distinct from the session
 * Bearer (different `purpose` claim). They exist so we never put long-lived
 * Bearer tokens into URLs (URLs leak via logs, Referer, etc.).
 *
 * `authedFetch` handles bearer refresh transparently — if our session token
 * is stale, it'll refresh once before requesting the ticket.
 */
import { authedFetch } from "./authedFetch";
import { hackchatUrl } from "../config/tezos";

export async function fetchWsTicket(): Promise<string | null> {
  try {
    const res = await authedFetch(`${hackchatUrl}/auth/ws-ticket`, { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}
