import type { Party, Server, Connection } from "partykit/server";
import { jwtVerify } from "jose";
import { getOwnedDomains } from "../auth/domains.js";

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

// Ban cache TTL (2 minutes)
const BAN_CACHE_TTL_MS = 2 * 60 * 1000;

interface BanInfo {
  type: "soft" | "hard";
  scope: "global" | "platform";
  reason: string;
  adminDomain: string;
  expiresAt: string | null;
}

interface BanCacheEntry {
  banned: boolean;
  ban?: BanInfo;
  checkedAt: number;
}

interface MediaAttachment {
  type: "gif" | "image";
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  thumbnailUrl?: string;
  provider?: string;
}

interface HistoryResponse {
  messages: Array<{ id: string; sender: string; content: string | null; timestamp: string; deleted?: boolean; media?: MediaAttachment; replyTo?: string; editedAt?: string }>;
  hasMore: boolean;
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
  private banCache = new Map<string, BanCacheEntry>();

  constructor(room: Party) {
    this.room = room;
  }

  private getWorkerUrl(): string {
    return (this.room.env.WORKER_URL as string) ?? "https://hackchat.rejkt.workers.dev";
  }

  private getInternalSecret(): string {
    return (this.room.env.INTERNAL_SECRET as string) ?? "";
  }

  private getSecret(): Uint8Array {
    const secret = this.room.env.CHAT_JWT_SECRET as string;
    return new TextEncoder().encode(secret);
  }

  private getNetwork(): "ghostnet" | "mainnet" {
    const net = this.room.env.TEZOS_NETWORK as string | undefined;
    return net === "mainnet" ? "mainnet" : "ghostnet";
  }

  private getNetworkTld(): "tez" | "gho" {
    return this.getNetwork() === "mainnet" ? "tez" : "gho";
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

  private isAdminConn(conn: Connection): boolean {
    const activeDomain = this.getDomain(conn);
    if (!activeDomain) return false;
    const adminDomain = `admin.hack.${this.getNetworkTld()}`;
    return activeDomain === adminDomain;
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
    const pairs = new Map<string, Set<string>>();
    for (const conn of this.room.getConnections()) {
      const addr = this.getAddress(conn);
      const domain = this.getDomain(conn);
      if (!addr || !domain) continue;
      if (!pairs.has(addr)) pairs.set(addr, new Set());
      pairs.get(addr)!.add(domain);
    }

    for (const [address, domains] of pairs) {
      let ownedDomains: string[];
      try {
        ownedDomains = await getOwnedDomains(address, network);
      } catch (err) {
        console.error(`Reverify lookup failed for ${address}:`, err);
        continue;
      }

      for (const domain of domains) {
        if (ownedDomains.includes(domain)) continue;
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

  /** Call the Worker's internal API */
  private async workerFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.getWorkerUrl()}${path}`;
    const headers = new Headers(options.headers);
    headers.set("X-Internal-Secret", this.getInternalSecret());
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const resp = await fetch(url, { ...options, headers });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[workerFetch] ${url} → ${resp.status}: ${body}`);
    }
    return resp;
  }

  /** Check ban status via Worker (with local cache) */
  private async checkBan(domain: string, address: string): Promise<{ banned: boolean; ban?: BanInfo }> {
    const cacheKey = `${domain}:${address}`;
    const cached = this.banCache.get(cacheKey);
    if (cached && Date.now() - cached.checkedAt < BAN_CACHE_TTL_MS) {
      return { banned: cached.banned, ban: cached.ban };
    }

    try {
      const params = new URLSearchParams({ domain, address, context: "global" });
      const resp = await this.workerFetch(`/internal/ban-check?${params.toString()}`);
      if (!resp.ok) return { banned: false };

      const data = await resp.json() as { banned: boolean; ban?: BanInfo };
      this.banCache.set(cacheKey, { ...data, checkedAt: Date.now() });
      return data;
    } catch (err) {
      console.error("Ban check error:", err);
      return { banned: false };
    }
  }

  /** Invalidate ban cache for a domain (after ban/unban) */
  private invalidateBanCache(domain: string): void {
    for (const key of this.banCache.keys()) {
      if (key.startsWith(`${domain}:`)) {
        this.banCache.delete(key);
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

    const requestedDomain = url.searchParams.get("activeDomain");
    const effectiveDomain = requestedDomain && payload.domains.includes(requestedDomain)
      ? requestedDomain
      : payload.activeDomain;

    // Check ban status before allowing connection
    const banResult = await this.checkBan(effectiveDomain, payload.address);
    if (banResult.banned && banResult.ban) {
      sendJson(conn, {
        type: "error",
        code: "BANNED",
        message: `You are banned from global chat. Reason: ${banResult.ban.reason}`,
        ban: banResult.ban,
      });
      conn.close(4010, "Banned");
      return;
    }

    conn.setState({
      domain: effectiveDomain,
      address: payload.address,
      domains: payload.domains,
    });

    const onlineDomains = this.getOnlineDomains();
    for (const domain of onlineDomains) {
      sendJson(conn, { type: "presence", domain, status: "online" });
    }

    this.room.broadcast(
      JSON.stringify({ type: "presence", domain: effectiveDomain, status: "online" }),
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
      case "message": {
        // Re-check ban before allowing message
        const address = this.getAddress(sender);
        const banResult = await this.checkBan(domain, address ?? "");
        if (banResult.banned) {
          sendJson(sender, {
            type: "error",
            code: "BANNED",
            message: `You are banned. Reason: ${banResult.ban?.reason}`,
            ban: banResult.ban,
          });
          sender.close(4010, "Banned");
          return;
        }
        if (!this.checkMessageRate(sender.id)) {
          sendJson(sender, {
            type: "error",
            code: "RATE_LIMITED",
            message: "Slow down! Max 10 messages per 30 seconds.",
          });
          return;
        }
        await this.handleChatMessage(sender, domain, parsed.content as string, parsed.media as MediaAttachment | undefined, parsed.replyTo as string | undefined);
        break;
      }
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
        break;

      // Edit + react
      case "edit-message":
        await this.handleEditMessage(sender, domain, parsed);
        break;
      case "react":
        await this.handleReaction(sender, domain, parsed);
        break;

      // Admin commands
      case "admin:delete-message":
        await this.handleAdminDelete(sender, parsed);
        break;
      case "admin:ban-user":
        await this.handleAdminBan(sender, parsed);
        break;
      case "admin:unban-user":
        await this.handleAdminUnban(sender, parsed);
        break;

      default:
        sendJson(sender, { type: "error", code: "UNKNOWN_TYPE", message: "Unknown message type" });
    }
  }

  private async handleChatMessage(sender: Connection, domain: string, content: string, media?: MediaAttachment, replyTo?: string) {
    if (!content || typeof content !== "string") {
      // Allow empty content if media is present
      if (!media) {
        sendJson(sender, { type: "error", code: "EMPTY_MESSAGE", message: "Message content required" });
        return;
      }
    }

    const trimmed = (content ?? "").trim();
    if (!media && (trimmed.length === 0 || trimmed.length > 4000)) {
      sendJson(sender, { type: "error", code: "INVALID_LENGTH", message: "Message must be 1-4000 characters" });
      return;
    }
    if (trimmed.length > 4000) {
      sendJson(sender, { type: "error", code: "INVALID_LENGTH", message: "Message must be at most 4000 characters" });
      return;
    }

    // Validate media if present
    if (media) {
      if (!media.type || !media.url) {
        sendJson(sender, { type: "error", code: "INVALID_MEDIA", message: "Media requires type and url" });
        return;
      }
      if (media.type !== "gif" && media.type !== "image") {
        sendJson(sender, { type: "error", code: "INVALID_MEDIA", message: "Media type must be gif or image" });
        return;
      }
    }

    const id = generateId();
    const timestamp = new Date().toISOString();

    const broadcastMsg: Record<string, unknown> = { type: "message", id, sender: domain, content: trimmed || null, timestamp };
    if (media) broadcastMsg.media = media;
    if (replyTo) broadcastMsg.replyTo = replyTo;

    // Broadcast to all connections
    this.room.broadcast(JSON.stringify(broadcastMsg));

    // Persist via Worker API (fire-and-forget)
    this.workerFetch("/internal/store-message", {
      method: "POST",
      body: JSON.stringify({ id, roomId: "global", senderDomain: domain, content: trimmed || "", media, replyTo }),
    }).catch((err) => console.error("Worker persist error:", err));
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

    const state = sender.state as Record<string, unknown>;
    sender.setState({ ...state, domain: newDomain });

    let oldStillOnline = false;
    for (const conn of this.room.getConnections()) {
      if (conn.id !== sender.id && this.getDomain(conn) === oldDomain) {
        oldStillOnline = true;
        break;
      }
    }

    if (!oldStillOnline) {
      this.room.broadcast(
        JSON.stringify({ type: "presence", domain: oldDomain, status: "offline" }),
      );
    }

    this.room.broadcast(
      JSON.stringify({ type: "presence", domain: newDomain, status: "online" }),
    );

    this.room.broadcast(
      JSON.stringify({
        type: "system",
        content: `${oldDomain} is now chatting as ${newDomain}`,
        timestamp: new Date().toISOString(),
      }),
    );

    sendJson(sender, { type: "identity-switched", domain: newDomain });
  }

  private async handleEditMessage(sender: Connection, domain: string, data: Record<string, unknown>) {
    const messageId = data.messageId as string;
    const content = data.content as string;

    if (!messageId || !content) {
      sendJson(sender, { type: "error", code: "INVALID_DATA", message: "messageId and content required" });
      return;
    }

    try {
      const resp = await this.workerFetch("/internal/edit-message", {
        method: "POST",
        body: JSON.stringify({ messageId, senderDomain: domain, content }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error: string };
        sendJson(sender, { type: "error", code: "EDIT_FAILED", message: err.error });
        return;
      }

      const result = await resp.json() as { ok: boolean; editedAt: string };

      this.room.broadcast(JSON.stringify({
        type: "message-edited",
        messageId,
        content: content.trim(),
        editedAt: result.editedAt,
        sender: domain,
      }));
    } catch (err) {
      console.error("Edit message error:", err);
      sendJson(sender, { type: "error", code: "EDIT_FAILED", message: "Failed to edit message" });
    }
  }

  private async handleReaction(sender: Connection, domain: string, data: Record<string, unknown>) {
    const messageId = data.messageId as string;
    const emoji = data.emoji as string;

    if (!messageId || !emoji) {
      sendJson(sender, { type: "error", code: "INVALID_DATA", message: "messageId and emoji required" });
      return;
    }

    try {
      const resp = await this.workerFetch("/internal/react", {
        method: "POST",
        body: JSON.stringify({ messageId, domain, emoji }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error: string };
        sendJson(sender, { type: "error", code: "REACT_FAILED", message: err.error });
        return;
      }

      const result = await resp.json() as { ok: boolean; action: "add" | "remove"; reactions: Array<{ emoji: string; count: number }> };

      this.room.broadcast(JSON.stringify({
        type: "reaction-update",
        messageId,
        emoji,
        domain,
        action: result.action,
        reactions: result.reactions,
      }));
    } catch (err) {
      console.error("Reaction error:", err);
      sendJson(sender, { type: "error", code: "REACT_FAILED", message: "Failed to react" });
    }
  }

  private async handleHistory(sender: Connection, before?: string) {
    try {
      const params = new URLSearchParams({ roomId: "global", limit: "50" });
      if (before) params.set("before", before);

      const resp = await this.workerFetch(`/internal/history?${params.toString()}`);
      if (!resp.ok) throw new Error(`Worker returned ${resp.status}`);

      const data = (await resp.json()) as HistoryResponse;
      sendJson(sender, { type: "history", messages: data.messages, hasMore: data.hasMore });
    } catch (err) {
      console.error("Worker history error:", err);
      sendJson(sender, { type: "error", code: "HISTORY_FAILED", message: "Failed to load history" });
    }
  }

  // --- Admin command handlers ---

  private async handleAdminDelete(sender: Connection, data: Record<string, unknown>) {
    if (!this.isAdminConn(sender)) {
      sendJson(sender, { type: "error", code: "FORBIDDEN", message: "Admin access required" });
      return;
    }

    const messageId = data.messageId as string;
    const reason = data.reason as string;
    const visible = data.visible !== false;
    const adminDomain = this.getDomain(sender);

    if (!messageId || !reason || !adminDomain) {
      sendJson(sender, { type: "error", code: "INVALID_DATA", message: "messageId and reason required" });
      return;
    }

    try {
      const resp = await this.workerFetch("/internal/delete-message", {
        method: "POST",
        body: JSON.stringify({ messageId, adminDomain, reason, visible }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error: string };
        sendJson(sender, { type: "error", code: "DELETE_FAILED", message: err.error });
        return;
      }

      const result = await resp.json() as { ok: boolean; targetDomain: string };

      // Broadcast deletion to all connected clients
      this.room.broadcast(JSON.stringify({
        type: "message-deleted",
        messageId,
        deletedBy: adminDomain,
        reason,
        visible,
        timestamp: new Date().toISOString(),
      }));

      // Confirm to admin
      sendJson(sender, { type: "admin:delete-confirmed", messageId, targetDomain: result.targetDomain });
    } catch (err) {
      console.error("Admin delete error:", err);
      sendJson(sender, { type: "error", code: "DELETE_FAILED", message: "Failed to delete message" });
    }
  }

  private async handleAdminBan(sender: Connection, data: Record<string, unknown>) {
    if (!this.isAdminConn(sender)) {
      sendJson(sender, { type: "error", code: "FORBIDDEN", message: "Admin access required" });
      return;
    }

    const targetDomain = data.domain as string;
    const type = data.banType as string;
    const scope = (data.scope as string) || "global";
    const reason = data.reason as string;
    const duration = data.duration as number | undefined;
    const notes = (data.notes as string) || undefined;
    const banWallet = data.banWallet as boolean | undefined;
    const adminDomain = this.getDomain(sender);

    if (!targetDomain || !type || !reason || !adminDomain) {
      sendJson(sender, { type: "error", code: "INVALID_DATA", message: "domain, banType, and reason required" });
      return;
    }

    // Look up the target's wallet address if banWallet is requested
    let address: string | undefined;
    if (banWallet) {
      for (const conn of this.room.getConnections()) {
        if (this.getDomain(conn) === targetDomain) {
          address = this.getAddress(conn) ?? undefined;
          break;
        }
      }
    }

    try {
      const resp = await this.workerFetch("/internal/ban", {
        method: "POST",
        body: JSON.stringify({
          domain: targetDomain, type, scope, reason, adminDomain,
          duration, notes, address,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error: string };
        sendJson(sender, { type: "error", code: "BAN_FAILED", message: err.error });
        return;
      }

      const result = await resp.json() as { ok: boolean; ban: Record<string, unknown> };

      // Invalidate cache
      this.invalidateBanCache(targetDomain);

      // Broadcast ban to all connections
      this.room.broadcast(JSON.stringify({
        type: "user-banned",
        domain: targetDomain,
        banType: type,
        scope,
        reason,
        adminDomain,
        expiresAt: result.ban.expiresAt ?? null,
        timestamp: new Date().toISOString(),
      }));

      // Force-disconnect the banned user
      for (const conn of this.room.getConnections()) {
        if (this.getDomain(conn) === targetDomain) {
          sendJson(conn, {
            type: "error",
            code: "BANNED",
            message: `You have been banned from global chat. Reason: ${reason}`,
            ban: { type, scope, reason, adminDomain, expiresAt: result.ban.expiresAt ?? null },
          });
          conn.close(4010, "Banned");
        }
        // If wallet ban, also disconnect other domains on the same wallet
        if (address && this.getAddress(conn) === address && this.getDomain(conn) !== targetDomain) {
          sendJson(conn, {
            type: "error",
            code: "BANNED",
            message: `Your wallet has been banned from global chat. Reason: ${reason}`,
            ban: { type, scope, reason, adminDomain, expiresAt: result.ban.expiresAt ?? null },
          });
          conn.close(4010, "Banned (wallet)");
        }
      }

      sendJson(sender, { type: "admin:ban-confirmed", domain: targetDomain, ban: result.ban });
    } catch (err) {
      console.error("Admin ban error:", err);
      sendJson(sender, { type: "error", code: "BAN_FAILED", message: "Failed to ban user" });
    }
  }

  private async handleAdminUnban(sender: Connection, data: Record<string, unknown>) {
    if (!this.isAdminConn(sender)) {
      sendJson(sender, { type: "error", code: "FORBIDDEN", message: "Admin access required" });
      return;
    }

    const targetDomain = data.domain as string;
    const reason = (data.reason as string) || "Unbanned by admin";
    const adminDomain = this.getDomain(sender);

    if (!targetDomain || !adminDomain) {
      sendJson(sender, { type: "error", code: "INVALID_DATA", message: "domain required" });
      return;
    }

    try {
      const resp = await this.workerFetch("/internal/unban", {
        method: "POST",
        body: JSON.stringify({ domain: targetDomain, adminDomain, reason }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error: string };
        sendJson(sender, { type: "error", code: "UNBAN_FAILED", message: err.error });
        return;
      }

      this.invalidateBanCache(targetDomain);

      this.room.broadcast(JSON.stringify({
        type: "user-unbanned",
        domain: targetDomain,
        reason,
        adminDomain,
        timestamp: new Date().toISOString(),
      }));

      sendJson(sender, { type: "admin:unban-confirmed", domain: targetDomain });
    } catch (err) {
      console.error("Admin unban error:", err);
      sendJson(sender, { type: "error", code: "UNBAN_FAILED", message: "Failed to unban user" });
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
