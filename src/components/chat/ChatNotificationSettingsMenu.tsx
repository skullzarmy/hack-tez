import { Settings2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Switch } from "../ui/switch";
import type { ChatNotificationSettings } from "../../lib/chatNotifications";

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

function SettingRow({
    id,
    title,
    description,
    checked,
    onCheckedChange,
    disabled = false,
}: SettingRowProps) {
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
                        outlineColor: "var(--accent, #00ffc8)",
                    }}
                    aria-label="Chat notification settings"
                    title="Chat notification settings"
                >
                    <Settings2 size={16} aria-hidden="true" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
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
            </DropdownMenuContent>
        </DropdownMenu>
    );
}