/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useCallback, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
    MessageCircle,
    Users,
    ChessKnight,
    BookOpen,
    FlaskConical,
    RefreshCw,
} from "lucide-react";
import {
    AnimatedIcon,
    LazyUsersIcon,
    LazyMessageCircleIcon,
    LazyFlaskIcon,
    LazyBookTextIcon,
    LazyChessKnightIcon,
    LazyRefreshCwIcon,
    useAnimatedIconTrigger,
} from "./icons/animated";

import { useOnboarding } from "../context/OnboardingContext";
import { useRecentActivity, truncateAddr } from "../hooks/useRecentActivity";
import { useDomainCount } from "../hooks/useDomainCount";
import DomainTile from "./DomainTile";
import type { SubdomainRecord } from "../lib/domains";
import type { ActivityEvent } from "../hooks/useRecentActivity";
import PushSubscribeButton from "./PushSubscribeButton";
import ProfileHint from "./onboarding/ProfileHint";
import PushHint from "./onboarding/PushHint";

// ── Small sub-components ─────────────────────────────────────────────

function formatUTC(date: Date): string {
    const yyyy = date.getUTCFullYear();
    const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0");
    const dd = date.getUTCDate().toString().padStart(2, "0");
    const h = date.getUTCHours().toString().padStart(2, "0");
    const m = date.getUTCMinutes().toString().padStart(2, "0");
    return `${yyyy}-${mo}-${dd} ${h}:${m} UTC`;
}

function ActivityRow({ event }: { event: ActivityEvent }) {
    const addr = truncateAddr(event.address);
    const verb = event.type === "claimed" ? "claimed" : "committed";
    const colorClass = event.type === "claimed" ? "activity-ok" : "activity-info";

    return (
        <div className="activity-row" role="listitem">
            <div className="activity-row-main">
                <span className="activity-addr" title={event.address}>{addr}</span>
                <span className={`activity-verb ${colorClass}`}>{verb}</span>
            </div>
            {event.name && (
                <div className="activity-name" title={event.name}>{event.name}</div>
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

function AnimatedQuickLink({
    href,
    label,
    Lazy,
    fallback,
}: {
    href: string;
    label: string;
    Lazy: Parameters<typeof AnimatedIcon>[0]["Lazy"];
    fallback: ReactNode;
}) {
    const { iconRef, handlers } = useAnimatedIconTrigger();
    return (
        <Link to={href} className="dashboard-quick-link" {...handlers}>
            <AnimatedIcon ref={iconRef} Lazy={Lazy} fallback={fallback} size={18} />
            {label}
        </Link>
    );
}

// ── Main ─────────────────────────────────────────────────────────────

interface HomeDashboardProps {
    subdomains: SubdomainRecord[];
    loading: boolean;
    refresh: () => Promise<void>;
}

export default function HomeDashboard({ subdomains, loading, refresh }: HomeDashboardProps) {

    const { step: onboardingStep } = useOnboarding();
    const { events, isLoading: activityLoading } = useRecentActivity();
    const totalDomains = useDomainCount();
    const [refreshing, setRefreshing] = useState(false);
    const refreshTrigger = useAnimatedIconTrigger();

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
    }, [refresh]);

    const topLevel = subdomains.filter((d) => d.name.split(".").length === 3);

    return (
        <div className="container dashboard">
            {/* ── EXPLORE ───────────────────────────────────────────── */}
            <section className="dashboard-section">
                <h2 className="dashboard-h2">
                    // EXPLORE
                </h2>
                <div className="dashboard-links-grid">
                    <AnimatedQuickLink
                        href="/hackers"
                        label="Hackers"
                        Lazy={LazyUsersIcon}
                        fallback={<Users size={18} aria-hidden="true" />}
                    />
                    <AnimatedQuickLink
                        href="/arcade"
                        label="Arcade"
                        Lazy={LazyChessKnightIcon}
                        fallback={<ChessKnight size={18} aria-hidden="true" />}
                    />
                    <AnimatedQuickLink
                        href="/wiki"
                        label="Wiki"
                        Lazy={LazyBookTextIcon}
                        fallback={<BookOpen size={18} aria-hidden="true" />}
                    />
                </div>
            </section>

            {/* ── MEMBERS ───────────────────────────────────────────── */}
            <section className="dashboard-section">
                <h2 className="dashboard-h2">
                    // MEMBERS
                </h2>
                <div className="dashboard-links-grid">
                    <AnimatedQuickLink
                        href="/chat"
                        label="Chat"
                        Lazy={LazyMessageCircleIcon}
                        fallback={<MessageCircle size={18} aria-hidden="true" />}
                    />
                    <AnimatedQuickLink
                        href="/labs"
                        label="Labs"
                        Lazy={LazyFlaskIcon}
                        fallback={<FlaskConical size={18} aria-hidden="true" />}
                    />
                </div>
            </section>

            {/* ── YOUR DOMAINS ──────────────────────────────────────── */}
            <section className="dashboard-section">
                <div className="dashboard-section-header">
                    <h2 className="dashboard-h2">
                        // YOUR DOMAIN{topLevel.length !== 1 ? "S" : ""}
                    </h2>
                    <div className="dashboard-actions">
                        <PushSubscribeButton />
                        {onboardingStep === "push" && <PushHint />}
                        <button
                            onClick={() => void handleRefresh()}
                            className="btn btn-ghost btn-sm dashboard-refresh"
                            aria-label="Refresh subdomain list"
                            disabled={refreshing}
                            {...(refreshing ? {} : refreshTrigger.handlers)}
                        >
                            {refreshing ? (
                                <span className="dashboard-refresh-icon dashboard-refresh-icon--spinning">
                                    <RefreshCw size={14} aria-hidden="true" />
                                </span>
                            ) : (
                                <AnimatedIcon
                                    ref={refreshTrigger.iconRef}
                                    Lazy={LazyRefreshCwIcon}
                                    fallback={<RefreshCw size={14} aria-hidden="true" />}
                                    size={14}
                                />
                            )}
                            Refresh
                        </button>
                    </div>
                </div>

                {onboardingStep === "profile" && topLevel.length > 0 && <ProfileHint />}

                {loading ? (
                    <div className="dashboard-loading" role="status" aria-live="polite">
                        Loading…
                    </div>
                ) : (
                    <div
                        role="list"
                        aria-label="Your subdomains"
                        className={`dashboard-domains-grid${topLevel.length === 1 ? " dashboard-domains-grid--single" : ""}`}
                    >
                        {topLevel.map((d) => (
                            <div key={d.name} role="listitem" className="dashboard-domain-item">
                                <DomainTile domain={d} onMutate={refresh} />
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── RECENT ACTIVITY ───────────────────────────────────── */}
            <section className="dashboard-section">
                <div className="dashboard-activity-header">
                    <h2 className="dashboard-h2">
                        // RECENT ACTIVITY
                    </h2>
                    {totalDomains !== null && (
                        <span className="dashboard-claimed-count">
                            {totalDomains.toLocaleString()} claimed
                        </span>
                    )}
                </div>

                {activityLoading ? (
                    <p className="dashboard-activity-loading">loading…</p>
                ) : events.length === 0 ? (
                    <p className="dashboard-activity-empty">no activity yet</p>
                ) : (
                    <div role="list" className="activity-list">
                        {events.map((e) => (
                            <ActivityRow key={e.id} event={e} />
                        ))}
                    </div>
                )}
            </section>

        </div>
    );
}
