import { useRef, useCallback, useState, useLayoutEffect } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import type { ChatMessage, MediaAttachment } from "../../types/chat";

interface ChatMessagePanelProps {
    messages: ChatMessage[];
    activeDomain: string;
    isConnected: boolean;
    isLoading: boolean;
    hasMore: boolean;
    loadMore: () => void;
    sendMessage: (content: string, media?: MediaAttachment, replyTo?: string) => void;
    sendTyping: (active: boolean) => void;
    reactToMessage: (messageId: string, emoji: string) => void;
    editMessage: (messageId: string, content: string) => void;
    typingUsers: string[];
    disabled?: boolean;
    emptyLabel?: string;
    emptySubLabel?: string;
    ariaLabel?: string;

    // Optional features (global chat has these, DMs may not)
    isAdmin?: boolean;
    token?: string;
    gifEnabled?: boolean;
    onImageUpload?: (file: File) => Promise<{ url: string; width: number; height: number } | null>;
    mentionCandidates?: string[];
    onAdminDelete?: (messageId: string, senderDomain: string) => void;
    onAdminBan?: (domain: string) => void;
    onShowProfile?: (domain: string, rect: DOMRect) => void;
}

export default function ChatMessagePanel({
    messages,
    activeDomain,
    isConnected,
    isLoading,
    hasMore,
    loadMore,
    sendMessage,
    sendTyping,
    reactToMessage,
    editMessage,
    typingUsers,
    disabled,
    emptyLabel = "No messages yet",
    emptySubLabel = "be the first to say something",
    ariaLabel = "Chat messages",
    isAdmin,
    token,
    gifEnabled,
    onImageUpload,
    mentionCandidates,
    onAdminDelete,
    onAdminBan,
    onShowProfile,
}: ChatMessagePanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);
    const isInitialLoadRef = useRef(true);

    const [replyTarget, setReplyTarget] = useState<{ id: string; sender: string; content: string | null; media?: MediaAttachment } | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

    const handleScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        shouldAutoScrollRef.current = distFromBottom < 100;

        if (el.scrollTop < 50 && hasMore && !isLoading) {
            loadMore();
        }
    }, [hasMore, isLoading, loadMore]);

    useLayoutEffect(() => {
        if (messages.length === 0 && isInitialLoadRef.current) return;
        if (!shouldAutoScrollRef.current) return;
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
        isInitialLoadRef.current = false;
    }, [messages.length]);

    const handleSend = useCallback((content: string, media?: { type: "gif" | "image"; url: string; preview?: string; width?: number; height?: number; title?: string }) => {
        const mediaAttachment: MediaAttachment | undefined = media ? {
            type: media.type,
            url: media.url,
            thumbnailUrl: media.preview,
            width: media.width,
            height: media.height,
            alt: media.title,
            ...(media.type === "gif" ? { provider: "KLIPY" as const } : {}),
        } : undefined;
        sendMessage(content, mediaAttachment, replyTarget?.id);
        setReplyTarget(null);
    }, [sendMessage, replyTarget]);

    return (
        <>
            {/* Message list */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                role="log"
                aria-label={ariaLabel}
                aria-live="polite"
                className="flex-1 overflow-y-auto flex flex-col px-6 py-5 gap-4"
            >
                {isLoading && (
                    <div className="flex justify-center py-2">
                        <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-3, #888)" }} />
                    </div>
                )}
                {messages.length === 0 && !isLoading && (
                    <div className="flex-1 flex items-center justify-center px-4">
                        <div className="text-center" style={{ color: "var(--fg-3, #888)" }}>
                            <MessageCircle size={48} className="opacity-20 mx-auto mb-4" aria-hidden="true" />
                            <p
                                className="text-xs uppercase tracking-widest font-bold"
                                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}
                            >
                                {emptyLabel}
                            </p>
                            <p
                                className="text-xs mt-2"
                                style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3, #888)" }}
                            >
                                {emptySubLabel}
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const showHeader = !prevMsg
                        || prevMsg.sender !== msg.sender
                        || prevMsg.sender === "__system__"
                        || prevMsg.deleted === true;
                    const resolvedReplyContext = msg.replyTo
                        ? msg.replyContext ?? (() => {
                            const ref = messages.find((m) => m.id === msg.replyTo);
                            return ref ? { id: ref.id, sender: ref.sender, content: ref.content, deleted: ref.deleted, media: ref.media } : undefined;
                        })()
                        : undefined;
                    return (
                        <MessageBubble
                            key={msg.id}
                            id={msg.id}
                            sender={msg.sender}
                            content={msg.content}
                            timestamp={msg.timestamp}
                            isOwn={msg.sender === activeDomain}
                            deleted={msg.deleted}
                            deletedBy={msg.deletedBy}
                            deleteReason={msg.deleteReason}
                            media={msg.media}
                            replyTo={msg.replyTo}
                            replyContext={resolvedReplyContext}
                            editedAt={msg.editedAt}
                            reactions={msg.reactions}
                            activeDomain={activeDomain}
                            showHeader={showHeader}
                            isAdmin={isAdmin}
                            onReact={reactToMessage}
                            onReply={(messageId) => {
                                const target = messages.find((m) => m.id === messageId);
                                if (target) setReplyTarget({ id: target.id, sender: target.sender, content: target.content, media: target.media });
                            }}
                            onEdit={(messageId) => {
                                setEditingMessageId(messageId);
                            }}
                            isEditing={editingMessageId === msg.id}
                            onEditSave={(messageId, newContent) => {
                                editMessage(messageId, newContent);
                                setEditingMessageId(null);
                            }}
                            onEditCancel={() => setEditingMessageId(null)}
                            onAdminDelete={onAdminDelete ? (messageId) => {
                                const target = messages.find((m) => m.id === messageId);
                                if (target) onAdminDelete(messageId, target.sender);
                            } : undefined}
                            onAdminBan={onAdminBan}
                            onShowProfile={onShowProfile}
                            chatToken={token}
                        />
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
                <div
                    className="text-xs uppercase tracking-wide px-7 py-1.5"
                    aria-live="polite"
                    style={{
                        color: "var(--fg-3, #888)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        letterSpacing: "0.08em",
                    }}
                >
                    {typingUsers.length === 1
                        ? `${typingUsers[0]} is typing…`
                        : `${typingUsers.join(", ")} are typing…`}
                </div>
            )}

            {/* Message input */}
            <MessageInput
                onSend={handleSend}
                onTyping={sendTyping}
                disabled={disabled ?? !isConnected}
                replyTarget={replyTarget}
                onCancelReply={() => setReplyTarget(null)}
                token={token}
                gifEnabled={gifEnabled}
                onImageUpload={onImageUpload}
                mentionCandidates={mentionCandidates}
            />
        </>
    );
}
