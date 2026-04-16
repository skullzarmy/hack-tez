import type { Party, Connection } from "partykit/server";

export interface MediaAttachment {
  type: "gif" | "image";
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  thumbnailUrl?: string;
  provider?: string;
}

export function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

export function sendJson(conn: Connection, data: unknown): void {
  conn.send(JSON.stringify(data));
}

/** Shared context that both GlobalRoom and DMRoom pass to shared handlers. */
export interface RoomContext {
  room: Party;
  workerFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

export async function handleChatMessage(
  ctx: RoomContext,
  sender: Connection,
  domain: string,
  content: string,
  media: MediaAttachment | undefined,
  replyTo: string | undefined,
  maxLength: number = 4000,
): Promise<void> {
  if (!content || typeof content !== "string") {
    if (!media) {
      sendJson(sender, { type: "error", code: "EMPTY_MESSAGE", message: "Message content required" });
      return;
    }
  }

  const trimmed = (content ?? "").trim();
  if (!media && (trimmed.length === 0 || trimmed.length > maxLength)) {
    sendJson(sender, { type: "error", code: "INVALID_LENGTH", message: `Message must be 1-${maxLength} characters` });
    return;
  }
  if (trimmed.length > maxLength) {
    sendJson(sender, { type: "error", code: "INVALID_LENGTH", message: `Message must be at most ${maxLength} characters` });
    return;
  }

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
  const roomId = ctx.room.id;

  const broadcastMsg: Record<string, unknown> = { type: "message", id, sender: domain, content: trimmed || null, timestamp };
  if (media) broadcastMsg.media = media;
  if (replyTo) broadcastMsg.replyTo = replyTo;

  ctx.room.broadcast(JSON.stringify(broadcastMsg));

  ctx.workerFetch("/internal/store-message", {
    method: "POST",
    body: JSON.stringify({ id, roomId, senderDomain: domain, content: trimmed || "", media, replyTo }),
  }).catch((err) => console.error("Worker persist error:", err));
}

export async function handleReaction(
  ctx: RoomContext,
  sender: Connection,
  domain: string,
  data: Record<string, unknown>,
): Promise<void> {
  const messageId = data.messageId as string;
  const emoji = data.emoji as string;

  if (!messageId || !emoji) {
    sendJson(sender, { type: "error", code: "INVALID_DATA", message: "messageId and emoji required" });
    return;
  }

  try {
    const resp = await ctx.workerFetch("/internal/react", {
      method: "POST",
      body: JSON.stringify({ messageId, domain, emoji }),
    });

    if (!resp.ok) {
      const err = await resp.json() as { error: string };
      sendJson(sender, { type: "error", code: "REACT_FAILED", message: err.error });
      return;
    }

    const result = await resp.json() as { ok: boolean; action: "add" | "remove"; reactions: Array<{ emoji: string; count: number }> };

    ctx.room.broadcast(JSON.stringify({
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

export async function handleDeleteMessage(
  ctx: RoomContext,
  sender: Connection,
  domain: string,
  data: Record<string, unknown>,
): Promise<void> {
  const messageId = data.messageId as string;

  if (!messageId) {
    sendJson(sender, { type: "error", code: "INVALID_DATA", message: "messageId required" });
    return;
  }

  try {
    const resp = await ctx.workerFetch("/internal/self-delete-message", {
      method: "POST",
      body: JSON.stringify({ messageId, senderDomain: domain }),
    });

    if (!resp.ok) {
      const err = await resp.json() as { error: string };
      sendJson(sender, { type: "error", code: "DELETE_FAILED", message: err.error });
      return;
    }

    ctx.room.broadcast(JSON.stringify({
      type: "message-deleted",
      messageId,
      deletedBy: domain,
      selfDelete: true,
    }));
  } catch (err) {
    console.error("Delete message error:", err);
    sendJson(sender, { type: "error", code: "DELETE_FAILED", message: "Failed to delete message" });
  }
}

export async function handleEditMessage(
  ctx: RoomContext,
  sender: Connection,
  domain: string,
  data: Record<string, unknown>,
): Promise<void> {
  const messageId = data.messageId as string;
  const content = data.content as string;

  if (!messageId || !content) {
    sendJson(sender, { type: "error", code: "INVALID_DATA", message: "messageId and content required" });
    return;
  }

  try {
    const resp = await ctx.workerFetch("/internal/edit-message", {
      method: "POST",
      body: JSON.stringify({ messageId, senderDomain: domain, content }),
    });

    if (!resp.ok) {
      const err = await resp.json() as { error: string };
      sendJson(sender, { type: "error", code: "EDIT_FAILED", message: err.error });
      return;
    }

    const result = await resp.json() as { ok: boolean; editedAt: string };

    ctx.room.broadcast(JSON.stringify({
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
