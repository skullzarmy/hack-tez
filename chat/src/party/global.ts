import type { Party, Server, Connection } from "partykit/server";
import { jwtVerify } from "jose";

interface TokenPayload {
  address: string;
  domains: string[];
  activeDomain: string;
}

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

  private getDomain(conn: Connection): string | null {
    const state = conn.state as Record<string, unknown> | null;
    return (state?.domain as string) ?? null;
  }

  private getOnlineDomains(): string[] {
    const domains = new Set<string>();
    for (const conn of this.room.getConnections()) {
      const domain = this.getDomain(conn);
      if (domain) domains.add(domain);
    }
    return [...domains];
  }

  async onConnect(conn: Connection) {
    // Extract and verify JWT from query string
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

    // Store identity on connection
    conn.setState({ domain: payload.activeDomain, address: payload.address });

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
        await this.handleChatMessage(sender, domain, parsed.content as string);
        break;
      case "typing":
        this.handleTyping(sender, domain, parsed.active as boolean);
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
    if (!domain) return;

    // Check if this domain still has other connections
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
