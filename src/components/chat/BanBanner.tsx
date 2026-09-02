import { useState, useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import type { BanInfo } from "../../hooks/useChat";

interface BanBannerProps {
    ban: BanInfo;
    onExpired: () => void;
}

function formatCountdown(ms: number): string {
    if (ms <= 0) return "0s";
    const totalSeconds = Math.ceil(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(" ");
}

export default function BanBanner({ ban, onExpired }: BanBannerProps) {
    const [remaining, setRemaining] = useState<number | null>(() => {
        if (!ban.expiresAt) return null;
        return Math.max(0, new Date(ban.expiresAt).getTime() - Date.now());
    });

    useEffect(() => {
        const expiresAt = ban.expiresAt;
        if (!expiresAt) return;

        const tick = () => {
            const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
            setRemaining(ms);
            if (ms <= 0) onExpired();
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [ban.expiresAt, onExpired]);

    const isPermanent = !ban.expiresAt;
    const isExpired = remaining !== null && remaining <= 0;

    return (
        <div
            role="alert"
            className="flex items-center justify-center text-xs font-bold uppercase tracking-widest shrink-0 gap-2"
            style={{
                background: "rgba(255,107,107,0.08)",
                borderBottom: "1px solid #ff6b6b",
                color: "#ff6b6b",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.1em",
                padding: "10px calc(16px + env(safe-area-inset-left, 0px)) 10px calc(16px + env(safe-area-inset-right, 0px))",
            }}
        >
            <ShieldAlert size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>
                {isPermanent && (
                    <>You are permanently banned · {ban.reason}</>
                )}
                {!isPermanent && !isExpired && (
                    <>Banned for {formatCountdown(remaining ?? 0)} · {ban.reason}</>
                )}
                {!isPermanent && isExpired && (
                    <>Ban expired · Reconnecting…</>
                )}
            </span>
        </div>
    );
}
