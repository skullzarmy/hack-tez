import { useState, useEffect, useCallback } from "react";
import {
    getPushPermissionState,
    isPushSubscribed,
    subscribeToPush,
    unsubscribeFromPush,
} from "../lib/pushSubscription";
import type { PushPermissionState } from "../lib/pushSubscription";
import { useTezos } from "../context/TezosContext";
import { Bell, BellOff, BellRing } from "lucide-react";

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
        if (!token) return;
        setLoading(true);
        try {
            if (subscribed) {
                const ok = await unsubscribeFromPush(token);
                if (ok) setSubscribed(false);
            } else {
                const ok = await subscribeToPush(token);
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

    if (permission === "unsupported") return null;

    if (permission === "denied") {
        return (
            <button
                className={className ?? "btn btn-ghost btn-sm"}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", opacity: 0.5, cursor: "not-allowed", fontSize: "0.7rem", ...style }}
                disabled
                title="Push notifications are blocked. Enable them in your browser settings."
            >
                <BellOff size={14} /> Notifications blocked
            </button>
        );
    }

    const Icon = subscribed ? BellRing : Bell;
    const label = subscribed ? "This device subscribed" : "Notify this device";
    const btnClass = className ?? "btn btn-ghost btn-sm";

    return (
        <button
            className={btnClass}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.7rem", opacity: loading ? 0.5 : 1, transition: "opacity 0.15s", ...style }}
            onClick={() => void handleToggle()}
            disabled={loading || !checked || !token}
            title={subscribed ? "Unsubscribe this device from push notifications" : "Get notified of DMs, mentions, and announcements on this device"}
        >
            <Icon size={14} /> {label}
        </button>
    );
}
