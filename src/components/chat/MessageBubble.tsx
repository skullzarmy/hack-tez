import type { ReactNode } from "react";
import { useMemo, useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react-dom";
import DOMPurify from "dompurify";
import { MoreHorizontal, Trash2, Ban, Pencil, Reply, SmilePlus } from "lucide-react";
import type { MediaAttachment, ReactionCount } from "../../types/chat";
import { ipfsUriToGatewayUrl } from "../../lib/pin";
import ChatAvatar from "./ChatAvatar";
import LinkPreview from "./LinkPreview";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

interface MessageBubbleProps {
    id: string;
    sender: string;
    content: string | null;
    timestamp: string;
    isOwn: boolean;
    deleted?: boolean;
    deletedBy?: string;
    deleteReason?: string;
    media?: MediaAttachment;
    replyTo?: string;
    replyContext?: { id: string; sender: string; content: string | null; deleted?: boolean; media?: MediaAttachment };
    editedAt?: string;
    reactions?: ReactionCount[];
    activeDomain?: string;
    /** Whether to show the avatar and sender name (true for first message in a group) */
    showHeader?: boolean;
    isAdmin?: boolean;
    onAdminDelete?: (messageId: string) => void;
    onAdminBan?: (domain: string) => void;
    onReact?: (messageId: string, emoji: string) => void;
    onReply?: (messageId: string) => void;
    onEdit?: (messageId: string) => void;
    isEditing?: boolean;
    onEditSave?: (messageId: string, newContent: string) => void;
    onEditCancel?: () => void;
    onShowProfile?: (domain: string, anchorRect: DOMRect) => void;
    chatToken?: string;
}

function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    // Under 10m: every minute
    if (minutes < 10) return `${minutes}m ago`;
    // Under 30m: every 5 minutes
    if (minutes < 30) return `${Math.floor(minutes / 5) * 5}m ago`;
    // Under 1h: every 15 minutes
    if (minutes < 60) return `${Math.floor(minutes / 15) * 15}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// Shared 30s ticker so all timestamps re-evaluate together with one timer
const tickListeners = new Set<() => void>();
let tickInterval: ReturnType<typeof setInterval> | null = null;

function subscribeTick(cb: () => void) {
    tickListeners.add(cb);
    if (!tickInterval) {
        tickInterval = setInterval(() => {
            for (const fn of tickListeners) fn();
        }, 30_000);
    }
    return () => {
        tickListeners.delete(cb);
        if (tickListeners.size === 0 && tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
        }
    };
}

function useRelativeTime(iso: string): string {
    const [, setTick] = useState(0);
    useEffect(() => subscribeTick(() => setTick((t) => t + 1)), [iso]);
    return formatRelativeTime(iso);
}

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;
const MENTION_REGEX = /@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)/g;

/** Strip ALL HTML tags, then apply our safe markdown-like formatting. */
function formatContent(raw: string, onMentionClick?: (label: string) => void): ReactNode[] {
    const clean = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    const parts: ReactNode[] = [];
    let key = 0;

    const segments = clean.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

    /** Render plain text with URL and @mention detection */
    function renderPlainText(text: string) {
        // Split on URLs first, then handle mentions in the non-URL parts
        const urlParts = text.split(URL_REGEX);
        const urls = text.match(URL_REGEX) ?? [];
        for (let i = 0; i < urlParts.length; i++) {
            if (urlParts[i]) {
                // Detect @mentions in plain text
                const mentionParts = urlParts[i].split(MENTION_REGEX);
                for (let j = 0; j < mentionParts.length; j++) {
                    if (j % 2 === 1) {
                        // Odd indices are captured mention labels
                        const label = mentionParts[j];
                        parts.push(
                            <button
                                key={key++}
                                type="button"
                                onClick={() => onMentionClick?.(label)}
                                style={{
                                    color: "var(--accent, #00ffc8)",
                                    fontWeight: 700,
                                    background: "rgba(0, 255, 200, 0.08)",
                                    padding: "0 2px",
                                    border: "none",
                                    cursor: onMentionClick ? "pointer" : "default",
                                    fontFamily: "inherit",
                                    fontSize: "inherit",
                                    lineHeight: "inherit",
                                }}
                            >
                                @{label}
                            </button>,
                        );
                    } else if (mentionParts[j]) {
                        parts.push(mentionParts[j]);
                    }
                }
            }
            if (urls[i]) {
                parts.push(
                    <a
                        key={key++}
                        href={urls[i]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: "var(--accent, #00ffc8)", outlineColor: "var(--accent, #00ffc8)" }}
                    >
                        {urls[i]}
                    </a>,
                );
            }
        }
    }

    for (const seg of segments) {
        if (seg.startsWith("**") && seg.endsWith("**")) {
            parts.push(
                <strong key={key++} className="font-bold">
                    {seg.slice(2, -2)}
                </strong>,
            );
        } else if (seg.startsWith("*") && seg.endsWith("*") && seg.length > 2) {
            parts.push(
                <em key={key++} className="italic">
                    {seg.slice(1, -1)}
                </em>,
            );
        } else if (seg.startsWith("`") && seg.endsWith("`")) {
            parts.push(
                <code
                    key={key++}
                    className="text-xs px-1.5 py-0.5"
                    style={{
                        background: "rgba(255,255,255,0.12)",
                        border: "1px solid var(--border, rgba(255,255,255,0.1))",
                        fontFamily: "var(--font-mono)",
                    }}
                >
                    {seg.slice(1, -1)}
                </code>,
            );
        } else {
            renderPlainText(seg);
        }
    }

    return parts;
}

function SystemMessage({ content, timestamp }: { content: string; timestamp: string }) {
    const relativeTime = useRelativeTime(timestamp);
    return (
        <div className="flex items-center py-2 gap-3" role="article" aria-label={`System: ${content}`}>
            <span className="flex-1 h-px" style={{ background: "var(--border, rgba(255,255,255,0.1))" }} />
            <span
                className="text-[11px] uppercase tracking-widest shrink-0"
                style={{
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.1em",
                }}
            >
                {content}
                <span className="opacity-60 ml-2">{relativeTime}</span>
            </span>
            <span className="flex-1 h-px" style={{ background: "var(--border, rgba(255,255,255,0.1))" }} />
        </div>
    );
}



function DeletedMessage({ sender, timestamp, deleteReason, isOwn }: {
    sender: string; timestamp: string; deleteReason?: string; isOwn: boolean;
}) {
    const relativeTime = useRelativeTime(timestamp);
    return (
        <div
            role="article"
            aria-label={`Removed message from ${sender}`}
            className={`flex flex-col max-w-[95%] md:max-w-[80%] gap-1 ${isOwn ? "self-end items-end" : "self-start items-start"}`}
        >
            <span
                className="text-xs font-bold uppercase tracking-widest px-1"
                style={{
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                }}
            >
                {sender}
            </span>
            <div
                className="text-sm px-4 py-2.5 italic"
                style={{
                    background: "rgba(255,255,255,0.02)",
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                }}
            >
                [message removed by moderator{deleteReason ? `: ${deleteReason}` : ""}]
            </div>
            <span
                className="text-xs uppercase tracking-wide px-1"
                style={{
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                }}
            >
                {relativeTime}
            </span>
        </div>
    );
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🚀", "👀"];

/** Unified toolbar: reply + emoji (+ overflow for edit/admin). Appears on hover/tap at bottom-right of every message. */
function MessageToolbar({
    id,
    sender,
    isOwn,
    isAdmin,
    anchorRef,
    onReact,
    onReply,
    onEdit,
    onAdminDelete,
    onAdminBan,
}: {
    id: string;
    sender: string;
    isOwn: boolean;
    isAdmin?: boolean;
    anchorRef: React.RefObject<HTMLDivElement | null>;
    onReact?: (messageId: string, emoji: string) => void;
    onReply?: (messageId: string) => void;
    onEdit?: (messageId: string) => void;
    onAdminDelete?: (messageId: string) => void;
    onAdminBan?: (domain: string) => void;
}) {
    const [showEmoji, setShowEmoji] = useState(false);
    const [showOverflow, setShowOverflow] = useState(false);
    const emojiRef = useRef<HTMLDivElement>(null);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const overflowRef = useRef<HTMLDivElement>(null);

    // Position the toolbar itself below the message content
    const { refs: toolbarRefs, floatingStyles: toolbarStyles } = useFloating({
        open: true,
        placement: isOwn ? "bottom-end" : "bottom-start",
        middleware: [offset(2), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
        elements: { reference: anchorRef.current },
    });

    const { refs: emojiRefs, floatingStyles: emojiStyles } = useFloating({
        open: showEmoji,
        placement: isOwn ? "top-end" : "top-start",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
    });

    const { refs: overflowRefs, floatingStyles: overflowStyles } = useFloating({
        open: showOverflow,
        placement: isOwn ? "top-end" : "top-start",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
    });

    // Close emoji picker on outside click
    useEffect(() => {
        if (!showEmoji) return;
        function handleClick(e: MouseEvent) {
            if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showEmoji]);

    // Close overflow menu on outside click
    useEffect(() => {
        if (!showOverflow) return;
        function handleClick(e: MouseEvent) {
            if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setShowOverflow(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showOverflow]);

    const hasOverflow = (isOwn && onEdit) || (isAdmin && (onAdminDelete || onAdminBan));
    const hasAny = onReact || onReply || hasOverflow;
    if (!hasAny) return null;

    const iconBtnStyle: React.CSSProperties = {
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--fg-3, #888)",
        padding: "4px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "3px",
    };

    return (
        <div
            ref={toolbarRefs.setFloating}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            style={{
                ...toolbarStyles,
                zIndex: 40,
                display: "inline-flex",
                gap: "1px",
                background: "var(--bg-1, #111)",
                border: "1px solid var(--border-2, #333)",
                padding: "2px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                borderRadius: "4px",
            }}
        >
            {/* Reply */}
            {onReply && (
                <button
                    type="button"
                    onClick={() => onReply(id)}
                    style={iconBtnStyle}
                    aria-label="Reply"
                    title="Reply"
                >
                    <Reply size={14} />
                </button>
            )}

            {/* Emoji react — quick reactions + full picker */}
            {onReact && (
                <div ref={emojiRef} style={{ display: "inline-flex" }}>
                    <button
                        ref={(el) => { emojiBtnRef.current = el; emojiRefs.setReference(el); }}
                        type="button"
                        onClick={() => { setShowEmoji((v) => !v); setShowOverflow(false); }}
                        style={iconBtnStyle}
                        aria-label="React"
                        title="React"
                    >
                        <SmilePlus size={14} />
                    </button>
                    {showEmoji && (
                        <div ref={emojiRefs.setFloating} style={{ ...emojiStyles, zIndex: 50 }}>
                            <div style={{
                                background: "var(--bg-1, #111)",
                                border: "1px solid var(--border-2, #333)",
                                borderRadius: "6px",
                                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                                overflow: "hidden",
                            }}>
                                {/* Quick reactions row */}
                                <div style={{ display: "flex", gap: "2px", padding: "6px 8px", borderBottom: "1px solid var(--border-2, #333)" }}>
                                    {QUICK_REACTIONS.map((emoji) => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => { onReact(id, emoji); setShowEmoji(false); }}
                                            style={{
                                                background: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                fontSize: "18px",
                                                padding: "4px 5px",
                                                lineHeight: 1,
                                                borderRadius: "4px",
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                            aria-label={`React with ${emoji}`}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                                {/* Full emoji picker */}
                                <Suspense fallback={<div style={{ width: 350, height: 400, background: "var(--bg-1, #111)" }} />}>
                                    <EmojiPicker
                                        onEmojiClick={(emojiData) => {
                                            onReact(id, emojiData.emoji);
                                            setShowEmoji(false);
                                        }}
                                        theme={"dark" as import("emoji-picker-react").Theme}
                                        width={350}
                                        height={400}
                                        searchPlaceholder="Search emoji…"
                                        previewConfig={{ showPreview: false }}
                                        lazyLoadEmojis
                                    />
                                </Suspense>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Overflow: edit / admin actions */}
            {hasOverflow && (
                <div ref={overflowRef} style={{ display: "inline-flex" }}>
                    <button
                        ref={overflowRefs.setReference}
                        type="button"
                        onClick={() => { setShowOverflow((v) => !v); setShowEmoji(false); }}
                        style={iconBtnStyle}
                        aria-label="More actions"
                        title="More"
                    >
                        <MoreHorizontal size={14} />
                    </button>
                    {showOverflow && (
                        <div
                            ref={overflowRefs.setFloating}
                            style={{
                                ...overflowStyles,
                                zIndex: 50,
                                minWidth: "140px",
                                background: "var(--bg-1, #111)",
                                border: "1px solid var(--border-2, #333)",
                                borderRadius: "4px",
                                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                            }}
                        >
                            {isOwn && onEdit && (
                                <ActionButton icon={<Pencil size={13} />} label="Edit" onClick={() => { setShowOverflow(false); onEdit(id); }} />
                            )}
                            {isAdmin && onAdminDelete && (
                                <ActionButton icon={<Trash2 size={13} />} label="Delete" color="#ff6b6b" onClick={() => { setShowOverflow(false); onAdminDelete(id); }} />
                            )}
                            {isAdmin && onAdminBan && (
                                <ActionButton icon={<Ban size={13} />} label="Ban user" color="#ff6b6b" onClick={() => { setShowOverflow(false); onAdminBan(sender); }} />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ReactionPill({
    reaction,
    messageId,
    isMine,
    onReact,
}: {
    reaction: ReactionCount;
    messageId: string;
    isMine: boolean;
    onReact?: (messageId: string, emoji: string) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const { refs, floatingStyles } = useFloating({
        open: hovered,
        placement: "top",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
    });

    return (
        <div style={{ display: "inline-flex" }}>
            <button
                ref={refs.setReference}
                type="button"
                onClick={() => onReact?.(messageId, reaction.emoji)}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 6px",
                    fontSize: "12px",
                    background: isMine ? "rgba(0, 255, 200, 0.12)" : "rgba(255,255,255,0.05)",
                    border: isMine ? "1px solid rgba(0, 255, 200, 0.3)" : "1px solid var(--border, rgba(255,255,255,0.1))",
                    cursor: "pointer",
                    color: "var(--fg-2, rgba(255,255,255,0.6))",
                    fontFamily: "var(--font-mono)",
                }}
                aria-label={`${reaction.emoji} ${reaction.count} reaction${reaction.count !== 1 ? "s" : ""}`}
            >
                <span>{reaction.emoji}</span>
                <span style={{ fontSize: "10px" }}>{reaction.count}</span>
            </button>
            {hovered && reaction.domains.length > 0 && (
                <div
                    ref={refs.setFloating}
                    style={{
                        ...floatingStyles,
                        zIndex: 50,
                        padding: "4px 8px",
                        background: "var(--bg-1, #111)",
                        border: "1px solid var(--border-2, #333)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--fg-2, rgba(255,255,255,0.7))",
                        whiteSpace: "nowrap",
                        maxWidth: "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {reaction.domains.slice(0, 10).join(", ")}
                    {reaction.domains.length > 10 && ` +${reaction.domains.length - 10}`}
                </div>
            )}
        </div>
    );
}

function ReactionPills({
    reactions,
    messageId,
    activeDomain,
    onReact,
}: {
    reactions: ReactionCount[];
    messageId: string;
    activeDomain?: string;
    onReact?: (messageId: string, emoji: string) => void;
}) {
    if (reactions.length === 0) return null;

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "1px" }}>
            {reactions.map((r) => (
                <ReactionPill
                    key={r.emoji}
                    reaction={r}
                    messageId={messageId}
                    isMine={activeDomain ? r.domains.includes(activeDomain) : false}
                    onReact={onReact}
                />
            ))}
        </div>
    );
}

function ReplyPreview({ replyContext }: { replyContext: { id: string; sender: string; content: string | null; deleted?: boolean; media?: MediaAttachment } }) {
    const truncated = replyContext.deleted
        ? "[deleted]"
        : (replyContext.content ?? "").slice(0, 100) + ((replyContext.content?.length ?? 0) > 100 ? "…" : "");
    const rawUrl = replyContext.media?.thumbnailUrl ?? replyContext.media?.url;
    const previewUrl = rawUrl ? ipfsUriToGatewayUrl(rawUrl) : undefined;
    const mediaLabel = replyContext.media ? (replyContext.media.type === "gif" ? "GIF" : "Image") : "";
    return (
        <div
            style={{
                padding: "4px 10px",
                marginBottom: "4px",
                background: "rgba(255,255,255,0.03)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--fg-3, #888)",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "6px",
            }}
        >
            {previewUrl && (
                <img
                    src={previewUrl}
                    alt={mediaLabel || "media"}
                    style={{
                        width: "20px",
                        height: "20px",
                        objectFit: "cover",
                        borderRadius: "3px",
                        flexShrink: 0,
                    }}
                />
            )}
            <span style={{ fontWeight: 600, flexShrink: 0 }}>{replyContext.sender}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {truncated || mediaLabel}
            </span>
        </div>
    );
}

function MediaRenderer({ media }: { media: MediaAttachment }) {
    const [expanded, setExpanded] = useState(false);
    const [loadError, setLoadError] = useState(false);

    if (loadError) {
        return (
            <div
                style={{
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border, rgba(255,255,255,0.1))",
                    color: "var(--fg-3, #888)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                }}
            >
                [media failed to load]
            </div>
        );
    }

    const displayUrl = ipfsUriToGatewayUrl(media.url);

    const thumbnailUrl = media.thumbnailUrl ?? displayUrl;

    return (
        <div style={{ marginTop: "4px", maxWidth: "min(320px, calc(100vw - 80px))", overflow: "hidden" }}>
            <img
                src={expanded ? displayUrl : thumbnailUrl}
                alt={media.alt ?? (media.type === "gif" ? "GIF" : "Image")}
                onClick={() => setExpanded((v) => !v)}
                onError={() => setLoadError(true)}
                loading="lazy"
                style={{
                    width: "100%",
                    maxWidth: expanded ? "min(480px, calc(100vw - 40px))" : "min(320px, calc(100vw - 80px))",
                    maxHeight: expanded ? "480px" : "200px",
                    objectFit: "contain",
                    cursor: "pointer",
                    border: "1px solid var(--border, rgba(255,255,255,0.1))",
                    display: "block",
                }}
            />
            {media.provider && (
                <span
                    style={{
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--fg-3, #888)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                    }}
                >
                    via {media.provider}
                </span>
            )}
        </div>
    );
}


function ActionButton({ icon, label, color, onClick }: { icon: ReactNode; label: string; color?: string; onClick: () => void }) {
    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = color ? `${color}11` : "rgba(255,255,255,0.05)";
    }, [color]);
    const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "transparent";
    }, []);

    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: color ?? "var(--fg-1, #fff)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {icon}
            {label}
        </button>
    );
}

function InlineEdit({ content, onSave, onCancel }: { content: string; onSave: (text: string) => void; onCancel: () => void }) {
    const [value, setValue] = useState(content);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSave(value.trim());
        } else if (e.key === "Escape") {
            onCancel();
        }
    };

    return (
        <div style={{
            padding: "6px 12px",
            background: "rgba(0, 255, 200, 0.08)",
        }}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={Math.min(6, Math.max(2, value.split("\n").length))}
                style={{
                    width: "100%",
                    background: "var(--bg-1, #111)",
                    color: "var(--fg, #eee)",
                    border: "1px solid var(--accent, #00ffc8)",
                    fontFamily: "var(--font)",
                    fontSize: "14px",
                    lineHeight: "1.6",
                    padding: "6px 8px",
                    resize: "vertical",
                }}
                aria-label="Edit message"
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", justifyContent: "flex-end" }}>
                <button
                    type="button"
                    onClick={onCancel}
                    style={{
                        background: "transparent",
                        border: "1px solid var(--border-2, #333)",
                        color: "var(--fg-3, #888)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        padding: "4px 12px",
                        cursor: "pointer",
                    }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => { if (value.trim()) onSave(value.trim()); }}
                    style={{
                        background: "var(--accent, #00ffc8)",
                        border: "none",
                        color: "#000",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        padding: "4px 12px",
                        cursor: "pointer",
                    }}
                >
                    Save
                </button>
            </div>
            <div style={{ fontSize: "10px", color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
                Enter to save · Escape to cancel · Shift+Enter for new line
            </div>
        </div>
    );
}

export default function MessageBubble({
    id,
    sender,
    content,
    timestamp,
    isOwn,
    deleted,
    deleteReason,
    media,
    replyContext,
    editedAt,
    reactions,
    activeDomain,
    showHeader = true,
    isAdmin,
    onAdminDelete,
    onAdminBan,
    onReact,
    onReply,
    onEdit,
    isEditing,
    onEditSave,
    onEditCancel,
    onShowProfile,
    chatToken,
}: MessageBubbleProps) {
    if (sender === "__system__") {
        return <SystemMessage content={content ?? ""} timestamp={timestamp} />;
    }

    if (deleted) {
        return <DeletedMessage sender={sender} timestamp={timestamp} deleteReason={deleteReason} isOwn={isOwn} />;
    }

    const handleMentionClick = useCallback((label: string) => {
        if (!onShowProfile) return;
        // Build a synthetic anchor rect from the clicked element (fall back to center of viewport)
        const rect = new DOMRect(window.innerWidth / 2 - 130, window.innerHeight / 3, 0, 0);
        // Try to find the domain with TLD
        const tld = sender.split(".").slice(1).join(".");
        onShowProfile(`${label}.${tld}`, rect);
    }, [onShowProfile, sender]);

    const formattedContent = useMemo(() => content ? formatContent(content, handleMentionClick) : [], [content, handleMentionClick]);
    const contentUrls = useMemo(() => content ? Array.from(new Set(content.match(URL_REGEX) ?? [])).slice(0, 3) : [], [content]);
    const relativeTime = useRelativeTime(timestamp);
    const senderLabel = useMemo(() => sender.split(".")[0], [sender]);
    const contentRef = useRef<HTMLDivElement>(null);

    // Own messages: right-aligned, no avatar
    if (isOwn) {
        return (
            <div
                role="article"
                aria-label={`Message from ${sender}`}
                style={{ position: "relative", outline: "2px solid transparent" }}
                className="group flex flex-col max-w-[95%] md:max-w-[80%] gap-1 self-end items-end focus-visible:outline-[var(--accent,#00ffc8)]"
                tabIndex={0}
            >

                {showHeader && (
                    <span
                        className="text-xs font-bold uppercase tracking-widest px-1"
                        style={{
                            color: "var(--accent, #00ffc8)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            letterSpacing: "0.12em",
                        }}
                    >
                        {sender}
                    </span>
                )}

                {replyContext && <ReplyPreview replyContext={replyContext} />}

                {isEditing && onEditSave && onEditCancel ? (
                    <InlineEdit
                        content={content ?? ""}
                        onSave={(text) => onEditSave(id, text)}
                        onCancel={onEditCancel}
                    />
                ) : (
                    <div
                        ref={contentRef}
                        className="text-sm break-words"
                        style={{
                            padding: "6px 12px",
                            background: "rgba(0, 255, 200, 0.08)",
                            fontFamily: "var(--font)",
                            lineHeight: "1.6",
                        }}
                    >
                        {formattedContent.length > 0 && formattedContent}
                        {media && <MediaRenderer media={media} />}
                        {reactions && reactions.length > 0 && (
                            <ReactionPills reactions={reactions} messageId={id} activeDomain={activeDomain} onReact={onReact} />
                        )}
                    </div>
                )}
                <MessageToolbar
                    id={id}
                    sender={sender}
                    isOwn={isOwn}
                    isAdmin={isAdmin}
                    anchorRef={contentRef}
                    onReact={onReact}
                    onReply={onReply}
                    onEdit={onEdit}
                    onAdminDelete={onAdminDelete}
                    onAdminBan={onAdminBan}
                />

                {chatToken && contentUrls.map((u) => (
                    <LinkPreview key={u} url={u} token={chatToken} />
                ))}

                <div className="flex items-center gap-2" style={{ paddingLeft: "2px", paddingRight: "2px" }}>
                    <span
                        className="text-xs uppercase tracking-wide"
                        style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", fontSize: "10px" }}
                    >
                        {relativeTime}
                    </span>
                    {editedAt && (
                        <span
                            className="text-xs italic"
                            style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", fontSize: "9px" }}
                            title={`Edited ${new Date(editedAt).toLocaleString()}`}
                        >
                            (edited)
                        </span>
                    )}
                </div>
            </div>
        );
    }

    // Other users: avatar on left, content on right
    return (
        <div
            role="article"
            aria-label={`Message from ${sender}`}
            style={{ position: "relative", gap: "8px", outline: "2px solid transparent" }}
            className="group flex max-w-[95%] md:max-w-[80%] self-start focus-visible:outline-[var(--accent,#00ffc8)]"
            tabIndex={0}
        >
            {/* Avatar column — fixed width for alignment */}
            <div style={{ width: "28px", flexShrink: 0, paddingTop: showHeader ? "0" : "2px" }}>
                {showHeader && (
                    <button
                        type="button"
                        onClick={(e) => onShowProfile?.(sender, e.currentTarget.getBoundingClientRect())}
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                        aria-label={`View profile for ${sender}`}
                    >
                        <ChatAvatar label={senderLabel} size={28} hoverAnimate borderRadius="4px" />
                    </button>
                )}
            </div>

            {/* Content column */}
            <div className="flex flex-col gap-1" style={{ flex: "1 1 0", minWidth: 0 }}>
                {showHeader && (
                    <button
                        type="button"
                        onClick={(e) => onShowProfile?.(sender, e.currentTarget.getBoundingClientRect())}
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{
                            color: "var(--fg-2, rgba(255,255,255,0.6))",
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            letterSpacing: "0.12em",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            textAlign: "left",
                        }}
                    >
                        {sender}
                    </button>
                )}

                {replyContext && <ReplyPreview replyContext={replyContext} />}

                <div
                    ref={contentRef}
                    className="text-sm break-words"
                    style={{
                        padding: "6px 12px",
                        background: "var(--bg-2, #0a0a0a)",
                        fontFamily: "var(--font)",
                        lineHeight: "1.6",
                    }}
                >
                    {formattedContent.length > 0 && formattedContent}
                    {media && <MediaRenderer media={media} />}
                    {reactions && reactions.length > 0 && (
                        <ReactionPills reactions={reactions} messageId={id} activeDomain={activeDomain} onReact={onReact} />
                    )}
                </div>
                <MessageToolbar
                    id={id}
                    sender={sender}
                    isOwn={isOwn}
                    isAdmin={isAdmin}
                    anchorRef={contentRef}
                    onReact={onReact}
                    onReply={onReply}
                    onEdit={onEdit}
                    onAdminDelete={onAdminDelete}
                    onAdminBan={onAdminBan}
                />

                {chatToken && contentUrls.map((u) => (
                    <LinkPreview key={u} url={u} token={chatToken} />
                ))}

                <div className="flex items-center gap-2">
                    <span
                        className="text-xs uppercase tracking-wide"
                        style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", fontSize: "10px" }}
                    >
                        {relativeTime}
                    </span>
                    {editedAt && (
                        <span
                            className="text-xs italic"
                            style={{ color: "var(--fg-3, #888)", fontFamily: "var(--font-mono)", fontSize: "9px" }}
                            title={`Edited ${new Date(editedAt).toLocaleString()}`}
                        >
                            (edited)
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
