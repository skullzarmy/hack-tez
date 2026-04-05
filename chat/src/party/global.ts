import type { Party, Server, Connection } from "partykit/server";
import { jwtVerify } from "jose";
import { getOwnedDomains } from "../auth/verify.js";

interface TokenPayload {
  address: string;
  domains: string[];
  activeDomain: string;
}

// Message rate limiting: max 10 messages per 30 seconds per connection
const MSG_RATE_WINDOW_MS = 30_000;
const MSG_RATE_MAX = 10;

interface RateEntry {
  timestamps: number[];
}

// Ownership re-verification interval (15 minutes)
const REVERIFY_INTERVAL_MS = 15 * 60 * 1000;

interface D1Result {
  results: Array<Record<string, unknown>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<D1Result>;
  run(): Promise<unknown>;
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

function sendJson(conn: Connection, data: unknown): void {
  conn.send(JSON.stringify(data));
}

export default class GlobalRoom implements Server {
  readonly room: Party;
  private msgRateMap = new Map<string, RateEntry>();
  private reverifyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(room: Party) {
    this.room = room;
  }

  private getDb(): D1Database {
    return (this.room.env as Record<string, unknown>).DB as D1Database;
  }

  private getSecret(): Uint8Array {
    const secret = (this.room.env as Record<string, unknown>).CHAT_JWT_SECRET as string;
    return new TextEncoder().encode(secret);
  }

  private getNetwork(): "ghostnet" | "mainnet" {
    const net = (this.room.env as Record<string, unknown>).TEZOS_NETWORK as string | undefined;
    return net === "mainnet" ? "mainnet" : "ghostnet";
  }

  private getDomain(conn: Connection): string | null {
    const state = conn.state as Record<string, unknown> | null;
    return (state?.domain as string) ?? null;
  }

  private getAddress(conn: Connection): string | null {
    const state = conn.state as Record<string, unknown> | null;
    return (state?.address as string) ?? null;
  }

  private getDomains(conn: Connection): string[] {
    const state = conn.state as Record<string, unknown> | null;
    return (state?.domains as string[]) ?? [];
  }

  private getOnlineDomains(): string[] {
    const domains = new Set<string>();
    for (const conn of this.room.getConnections()) {
      const domain = this.getDomain(conn);
      if (domain) domains.add(domain);
    }
    return [...domains];
  }

  private checkMessageRate(connId: string): boolean {
    const now = Date.now();
    let entry = this.msgRateMap.get(connId);
    if (!entry) {
      entry = { timestamps: [] };
      this.msgRateMap.set(connId, entry);
    }
    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < MSG_RATE_WINDOW_MS);
    if (entry.timestamps.length >= MSG_RATE_MAX) return false;
    entry.timestamps.push(now);
    return true;
  }

  private ensureReverifyTimer(): void {
    if (this.reverifyTimer) return;
    this.reverifyTimer = setInterval(() => {
      this.reverifyOwnership().catch((err) => console.error("Reverify error:", err));
    }, REVERIFY_INTERVAL_MS);
  }

  private async reverifyOwnership(): Promise<void> {
    const network = this.getNetwork();
    // Collect unique (address, domain) pairs
    const pairs = new Map<string, Set<string>>();
    for (const conn of this.room.getConnections()) {
      const addr = this.getAddress(conn);
      const domain = this.getDomain(conn);
      if (!addr || !domain) continue;
      if (!pairs.has(addr)) pairs.set(addr, new Set());
      pairs.get(addr)!.add(domain);
    }

    // Check each address
    for (const [address, domains] of pairs) {
      let ownedDomains: string[];
      try {
        ownedDomains = await getOwnedDomains(address, network);
      } catch (err) {
        console.error(`Reverify lookup failed for ${address}:`, err);
        continue; // Don't disconnect on transient errors
      }

      for (const domain of domains) {
        if (ownedDomains.includes(domain)) continue;
        // Ownership changed — disconnect all connections using this domain
        for (const conn of this.room.getConnections()) {
          if (this.getDomain(conn) === domain && this.getAddress(conn) === address) {
            sendJson(conn, {
              type: "error",
              code: "OWNERSHIP_CHANGED",
              message: "Domain ownership changed — please re-authenticate",
            });
            conn.close(4003, "Domain ownership changed");
          }
        }
      }
    }
  }

  async onConnect(conn: Connection) {
    this.ensureReverifyTimer();

    const url = new URL(conn.uri, "http://dummy");
    const token = url.searchParams.get("token");
    if (!token) {
      sendJson(conn, { type: "error", code: "AUTH_REQUIRED", message: "Missing token" });
      conn.close(4001, "Missing token");
      return;
    }

    let payload: TokenPayload;
    try {
      const { payload: claims } = await jwtVerify(token, this.getSecret(), {
        algorithms: ["HS256"],
      });
      payload = claims as unknown as TokenPayload;
      if (!payload.activeDomain) throw new Error("Missing activeDomain");
    } catch {
      sendJson(conn, { type: "error", code: "AUTH_INVALID", message: "Invalid or expired token" });
      conn.close(4001, "Invalid token");
      return;
    }

    // Store identity on connection (include full domains list for switch-identity)
    conn.setState({
      domain: payload.activeDomain,
      address: payload.address,
      domains: payload.domains,
    });

    // Send system welcome
    sendJson(conn, {
      type: "system",
      content: `Welcome to hack.tez global chat, ${payload.activeDomain}!`,
      timestamp: new Date().toISOString(),
    });

    // Send current online users to the new connection
    const onlineDomains = this.getOnlineDomains();
    for (const domain of onlineDomains) {
      sendJson(conn, { type: "presence", domain, status: "online" });
    }

    // Broadcast presence of new user to all others
    this.room.broadcast(
      JSON.stringify({ type: "presence", domain: payload.activeDomain, status: "online" }),
      [conn.id],
    );
  }

  async onMessage(message: string, sender: Connection) {
    const domain = this.getDomain(sender);
    if (!domain) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message) as Record<string, unknown>;
    } catch {
      sendJson(sender, { type: "error", code: "INVALID_JSON", message: "Invalid JSON" });
      return;
    }

    switch (parsed.type) {
      case "message":
        if (!this.checkMessageRate(sender.id)) {
          sendJson(sender, {
            type: "error",
            code: "RATE_LIMITED",
            message: "Slow down! Max 10 messages per 30 seconds.",
          });
          return;
        }
        await this.handleChatMessage(sender, domain, parsed.content as string);
        break;
      case "typing":
        this.handleTyping(sender, domain, parsed.active as boolean);
        break;
      case "switch-identity":
        this.handleSwitchIdentity(sender, domain, parsed.domain as string);
        break;
      case "history":
        await this.handleHistory(sender, parsed.before as string | undefined);
        break;
      case "read":
        // Acknowledge — no action needed for global room
        break;
      default:
        sendJson(sender, { type: "error", code: "UNKNOWN_TYPE", message: "Unknown message type" });
    }
  }

  private async handleChatMessage(sender: Connection, domain: string, content: string) {
    if (!content || typeof content !== "string") {
      sendJson(sender, { type: "error", code: "EMPTY_MESSAGE", message: "Message content required" });
      return;
    }

    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 2000) {
      sendJson(sender, { type: "error", code: "INVALID_LENGTH", message: "Message must be 1-2000 characters" });
      return;
    }

    const id = generateId();
    const timestamp = new Date().toISOString();

    // Broadcast to all connections
    this.room.broadcast(
      JSON.stringify({ type: "message", id, sender: domain, content: trimmed, timestamp }),
    );

    // Persist to D1
    try {
      const db = this.getDb();
      await db
        .prepare("INSERT INTO chat_messages (id, room_id, sender_domain, content) VALUES (?, 'global', ?, ?)")
        .bind(id, domain, trimmed)
        .run();
    } catch (err) {
      console.error("D1 persist error:", err);
    }
  }

  private handleTyping(sender: Connection, domain: string, active: boolean) {
    this.room.broadcast(
      JSON.stringify({ type: "typing", domain, active: !!active }),
      [sender.id],
    );
  }

  private handleSwitchIdentity(sender: Connection, oldDomain: string, newDomain: string) {
    if (!newDomain || typeof newDomain !== "string") {
      sendJson(sender, { type: "error", code: "INVALID_DOMAIN", message: "Domain not in your ownership list" });
      return;
    }

    const allowedDomains = this.getDomains(sender);
    if (!allowedDomains.includes(newDomain)) {
      sendJson(sender, { type: "error", code: "INVALID_DOMAIN", message: "Domain not in your ownership list" });
      return;
    }

    // Update connection state
    const state = sender.state as Record<string, unknown>;
    sender.setState({ ...state, domain: newDomain });

    // Check if old domain still has other connections
    let oldStillOnline = false;
    for (const conn of this.room.getConnections()) {
      if (conn.id !== sender.id && this.getDomain(conn) === oldDomain) {
        oldStillOnline = true;
        break;
      }
    }

    // Broadcast presence offline for old domain if no other connections use it
    if (!oldStillOnline) {
      this.room.broadcast(
        JSON.stringify({ type: "presence", domain: oldDomain, status: "offline" }),
        [sender.id],
      );
    }

    // Broadcast presence online for new domain
    this.room.broadcast(
      JSON.stringify({ type: "presence", domain: newDomain, status: "online" }),
    );

    // Broadcast system message
    this.room.broadcast(
      JSON.stringify({
        type: "system",
        content: `${oldDomain} is now chatting as ${newDomain}`,
        timestamp: new Date().toISOString(),
      }),
    );

    // Confirm to sender
    sendJson(sender, { type: "identity-switched", domain: newDomain });
  }

  private async handleHistory(sender: Connection, before?: string) {
    const PAGE_SIZE = 50;
    try {
      const db = this.getDb();
      let result: D1Result;
      if (before) {
        result = await db
          .prepare(
            "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = 'global' AND created_at < ? ORDER BY created_at DESC LIMIT ?",
          )
          .bind(before, PAGE_SIZE + 1)
          .all();
      } else {
        result = await db
          .prepare(
            "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = 'global' ORDER BY created_at DESC LIMIT ?",
          )
          .bind(PAGE_SIZE + 1)
          .all();
      }

      const rows = result.results;
      const hasMore = rows.length > PAGE_SIZE;
      const messages = rows.slice(0, PAGE_SIZE).map((r) => ({
        id: r.id as string,
        sender: r.sender_domain as string,
        content: r.content as string,
        timestamp: r.created_at as string,
      }));

      sendJson(sender, { type: "history", messages, hasMore });
    } catch (err) {
      console.error("D1 history error:", err);
      sendJson(sender, { type: "error", code: "HISTORY_FAILED", message: "Failed to load history" });
    }
  }

  onClose(conn: Connection) {
    const domain = this.getDomain(conn);
    this.msgRateMap.delete(conn.id);

    if (!domain) return;

    let stillOnline = false;
    for (const other of this.room.getConnections()) {
      if (other.id !== conn.id && this.getDomain(other) === domain) {
        stillOnline = true;
        break;
      }
    }

    if (!stillOnline) {
      this.room.broadcast(
        JSON.stringify({ type: "presence", domain, status: "offline" }),
      );
    }
  }
}
