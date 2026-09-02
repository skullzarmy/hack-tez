import { useState, useEffect, useRef } from "react";
import { type ActivityEvent, truncateAddr } from "../hooks/useRecentActivity";

interface ToastItem {
    event: ActivityEvent;
    id: string; // same as event.id
    exiting: boolean;
}

const TOAST_TTL_MS = 5000;
const MAX_TOASTS = 1;

interface Props {
    newEvents: ActivityEvent[];
}

function formatUTC(date: Date): string {
    const yyyy = date.getUTCFullYear();
    const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0");
    const dd = date.getUTCDate().toString().padStart(2, "0");
    const h = date.getUTCHours().toString().padStart(2, "0");
    const m = date.getUTCMinutes().toString().padStart(2, "0");
    return `${yyyy}-${mo}-${dd} ${h}:${m} UTC`;
}

export default function ActivityToastQueue({ newEvents }: Props) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    function addToast(event: ActivityEvent) {
        const item: ToastItem = { event, id: event.id, exiting: false };
        setToasts((prev) => {
            const combined = [item, ...prev];
            const seen = new Set<string>();
            return combined
                .filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
                .slice(0, MAX_TOASTS);
        });
        if (!timers.current.has(event.id)) {
            const t = setTimeout(() => dismiss(event.id), TOAST_TTL_MS);
            timers.current.set(event.id, t);
        }
    }

    function dismiss(id: string) {
        // Start exit animation
        setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
        );
        // Remove after animation
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 300);
        const t = timers.current.get(id);
        if (t) {
            clearTimeout(t);
            timers.current.delete(id);
        }
    }

    // biome-ignore lint/correctness/useExhaustiveDependencies: addToast is rebuilt every render; depending on it would re-fire the toasts for newEvents on each one
    useEffect(() => {
        if (newEvents.length === 0) return;
        for (const event of newEvents) addToast(event);
    }, [newEvents]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            for (const t of timers.current.values()) clearTimeout(t);
        };
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div
            className="toast-queue"
            role="log"
            aria-live="polite"
            aria-label="Recent activity notifications"
        >
            {toasts.map((toast) => {
                const { event } = toast;
                const addr = truncateAddr(event.address);
                const verb = event.type === "claimed" ? "claimed" : "committed";
                const colorClass = event.type === "claimed" ? "toast-ok" : "toast-info";

                return (
                    <div
                        key={toast.id}
                        className={`activity-toast${toast.exiting ? " activity-toast--exit" : ""}`}
                        role="status"
                    >
                        <div className="toast-body">
                            <span className="toast-icon" aria-hidden="true">⚡</span>
                            <div className="toast-content">
                                <span className="toast-addr" title={event.address}>
                                    {addr}
                                </span>{" "}
                                <span className={`toast-verb ${colorClass}`}>{verb}</span>
                                {event.name && (
                                    <div className="toast-name">{event.name}</div>
                                )}
                                <time
                                    className="toast-time"
                                    dateTime={event.timestamp.toISOString()}
                                >
                                    {formatUTC(event.timestamp)}
                                </time>
                            </div>
                        </div>
                        <button
                            className="toast-dismiss"
                            onClick={() => dismiss(toast.id)}
                            aria-label="Dismiss notification"
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
