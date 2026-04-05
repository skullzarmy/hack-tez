import type { Party, Server, Connection } from "partykit/server";
import { jwtVerify } from "jose";

// Message rate limiting: max 10 messages per 30 seconds per connection
const MSG_RATE_WINDOW_MS = 30_000;
const MSG_RATE_MAX = 10;

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

/** Extract the two participant domains from a dm: room ID */
function parseRoomParticipants(roomId: string): [string, string] | null {
  if (!roomId.startsWith("dm:")) return null;
  const parts = roomId.slice(3).split("+");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

export default class DMRoom implements Server {
  readonly room: Party;
  private msgRateMap = new Map<string, { timestamps: number[] }>();

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

  private checkMessageRate(connId: string): boolean {
    const now = Date.now();
    let entry = this.msgRateMap.get(connId);
    if (!entry) {
      entry = { timestamps: [] };
      this.msgRateMap.set(connId, entry);
    }
    entry.timestamps = entry.timestamps.filter((t) => now - t < MSG_RATE_WINDOW_MS);
    if (entry.timestamps.length >= MSG_RATE_MAX) return false;
    entry.timestamps.push(now);
    return true;
  }

  async onConnect(conn: Connection) {
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

    // Verify the connecting domain is a participant in this DM room
    const participants = parseRoomParticipants(this.room.id);
    if (!participants || !participants.includes(payload.activeDomain)) {
      sendJson(conn, { type: "error", code: "NOT_PARTICIPANT", message: "You are not a participant in this DM" });
      conn.close(4003, "Not a participant");
      return;
    }

    conn.setState({
      domain: payload.activeDomain,
      address: payload.address,
    });

    // Send presence for all currently connected domains
    for (const other of this.room.getConnections()) {
      const otherDomain = this.getDomain(other);
      if (otherDomain && otherDomain !== payload.activeDomain) {
        sendJson(conn, { type: "presence", domain: otherDomain, status: "online" });
      }
    }

    // Broadcast that this user is online
    this.room.broadcast(
      JSON.stringify({ type: "presence", domain: payload.activeDomain, status: "online" }),
      [conn.id],
    );

    // Send unread count
    try {
      const db = this.getDb();
      const roomId = this.room.id;
      const memberResult = await db
        .prepare("SELECT last_read FROM chat_room_members WHERE room_id = ? AND domain = ?")
        .bind(roomId, payload.activeDomain)
        .all();

      const lastRead = memberResult.results[0]?.last_read as string | null;
      let unreadResult: D1Result;
      if (lastRead) {
        unreadResult = await db
          .prepare("SELECT COUNT(*) as cnt FROM chat_messages WHERE room_id = ? AND created_at > ? AND sender_domain != ?")
          .bind(roomId, lastRead, payload.activeDomain)
          .all();
      } else {
        unreadResult = await db
          .prepare("SELECT COUNT(*) as cnt FROM chat_messages WHERE room_id = ? AND sender_domain != ?")
          .bind(roomId, payload.activeDomain)
          .all();
      }
      const unreadCount = (unreadResult.results[0]?.cnt as number) ?? 0;
      sendJson(conn, { type: "unread", count: unreadCount });
    } catch (err) {
      console.error("D1 unread count error:", err);
    }
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
      case "history":
        await this.handleHistory(sender, parsed.before as string | undefined);
        break;
      case "read":
        await this.handleRead(sender, domain);
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
    const roomId = this.room.id;

    // Broadcast to all connections in the room
    this.room.broadcast(
      JSON.stringify({ type: "message", id, sender: domain, content: trimmed, timestamp }),
    );

    // Persist to D1
    try {
      const db = this.getDb();
      await db
        .prepare("INSERT INTO chat_messages (id, room_id, sender_domain, content) VALUES (?, ?, ?, ?)")
        .bind(id, roomId, domain, trimmed)
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
    const roomId = this.room.id;
    try {
      const db = this.getDb();
      let result: D1Result;
      if (before) {
        result = await db
          .prepare(
            "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?",
          )
          .bind(roomId, before, PAGE_SIZE + 1)
          .all();
      } else {
        result = await db
          .prepare(
            "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?",
          )
          .bind(roomId, PAGE_SIZE + 1)
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

  private async handleRead(sender: Connection, domain: string) {
    const roomId = this.room.id;
    const now = new Date().toISOString();
    try {
      const db = this.getDb();
      await db
        .prepare("UPDATE chat_room_members SET last_read = ? WHERE room_id = ? AND domain = ?")
        .bind(now, roomId, domain)
        .run();

      // Notify the other participant that messages were read
      this.room.broadcast(
        JSON.stringify({ type: "read", domain, timestamp: now }),
        [sender.id],
      );
    } catch (err) {
      console.error("D1 read update error:", err);
    }
  }

  onClose(conn: Connection) {
    const domain = this.getDomain(conn);
    if (!domain) return;

    // Check if this domain still has other connections in this room
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
