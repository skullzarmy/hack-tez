/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useCallback, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
    MessageCircle,
    Users,
    BookOpen,
    Code,
    FileText,
} from "lucide-react";
import { useTezos } from "../context/TezosContext";
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

function QuickLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
    return (
        <Link to={href} className="dashboard-quick-link">
            {icon}
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
    const { activeDomain } = useTezos();
    const { step: onboardingStep } = useOnboarding();
    const { events, isLoading: activityLoading } = useRecentActivity();
    const totalDomains = useDomainCount();
    const [refreshing, setRefreshing] = useState(false);

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
                    <QuickLink href="/hackers" icon={<Users size={18} />} label="Hackers" />
                    <QuickLink href="/skills" icon={<BookOpen size={18} />} label="Skills" />
                    <QuickLink href="/developers" icon={<Code size={18} />} label="Developers" />
                    <QuickLink href="/manifesto" icon={<FileText size={18} />} label="Manifesto" />
                </div>
            </section>

            {/* ── HACKCHAT ──────────────────────────────────────────── */}
            {activeDomain && (
                <section className="dashboard-section">
                    <Link to="/chat" className="dashboard-chat-card">
                        <div className="dashboard-chat-glow" aria-hidden="true" />
                        <MessageCircle size={28} className="dashboard-chat-icon" />
                        <div className="dashboard-chat-body">
                            <div className="dashboard-chat-title">hackchat</div>
                            <div className="dashboard-chat-subtitle">talk to the community</div>
                        </div>
                        <span className="dashboard-chat-cta">Enter →</span>
                    </Link>
                </section>
            )}

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
                        >
                            <span className={`dashboard-refresh-icon${refreshing ? " dashboard-refresh-icon--spinning" : ""}`}>
                                ↻
                            </span>{" "}
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
