import { useState, useEffect, useCallback } from "react";
import {
    getPushPermissionState,
    isPushSubscribed,
    subscribeToPush,
    unsubscribeFromPush,
} from "../lib/pushSubscription";
import type { PushPermissionState } from "../lib/pushSubscription";
import { useTezos } from "../context/TezosContext";

interface PushSubscribeButtonProps {
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Standalone push notification subscribe/unsubscribe button.
 * Reads JWT from TezosContext for server sync.
 */
export default function PushSubscribeButton({ className, style }: PushSubscribeButtonProps) {
    const { token } = useTezos();
    const [permission, setPermission] = useState<PushPermissionState>(getPushPermissionState);
    const [subscribed, setSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let cancelled = false;
        isPushSubscribed().then((v) => {
            if (!cancelled) {
                setSubscribed(v);
                setChecked(true);
            }
        });
        return () => { cancelled = true; };
    }, []);

    const handleToggle = useCallback(async () => {
        setLoading(true);
        try {
            if (subscribed) {
                const ok = await unsubscribeFromPush(token ?? "");
                if (ok) setSubscribed(false);
            } else {
                const ok = await subscribeToPush(token ?? "");
                if (ok) {
                    setSubscribed(true);
                    setPermission("granted");
                } else {
                    setPermission(getPushPermissionState());
                }
            }
        } finally {
            setLoading(false);
        }
    }, [subscribed, token]);

    if (!checked || permission === "unsupported") return null;

    if (permission === "denied") {
        return (
            <button
                className={className ?? "btn btn-ghost btn-sm"}
                style={{ opacity: 0.5, cursor: "not-allowed", fontSize: "0.7rem", ...style }}
                disabled
                title="Push notifications are blocked. Enable them in your browser settings."
            >
                🔕 Notifications blocked
            </button>
        );
    }

    return (
        <button
            className={className ?? "btn btn-ghost btn-sm"}
            style={{ fontSize: "0.7rem", ...style }}
            onClick={() => void handleToggle()}
            disabled={loading}
            title={subscribed ? "Unsubscribe from push notifications" : "Get notified of DMs, mentions, and announcements"}
        >
            {loading ? "…" : subscribed ? "🔔 Notifications on" : "🔔 Enable notifications"}
        </button>
    );
}
