import type { ReactNode } from "react";

export interface TabDef {
    id: string;
    label: string;
    count?: number;
    badgeColor?: string;
    icon?: ReactNode;
    disabled?: boolean;
    title?: string;
}

interface TabsProps {
    tabs: TabDef[];
    active: string;
    onChange: (id: string) => void;
    size?: "sm" | "md";
}

export default function Tabs({ tabs, active, onChange, size = "md" }: TabsProps) {
    return (
        <div
            role="tablist"
            style={{
                display: "flex",
                gap: 2,
                flexWrap: "wrap",
                padding: 4,
                borderRadius: 8,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(0,255,170,0.18)",
            }}
        >
            {tabs.map((t) => {
                const isActive = t.id === active;
                const padY = size === "sm" ? 4 : 6;
                const padX = size === "sm" ? 10 : 14;
                return (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={isActive}
                        title={t.title}
                        disabled={t.disabled}
                        onClick={() => !t.disabled && onChange(t.id)}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: `${padY}px ${padX}px`,
                            border: "none",
                            borderRadius: 6,
                            background: isActive ? "rgba(0,255,170,0.14)" : "transparent",
                            color: isActive ? "#7eff9f" : t.disabled ? "rgba(170,255,240,0.3)" : "#aafff0",
                            fontFamily: "ui-monospace,monospace",
                            fontSize: size === "sm" ? 11 : 12,
                            letterSpacing: 0.5,
                            cursor: t.disabled ? "not-allowed" : "pointer",
                            textTransform: "uppercase",
                            transition: "background 120ms",
                        }}
                    >
                        {t.icon}
                        <span>{t.label}</span>
                        {typeof t.count === "number" && t.count > 0 && (
                            <span
                                style={{
                                    minWidth: 18,
                                    padding: "0 5px",
                                    height: 16,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 999,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: t.badgeColor ?? (isActive ? "#7eff9f" : "rgba(255,230,109,0.85)"),
                                    color: "#0a0f0d",
                                }}
                            >
                                {t.count > 99 ? "99+" : t.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
