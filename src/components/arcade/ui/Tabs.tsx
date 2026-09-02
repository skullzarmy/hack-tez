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
    const sizeClass = size === "sm" ? "arcade-tab--sm" : "arcade-tab--md";
    return (
        <div role="tablist" className="arcade-tablist">
            {tabs.map((t) => {
                const isActive = t.id === active;
                return (
                    <button type="button"
                        key={t.id}
                        role="tab"
                        aria-selected={isActive}
                        title={t.title}
                        disabled={t.disabled}
                        onClick={() => !t.disabled && onChange(t.id)}
                        className={`arcade-tab ${sizeClass}${isActive ? " arcade-tab--active" : ""}`}
                    >
                        {t.icon}
                        <span>{t.label}</span>
                        {typeof t.count === "number" && t.count > 0 && (
                            <span className="arcade-tab__badge">
                                {t.count > 99 ? "99+" : t.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
