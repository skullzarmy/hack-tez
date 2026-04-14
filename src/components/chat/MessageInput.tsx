import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Send, X, ImageIcon, Paperclip, Loader2 } from "lucide-react";
import GifPicker from "./GifPicker";
import ChatAvatar from "./ChatAvatar";
import { ipfsUriToGatewayUrl } from "../../lib/pin";

import type { MediaAttachment } from "../../types/chat";

interface ReplyTarget {
    id: string;
    sender: string;
    content: string | null;
    media?: MediaAttachment;
}

interface PendingMedia {
    type: "gif" | "image";
    url: string;
    preview: string;
    width: number;
    height: number;
    title?: string;
}

interface MessageInputProps {
    onSend: (content: string, media?: PendingMedia) => void;
    onTyping: (active: boolean) => void;
    disabled: boolean;
    replyTarget?: ReplyTarget | null;
    onCancelReply?: () => void;
    token?: string;
    gifEnabled?: boolean;
    onImageUpload?: (file: File) => Promise<{ url: string; width: number; height: number } | null>;
    mentionCandidates?: string[];
}

const INPUT_HINT_ID = "message-input-hint";

export default function MessageInput({ onSend, onTyping, disabled, replyTarget, onCancelReply, token, gifEnabled, onImageUpload, mentionCandidates }: MessageInputProps) {
    const [value, setValue] = useState("");
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isTypingRef = useRef(false);

    // Auto-dismiss upload error after 4 seconds
    useEffect(() => {
        if (!uploadError) return;
        const t = setTimeout(() => setUploadError(null), 4000);
        return () => clearTimeout(t);
    }, [uploadError]);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        const lineHeight = 20;
        const maxHeight = lineHeight * 5;
        el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, [value]);

    // Compute filtered mention candidates from current query
    const mentionMatches = useMemo(() => {
        if (mentionQuery === null || !mentionCandidates?.length) return [];
        const q = mentionQuery.toLowerCase();
        return mentionCandidates
            .filter((d) => d.toLowerCase().startsWith(q) || d.split(".")[0].toLowerCase().startsWith(q))
            .slice(0, 8);
    }, [mentionQuery, mentionCandidates]);

    /** Detect @ mention trigger from cursor position in textarea value */
    const detectMentionQuery = useCallback((text: string, cursorPos: number) => {
        const beforeCursor = text.slice(0, cursorPos);
        const match = beforeCursor.match(/@([a-zA-Z0-9-]*)$/);
        if (match) {
            setMentionQuery(match[1]);
            setMentionIndex(0);
        } else {
            setMentionQuery(null);
        }
    }, []);

    /** Insert a mention at the current @ trigger position */
    const insertMention = useCallback((domain: string) => {
        const el = textareaRef.current;
        if (!el) return;
        const cursorPos = el.selectionStart;
        const beforeCursor = value.slice(0, cursorPos);
        const atIdx = beforeCursor.lastIndexOf("@");
        if (atIdx === -1) return;

        const label = domain.split(".")[0];
        const after = value.slice(cursorPos);
        const newValue = beforeCursor.slice(0, atIdx) + `@${label} ` + after;
        setValue(newValue);
        setMentionQuery(null);

        // Restore cursor position after React re-render
        const newPos = atIdx + label.length + 2; // @label + space
        requestAnimationFrame(() => {
            el.setSelectionRange(newPos, newPos);
            el.focus();
        });
    }, [value]);

    const handleSend = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed && !pendingMedia) return;
        onSend(trimmed, pendingMedia ?? undefined);
        setValue("");
        setPendingMedia(null);
        setMentionQuery(null);
        // Clear typing state
        if (isTypingRef.current) {
            isTypingRef.current = false;
            onTyping(false);
        }
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
    }, [value, pendingMedia, onSend, onTyping]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Handle mention autocomplete navigation
            if (mentionQuery !== null && mentionMatches.length > 0) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => (i + 1) % mentionMatches.length);
                    return;
                }
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                    return;
                }
                if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    insertMention(mentionMatches[mentionIndex]);
                    return;
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionQuery(null);
                    return;
                }
            }
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend, mentionQuery, mentionMatches, mentionIndex, insertMention],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newValue = e.target.value;
            setValue(newValue);
            detectMentionQuery(newValue, e.target.selectionStart);

            // Debounced typing indicator
            if (!isTypingRef.current) {
                isTypingRef.current = true;
                onTyping(true);
            }
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
                isTypingRef.current = false;
                onTyping(false);
                typingTimeoutRef.current = null;
            }, 2000);
        },
        [onTyping, detectMentionQuery],
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, []);

    // Focus textarea when reply target changes
    useEffect(() => {
        if (replyTarget) textareaRef.current?.focus();
    }, [replyTarget]);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onImageUpload) return;
        // Reset input so same file can be re-selected
        e.target.value = "";

        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            setUploadError("Image must be under 5MB");
            return;
        }
        if (!file.type.startsWith("image/")) {
            setUploadError("Only image files are supported");
            return;
        }

        setUploadError(null);
        setUploading(true);
        try {
            const result = await onImageUpload(file);
            if (result) {
                setPendingMedia({
                    type: "image",
                    url: result.url,
                    preview: result.url,
                    width: result.width,
                    height: result.height,
                });
                textareaRef.current?.focus();
            }
        } catch {
            setUploadError("Failed to upload image. Please try again.");
        } finally {
            setUploading(false);
        }
    }, [onImageUpload]);

    return (
        <div
            className="shrink-0 px-6 py-3"
            style={{
                borderTop: "1px solid var(--border-2, #333)",
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
                position: "relative",
            }}
        >
            {/* GIF picker */}
            {showGifPicker && token && gifEnabled && (
                <GifPicker
                    token={token}
                    onSelect={(gif) => {
                        setShowGifPicker(false);
                        setPendingMedia({
                            type: "gif",
                            url: gif.url,
                            preview: gif.preview,
                            width: gif.width,
                            height: gif.height,
                            title: gif.title,
                        });
                        textareaRef.current?.focus();
                    }}
                    onClose={() => setShowGifPicker(false)}
                />
            )}

            {/* Upload error toast */}
            {uploadError && (
                <div style={{
                    position: "absolute",
                    bottom: "100%",
                    left: "16px",
                    right: "16px",
                    marginBottom: "8px",
                    padding: "8px 12px",
                    background: "rgba(255, 80, 80, 0.15)",
                    border: "1px solid rgba(255, 80, 80, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    zIndex: 10,
                }}>
                    <span style={{ fontSize: "12px", color: "#ff6b6b", fontFamily: "var(--font-mono)" }}>{uploadError}</span>
                    <button
                        type="button"
                        onClick={() => setUploadError(null)}
                        style={{ background: "transparent", border: "none", color: "#ff6b6b", cursor: "pointer", padding: "4px", display: "flex" }}
                        aria-label="Dismiss error"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Mention autocomplete dropdown */}
            {mentionQuery !== null && mentionMatches.length > 0 && (
                <div
                    role="listbox"
                    aria-label="Mention suggestions"
                    style={{
                        position: "absolute",
                        bottom: "100%",
                        left: "24px",
                        right: "24px",
                        background: "var(--bg-1, #111)",
                        border: "1px solid var(--border-2, #333)",
                        boxShadow: "0 -4px 16px rgba(0,0,0,0.5)",
                        maxHeight: "min(200px, 40vh)",
                        overflowY: "auto",
                        zIndex: 20,
                    }}
                >
                    {mentionMatches.map((domain, i) => (
                        <button
                            key={domain}
                            type="button"
                            role="option"
                            aria-selected={i === mentionIndex}
                            onClick={() => insertMention(domain)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                width: "100%",
                                padding: "8px 12px",
                                background: i === mentionIndex ? "rgba(0, 255, 200, 0.1)" : "transparent",
                                border: "none",
                                borderBottom: "1px solid var(--border, rgba(255,255,255,0.06))",
                                cursor: "pointer",
                                fontFamily: "var(--font-mono)",
                                fontSize: "12px",
                                color: "var(--fg, #eee)",
                                textAlign: "left",
                            }}
                        >
                            <ChatAvatar label={domain.split(".")[0]} size={20} borderRadius="3px" />
                            <span>{domain}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Pending media preview */}
            {pendingMedia && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 12px",
                        marginBottom: "6px",
                        background: "rgba(255,255,255,0.03)",
                    }}
                >
                    <img
                        src={pendingMedia.preview}
                        alt={pendingMedia.title ?? "Attached media"}
                        style={{
                            width: "48px",
                            height: "48px",
                            objectFit: "cover",
                            borderRadius: "4px",
                            border: "1px solid var(--border, rgba(255,255,255,0.1))",
                        }}
                    />
                    <div style={{ flex: 1, overflow: "hidden" }}>
                        <span style={{
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                            color: "var(--fg-2, rgba(255,255,255,0.6))",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                        }}>
                            {pendingMedia.type === "gif" ? "GIF" : "Image"} attached
                        </span>
                        {pendingMedia.title && (
                            <div style={{
                                fontSize: "11px",
                                fontFamily: "var(--font-mono)",
                                color: "var(--fg-3, #888)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}>
                                {pendingMedia.title}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setPendingMedia(null)}
                        style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--fg-3, #888)",
                            padding: "4px",
                            display: "flex",
                        }}
                        aria-label="Remove attachment"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Reply preview */}
            {replyTarget && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 12px",
                        marginBottom: "6px",
                        background: "rgba(255,255,255,0.03)",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--fg-3, #888)",
                    }}
                >
                    <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px" }}>
                        {replyTarget.media && (replyTarget.media.thumbnailUrl || replyTarget.media.url) && (
                            <img
                                src={ipfsUriToGatewayUrl(replyTarget.media.thumbnailUrl ?? replyTarget.media.url)}
                                alt={replyTarget.media.type === "gif" ? "GIF" : "Image"}
                                style={{
                                    width: "20px",
                                    height: "20px",
                                    objectFit: "cover",
                                    borderRadius: "3px",
                                    flexShrink: 0,
                                }}
                            />
                        )}
                        <span style={{ fontWeight: 600, color: "var(--fg-2, rgba(255,255,255,0.6))", flexShrink: 0 }}>
                            {replyTarget.sender}
                        </span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {(replyTarget.content ?? "").slice(0, 80) || (replyTarget.media ? (replyTarget.media.type === "gif" ? "GIF" : "Image") : "")}
                            {(replyTarget.content?.length ?? 0) > 80 ? "…" : ""}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onCancelReply}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-3, #888)", padding: "2px", display: "flex" }}
                        aria-label="Cancel reply"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            <div
                className="flex items-end px-3 py-2 gap-2"
                style={{
                    background: "var(--bg-2, #0a0a0a)",
                    border: `1px solid ${disabled ? "var(--border, rgba(255,255,255,0.1))" : "var(--border-2, #333)"}`,
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={disabled ? "connecting…" : "type a message…"}
                    rows={1}
                    aria-label="Message"
                    aria-describedby={INPUT_HINT_ID}
                    className="flex-1 bg-transparent text-sm outline-none border-0 resize-none"
                    style={{
                        color: "var(--fg, #eee)",
                        fontFamily: "var(--font)",
                        lineHeight: "22px",
                        maxHeight: "110px",
                        fontSize: "13px",
                    }}
                />
                {/* Image upload button */}
                {onImageUpload && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            style={{ display: "none" }}
                            aria-hidden="true"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={disabled || uploading}
                            className="shrink-0 inline-flex items-center justify-center transition-colors"
                            style={{
                                width: "36px",
                                height: "36px",
                                color: uploading ? "var(--accent, #00ffc8)" : "var(--fg-3, #888)",
                                cursor: disabled || uploading ? "default" : "pointer",
                                border: "none",
                                background: "transparent",
                            }}
                            aria-label={uploading ? "Uploading image…" : "Attach image"}
                        >
                            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                        </button>
                    </>
                )}
                {/* GIF button */}
                {token && gifEnabled && (
                    <button
                        type="button"
                        onClick={() => setShowGifPicker((v) => !v)}
                        disabled={disabled}
                        className="shrink-0 inline-flex items-center justify-center transition-colors"
                        style={{
                            width: "36px",
                            height: "36px",
                            color: showGifPicker ? "var(--accent, #00ffc8)" : "var(--fg-3, #888)",
                            cursor: disabled ? "default" : "pointer",
                            border: "none",
                            background: "transparent",
                        }}
                        aria-label="Search GIFs"
                        aria-expanded={showGifPicker}
                    >
                        <ImageIcon size={16} />
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={disabled || (!value.trim() && !pendingMedia)}
                    className="shrink-0 inline-flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                        width: "36px",
                        height: "36px",
                        color: (value.trim() || pendingMedia) && !disabled
                            ? "var(--accent, #00ffc8)"
                            : "var(--fg-3, #888)",
                        cursor: (value.trim() || pendingMedia) && !disabled ? "pointer" : "default",
                        border: "none",
                        background: "transparent",
                        outlineColor: "var(--accent, #00ffc8)",
                    }}
                    aria-label="Send message"
                >
                    <Send size={16} />
                </button>
            </div>
            <span id={INPUT_HINT_ID} className="sr-only">
                Press Enter to send, Shift+Enter for a new line
            </span>
        </div>
    );
}
