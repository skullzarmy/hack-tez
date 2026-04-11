import type { Party, Server, Connection } from "partykit/server";
import { jwtVerify } from "jose";

// Message rate limiting: max 10 messages per 30 seconds per connection
const MSG_RATE_WINDOW_MS = 30_000;
const MSG_RATE_MAX = 10;

interface TokenPayload {
    address: string;
    domains: string[];
    activeDomain: string | null;
}

interface HistoryResponse {
    messages: Array<{ id: string; sender: string; content: string; timestamp: string }>;
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

    /** Call the Worker's internal API */
    private async workerFetch(path: string, options: RequestInit = {}): Promise<Response> {
        const url = `${this.getWorkerUrl()}${path}`;
        const headers = new Headers(options.headers);
        headers.set("X-Internal-Secret", this.getInternalSecret());
        if (options.body && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }
        return fetch(url, { ...options, headers });
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

        const requestedDomain = url.searchParams.get("activeDomain");
        const effectiveDomain =
            requestedDomain && payload.domains.includes(requestedDomain) ? requestedDomain : payload.activeDomain;

        // Verify the connecting domain is a participant in this DM room
        const participants = parseRoomParticipants(this.room.id);
        if (!participants || !participants.includes(effectiveDomain)) {
            sendJson(conn, { type: "error", code: "NOT_PARTICIPANT", message: "You are not a participant in this DM" });
            conn.close(4003, "Not a participant");
            return;
        }

        // Check platform-scoped bans (global-scoped bans don't affect DMs)
        try {
            const params = new URLSearchParams({ domain: effectiveDomain, address: payload.address, context: "dm" });
            const banResp = await this.workerFetch(`/internal/ban-check?${params.toString()}`);
            if (banResp.ok) {
                const banData = await banResp.json() as { banned: boolean; ban?: { reason: string } };
                if (banData.banned) {
                    sendJson(conn, {
                        type: "error", code: "BANNED",
                        message: `You are banned from the platform. Reason: ${banData.ban?.reason}`,
                    });
                    conn.close(4010, "Banned (platform)");
                    return;
                }
            }
        } catch (err) {
            console.error("DM ban check error:", err);
        }

        conn.setState({
            domain: effectiveDomain,
            address: payload.address,
        });

        // Send presence for all currently connected domains
        for (const other of this.room.getConnections()) {
            const otherDomain = this.getDomain(other);
            if (otherDomain && otherDomain !== effectiveDomain) {
                sendJson(conn, { type: "presence", domain: otherDomain, status: "online" });
            }
        }

        // Broadcast that this user is online
        this.room.broadcast(JSON.stringify({ type: "presence", domain: effectiveDomain, status: "online" }), [conn.id]);

        // Send unread count via Worker API
        try {
            const resp = await this.workerFetch(
                `/internal/unread?roomId=${encodeURIComponent(this.room.id)}&domain=${encodeURIComponent(effectiveDomain)}`,
            );
            if (resp.ok) {
                const data = (await resp.json()) as { count: number };
                sendJson(conn, { type: "unread", count: data.count });
            }
        } catch (err) {
            console.error("Worker unread count error:", err);
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
        this.room.broadcast(JSON.stringify({ type: "message", id, sender: domain, content: trimmed, timestamp }));

        // Persist via Worker API (fire-and-forget)
        this.workerFetch("/internal/store-message", {
            method: "POST",
            body: JSON.stringify({ id, roomId, senderDomain: domain, content: trimmed }),
        }).catch((err) => console.error("Worker persist error:", err));
    }

    private handleTyping(sender: Connection, domain: string, active: boolean) {
        this.room.broadcast(JSON.stringify({ type: "typing", domain, active: !!active }), [sender.id]);
    }

    private async handleHistory(sender: Connection, before?: string) {
        const roomId = this.room.id;
        try {
            const params = new URLSearchParams({ roomId, limit: "20" });
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

    private async handleRead(sender: Connection, domain: string) {
        const roomId = this.room.id;
        try {
            const resp = await this.workerFetch("/internal/mark-read", {
                method: "POST",
                body: JSON.stringify({ roomId, domain }),
            });

            if (resp.ok) {
                const data = (await resp.json()) as { timestamp: string };
                // Notify the other participant that messages were read
                this.room.broadcast(JSON.stringify({ type: "read", domain, timestamp: data.timestamp }), [sender.id]);
            }
        } catch (err) {
            console.error("Worker read update error:", err);
        }
    }

    onClose(conn: Connection) {
        const domain = this.getDomain(conn);
        if (!domain) return;

        let stillOnline = false;
        for (const other of this.room.getConnections()) {
            if (other.id !== conn.id && this.getDomain(other) === domain) {
                stillOnline = true;
                break;
            }
        }

        if (!stillOnline) {
            this.room.broadcast(JSON.stringify({ type: "presence", domain, status: "offline" }));
        }
    }
}
