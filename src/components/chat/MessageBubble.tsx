import type { ReactNode } from "react";
import { useMemo } from "react";
import DOMPurify from "dompurify";

interface MessageBubbleProps {
    id: string;
    sender: string;
    content: string;
    timestamp: string;
    isOwn: boolean;
}

function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

/** Strip ALL HTML tags, then apply our safe markdown-like formatting. */
function formatContent(raw: string): ReactNode[] {
    const clean = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    const parts: ReactNode[] = [];
    let key = 0;

    const segments = clean.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

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
                    className="px-1.5 py-0.5 text-xs"
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
            const urlParts = seg.split(URL_REGEX);
            const urls = seg.match(URL_REGEX) ?? [];
            for (let i = 0; i < urlParts.length; i++) {
                if (urlParts[i]) parts.push(urlParts[i]);
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
    }

    return parts;
}

function SystemMessage({ content, timestamp }: { content: string; timestamp: string }) {
    const relativeTime = useMemo(() => formatRelativeTime(timestamp), [timestamp]);
    return (
        <div className="flex items-center gap-3 py-2" role="article" aria-label={`System: ${content}`}>
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
                <span className="ml-2 opacity-60">{relativeTime}</span>
            </span>
            <span className="flex-1 h-px" style={{ background: "var(--border, rgba(255,255,255,0.1))" }} />
        </div>
    );
}

export default function MessageBubble({ sender, content, timestamp, isOwn }: MessageBubbleProps) {
    if (sender === "__system__") {
        return <SystemMessage content={content} timestamp={timestamp} />;
    }

    const formattedContent = useMemo(() => formatContent(content), [content]);
    const relativeTime = useMemo(() => formatRelativeTime(timestamp), [timestamp]);

    return (
        <div
            role="article"
            aria-label={`Message from ${sender}`}
            className={`flex flex-col gap-1 max-w-[95%] md:max-w-[80%] ${isOwn ? "self-end items-end" : "self-start items-start"}`}
        >
            <span
                className="text-xs font-bold uppercase tracking-widest px-1"
                style={{
                    color: isOwn ? "var(--accent, #00ffc8)" : "var(--fg-2, rgba(255,255,255,0.6))",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                }}
            >
                {sender}
            </span>

            <div
                className="px-4 py-2.5 text-sm break-words"
                style={{
                    background: isOwn
                        ? "rgba(0, 255, 200, 0.08)"
                        : "var(--bg-2, #0a0a0a)",
                    borderLeft: isOwn
                        ? "2px solid var(--accent, #00ffc8)"
                        : "2px solid var(--border-2, #333)",
                    fontFamily: "var(--font)",
                    lineHeight: "1.6",
                }}
            >
                {formattedContent}
            </div>

            <span
                className="text-xs px-1 uppercase tracking-wide"
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
