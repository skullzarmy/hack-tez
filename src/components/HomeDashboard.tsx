/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useCallback, useMemo, type ReactNode } from "react";
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
import { useTezos } from "../context/TezosContext";
import { submitSetPrimary } from "../lib/contract";
import { waitForOperation } from "../lib/tzkt";
import { pickPrimary } from "../lib/domains";
import config from "../config/tezos";
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
        <li className="activity-row">
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
        </li>
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
    const { address, client } = useTezos();
    const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
    const [primaryError, setPrimaryError] = useState<string | null>(null);
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

    // Primary only means anything with more than one domain. With one, there
    // is nothing to choose between and the whole control stays hidden.
    const multi = topLevel.length > 1;
    const primaryName = useMemo(
        () => (address ? (pickPrimary(address, topLevel)?.name ?? null) : null),
        [address, topLevel],
    );

    // Primary first, then alphabetical — the identity you use leads the grid.
    const ordered = useMemo(() => {
        if (!multi) return topLevel;
        return [...topLevel].sort((a, b) => {
            if (a.name === primaryName) return -1;
            if (b.name === primaryName) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [topLevel, primaryName, multi]);

    const handleMakePrimary = useCallback(
        async (fullName: string) => {
            if (!client || !address) return;
            const suffix = `.hack.${config.tld}`;
            const label = fullName.replace(suffix, "");
            // Clear every other domain that currently carries a marker, so the
            // newest choice can't lose to the lexicographic tie-break.
            const clear = topLevel
                .filter((d) => d.name !== fullName && d.profile.primaryFor === address)
                .map((d) => d.name.replace(suffix, ""));

            setSettingPrimary(fullName);
            setPrimaryError(null);
            try {
                const hash = await submitSetPrimary(label, clear, client);
                const result = await waitForOperation(hash);
                if (result.status !== "applied") {
                    setPrimaryError(result.errorMessage ?? "Transaction failed on-chain");
                    return;
                }
                // Give TED GraphQL a moment to index the new data map.
                await new Promise((r) => setTimeout(r, 5000));
                await refresh();
            } catch (e) {
                setPrimaryError(e instanceof Error ? e.message : "Transaction failed");
            } finally {
                setSettingPrimary(null);
            }
        },
        [client, address, topLevel, refresh],
    );

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

                {primaryError && (
                    <div className="status-panel status-panel--err" role="alert">
                        {primaryError}
                    </div>
                )}

                {loading ? (
                    <div className="dashboard-loading" role="status" aria-live="polite">
                        Loading…
                    </div>
                ) : (
                    <ul
                        aria-label="Your subdomains"
                        className={`dashboard-domains-grid${topLevel.length === 1 ? " dashboard-domains-grid--single" : ""}`}
                        style={{ listStyle: "none", margin: 0, padding: 0 }}
                    >
                        {ordered.map((d) => (
                            <li key={d.name} className="dashboard-domain-item">
                                <DomainTile
                                    domain={d}
                                    onMutate={refresh}
                                    isPrimary={multi && d.name === primaryName}
                                    onMakePrimary={
                                        multi ? () => void handleMakePrimary(d.name) : undefined
                                    }
                                    settingPrimary={settingPrimary === d.name}
                                />
                            </li>
                        ))}
                    </ul>
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
                    <ul className="activity-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {events.map((e) => (
                            <ActivityRow key={e.id} event={e} />
                        ))}
                    </ul>
                )}
            </section>

        </div>
    );
}
