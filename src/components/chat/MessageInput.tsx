import { useState, useRef, useCallback, useEffect } from "react";
import { Send } from "lucide-react";

interface MessageInputProps {
    onSend: (content: string) => void;
    onTyping: (active: boolean) => void;
    disabled: boolean;
}

export default function MessageInput({ onSend, onTyping, disabled }: MessageInputProps) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isTypingRef = useRef(false);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        const lineHeight = 20;
        const maxHeight = lineHeight * 5;
        el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, [value]);

    const handleSend = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setValue("");
        // Clear typing state
        if (isTypingRef.current) {
            isTypingRef.current = false;
            onTyping(false);
        }
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
    }, [value, onSend, onTyping]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            setValue(e.target.value);

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
        [onTyping],
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            className="shrink-0 px-4 py-3"
            style={{ borderTop: "1px solid var(--border-2, #333)" }}
        >
            <div
                className="flex items-end gap-2 rounded px-3 py-2"
                style={{
                    background: "var(--bg-2, #0a0a0a)",
                    border: `1px solid ${disabled ? "var(--border-2, #333)" : "var(--border, #555)"}`,
                    opacity: disabled ? 0.6 : 1,
                }}
            >
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={disabled ? "Connecting…" : "Type a message…"}
                    rows={1}
                    className="flex-1 bg-transparent text-sm outline-none border-0 resize-none"
                    style={{
                        color: "var(--fg, #eee)",
                        fontFamily: "var(--font)",
                        lineHeight: "20px",
                        maxHeight: "100px",
                    }}
                />
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={disabled || !value.trim()}
                    className="shrink-0 p-1 rounded transition-colors"
                    style={{
                        color: value.trim() && !disabled
                            ? "var(--accent, #00ffc8)"
                            : "var(--fg-muted, #888)",
                        cursor: value.trim() && !disabled ? "pointer" : "default",
                    }}
                    aria-label="Send message"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}
