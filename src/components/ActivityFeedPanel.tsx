import { useState } from "react";
import { type ActivityEvent, truncateAddr } from "../hooks/useRecentActivity";

interface Props {
    events: ActivityEvent[];
    isLoading: boolean;
}

function formatUTC(date: Date): string {
    const yyyy = date.getUTCFullYear();
    const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0");
    const dd = date.getUTCDate().toString().padStart(2, "0");
    const h = date.getUTCHours().toString().padStart(2, "0");
    const m = date.getUTCMinutes().toString().padStart(2, "0");
    return `${yyyy}-${mo}-${dd} ${h}:${m} UTC`;
}

function EventRow({ event }: { event: ActivityEvent }) {
    const addr = truncateAddr(event.address);
    const verb = event.type === "claimed" ? "claimed" : "committed";
    const colorClass = event.type === "claimed" ? "activity-ok" : "activity-info";

    return (
        <div className="activity-row" role="listitem">
            <div className="activity-row-main">
                <span className="activity-addr" title={event.address}>
                    {addr}
                </span>
                <span className={`activity-verb ${colorClass}`}>{verb}</span>
            </div>
            {event.name && (
                <div className="activity-name" title={event.name}>
                    {event.name}
                </div>
            )}
            <time
                className="activity-time"
                dateTime={event.timestamp.toISOString()}
                title={event.timestamp.toISOString()}
            >
                {formatUTC(event.timestamp)}
            </time>
        </div>
    );
}

export default function ActivityFeedPanel({ events, isLoading }: Props) {
    const [collapsed, setCollapsed] = useState(() => {
        return typeof localStorage !== "undefined" && localStorage.getItem("hack-tez-feed-collapsed") === "1";
    });

    function toggle() {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem("hack-tez-feed-collapsed", next ? "1" : "0");
    }

    return (
        <aside
            className={`activity-panel${collapsed ? " activity-panel--collapsed" : ""}`}
            aria-label="Recent activity"
        >
            <div className="activity-panel-header">
                <span className="activity-panel-title" aria-hidden="true">
                    ⚡ RECENT
                </span>
                <button type="button"
                    className="activity-panel-toggle"
                    onClick={toggle}
                    aria-expanded={!collapsed}
                    aria-controls="activity-panel-body"
                    title={collapsed ? "Expand activity feed" : "Collapse activity feed"}
                >
                    {collapsed ? "▸" : "✕"}
                </button>
            </div>

            <div id="activity-panel-body" className="activity-panel-body" hidden={collapsed}>
                {isLoading && <p className="activity-empty">loading…</p>}
                {!isLoading && events.length === 0 && <p className="activity-empty">no activity yet</p>}
                {!isLoading && events.length > 0 && (
                    <div role="list" className="activity-list">
                        {events.map((e) => (
                            <EventRow key={e.id} event={e} />
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
}
