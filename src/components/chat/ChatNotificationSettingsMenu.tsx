import { Settings2, Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Switch } from "../ui/switch";
import type { ChatNotificationSettings } from "../../lib/chatNotifications";
import { useState, useEffect, useCallback } from "react";
import {
    getPushPermissionState,
    isPushSubscribed,
    subscribeToPush,
    unsubscribeFromPush,
    updatePushPreferences,
} from "../../lib/pushSubscription";
import type { PushPreferences, PushPermissionState } from "../../lib/pushSubscription";
import { useTezos } from "../../context/TezosContext";

interface ChatNotificationSettingsMenuProps {
    settings: ChatNotificationSettings;
    isGlobalChannelMuted: boolean;
    isActiveDMMuted: boolean;
    hasActiveDM: boolean;
    onToggleGlobalEnabled: () => void;
    onToggleMuteForegroundConversation: () => void;
    onToggleMuteNewDMs: () => void;
    onToggleMuteGlobalChannel: () => void;
    onToggleMuteActiveDM: () => void;
}

interface SettingRowProps {
    id: string;
    title: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
}

function SettingRow({ id, title, description, checked, onCheckedChange, disabled = false }: SettingRowProps) {
    return (
        <div
            className="flex items-start justify-between gap-3 px-2 py-2"
            style={{
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <label htmlFor={id} className="flex-1 min-w-0" style={{ cursor: disabled ? "default" : "pointer" }}>
                <div
                    className="text-[11px] font-bold uppercase tracking-widest"
                    style={{
                        color: "var(--fg, #eee)",
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.1em",
                        lineHeight: 1.2,
                    }}
                >
                    {title}
                </div>
                <div
                    className="text-[10px] mt-1"
                    style={{
                        color: "var(--fg-3, #888)",
                        fontFamily: "var(--font-mono)",
                        lineHeight: 1.35,
                    }}
                >
                    {description}
                </div>
            </label>
            <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={onCheckedChange}
                aria-label={title}
            />
        </div>
    );
}

export default function ChatNotificationSettingsMenu({
    settings,
    isGlobalChannelMuted,
    isActiveDMMuted,
    hasActiveDM,
    onToggleGlobalEnabled,
    onToggleMuteForegroundConversation,
    onToggleMuteNewDMs,
    onToggleMuteGlobalChannel,
    onToggleMuteActiveDM,
}: ChatNotificationSettingsMenuProps) {
    const { token } = useTezos();
    const [pushPermission, setPushPermission] = useState<PushPermissionState>(getPushPermissionState);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushPrefs, setPushPrefs] = useState<PushPreferences | null>(null);
    const [pushLoading, setPushLoading] = useState(false);
    const [deviceCount, setDeviceCount] = useState(0);
    const authToken = token ?? "";

    // Load push state on mount
    useEffect(() => {
        if (!authToken) return;
        let cancelled = false;
        async function load() {
            const { hackchatUrl } = await import("../../config/tezos");
            const { authedFetch } = await import("../../lib/authedFetch");
            const [subscribed, prefsRes] = await Promise.all([
                isPushSubscribed(),
                authedFetch(`${hackchatUrl}/push/preferences`).then(async (res) => {
                    if (!res.ok) return { preferences: null, deviceCount: 0 };
                    const data = await res.json();
                    return { preferences: data.preferences ?? null, deviceCount: data.deviceCount ?? 0 };
                }).catch(() => ({ preferences: null, deviceCount: 0 })),
            ]);
            if (cancelled) return;
            setPushSubscribed(subscribed);
            if (prefsRes.preferences) setPushPrefs(prefsRes.preferences);
            setDeviceCount(prefsRes.deviceCount);
        }
        void load();

        return () => { cancelled = true; };
    }, [authToken]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: authToken re-runs load() when the session changes; it is read inside load, not in the effect body
    const handleTogglePush = useCallback(async () => {
        setPushLoading(true);
        try {
            if (pushSubscribed) {
                const ok = await unsubscribeFromPush();
                if (ok) {
                    setPushSubscribed(false);
                    setDeviceCount((c) => Math.max(0, c - 1));
                }
            } else {
                const ok = await subscribeToPush();
                if (ok) {
                    setPushSubscribed(true);
                    setPushPermission("granted");
                    setDeviceCount((c) => c + 1);
                } else {
                    setPushPermission(getPushPermissionState());
                }
            }
        } finally {
            setPushLoading(false);
        }
    }, [pushSubscribed, authToken]);

    const handleTogglePushPref = useCallback(async (key: keyof PushPreferences, value: boolean) => {
        if (!pushPrefs) return;
        const updated = { ...pushPrefs, [key]: value };
        setPushPrefs(updated);
        await updatePushPreferences({ [key]: value });
    }, [pushPrefs]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                        width: "44px",
                        height: "44px",
                        border: "none",
                        background: "transparent",
                        color: "var(--fg-2, rgba(255,255,255,0.75))",
                        cursor: "pointer",
                        outlineColor: "var(--accent)",
                    }}
                    aria-label="Chat notification settings"
                    title="Chat notification settings"
                >
                    <Settings2 size={16} aria-hidden="true" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                side="bottom"
                avoidCollisions
                collisionPadding={8}
                style={{ maxHeight: "var(--radix-dropdown-menu-content-available-height, calc(100dvh - 80px))", overflowY: "auto" }}
            >
                <div className="px-2 pt-1 pb-2">
                    <div
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{
                            color: "var(--fg, #eee)",
                            fontFamily: "var(--font-mono)",
                            letterSpacing: "0.15em",
                        }}
                    >
                        Notifications
                    </div>
                    <div
                        className="text-[10px] mt-1"
                        style={{
                            color: "var(--fg-3, #888)",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        Mute rules for global and DM chat.
                    </div>
                </div>

                <SettingRow
                    id="chat-notif-enabled"
                    title="Enable Chat Sounds"
                    description="Master switch for all incoming message sounds."
                    checked={settings.globalEnabled}
                    onCheckedChange={() => onToggleGlobalEnabled()}
                />

                <DropdownMenuSeparator />

                <SettingRow
                    id="chat-notif-mute-foreground"
                    title="Mute Foreground Conversation"
                    description="Silence sounds when you are already viewing the active room or DM."
                    checked={settings.muteForegroundConversation}
                    onCheckedChange={() => onToggleMuteForegroundConversation()}
                    disabled={!settings.globalEnabled}
                />

                <SettingRow
                    id="chat-notif-mute-new-dm"
                    title="Mute New DMs"
                    description="Silence sounds for DMs that are not yet in your conversation list."
                    checked={settings.muteNewDMs}
                    onCheckedChange={() => onToggleMuteNewDMs()}
                    disabled={!settings.globalEnabled}
                />

                <DropdownMenuSeparator />

                <SettingRow
                    id="chat-notif-mute-global"
                    title="Mute Global Channel"
                    description="Silence sounds from the global chat room."
                    checked={isGlobalChannelMuted}
                    onCheckedChange={() => onToggleMuteGlobalChannel()}
                />

                <SettingRow
                    id="chat-notif-mute-active-dm"
                    title="Mute Active DM"
                    description={
                        hasActiveDM
                            ? "Silence sounds from the currently open DM conversation."
                            : "Open a DM conversation to enable this control."
                    }
                    checked={isActiveDMMuted}
                    onCheckedChange={() => onToggleMuteActiveDM()}
                    disabled={!hasActiveDM}
                />

                <DropdownMenuSeparator />

                {/* Push notifications section */}
                <div className="px-2 pt-1 pb-2">
                    <div
                        className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                        style={{
                            color: "var(--fg, #eee)",
                            fontFamily: "var(--font-mono)",
                            letterSpacing: "0.15em",
                        }}
                    >
                        <Bell size={10} aria-hidden="true" />
                        Push Notifications
                    </div>
                    <div
                        className="text-[10px] mt-1"
                        style={{
                            color: "var(--fg-3, #888)",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        {pushPermission === "unsupported"
                            ? "Not supported in this browser."
                            : pushPermission === "denied"
                              ? "Blocked by browser. Enable in browser settings."
                              : pushSubscribed
                                ? `Active on ${deviceCount} device${deviceCount !== 1 ? "s" : ""}.`
                                : "Get notified of DMs and mentions when away."}
                    </div>
                </div>

                <SettingRow
                    id="chat-push-enabled"
                    title={pushLoading ? "Subscribing…" : pushSubscribed ? "Push Enabled" : "Enable Push"}
                    description={
                        pushPermission === "denied"
                            ? "Push is blocked. Check your browser notification settings."
                            : pushSubscribed
                              ? "Receive push notifications on this device."
                              : "Subscribe to push notifications on this device."
                    }
                    checked={pushSubscribed}
                    onCheckedChange={() => void handleTogglePush()}
                    disabled={pushPermission === "unsupported" || pushPermission === "denied" || pushLoading}
                />

                {pushSubscribed && pushPrefs && (
                    <>
                        <SettingRow
                            id="chat-push-dms"
                            title="Push for DMs"
                            description="Notify when you receive a direct message."
                            checked={pushPrefs.pushDms}
                            onCheckedChange={(v) => void handleTogglePushPref("pushDms", v)}
                        />
                        <SettingRow
                            id="chat-push-mentions"
                            title="Push for @Mentions"
                            description="Notify when someone mentions you in global chat."
                            checked={pushPrefs.pushMentions}
                            onCheckedChange={(v) => void handleTogglePushPref("pushMentions", v)}
                        />
                        <SettingRow
                            id="chat-push-broadcasts"
                            title="Push for Broadcasts"
                            description="Notify for admin announcements."
                            checked={pushPrefs.pushBroadcasts}
                            onCheckedChange={(v) => void handleTogglePushPref("pushBroadcasts", v)}
                        />
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
