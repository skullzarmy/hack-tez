type Status = "active" | "pending" | "flagged" | "rejected" | "removed" | "draft" | "live";

const PALETTE: Record<Status, { fg: string; bg: string; label: string }> = {
    active: { fg: "#7eff9f", bg: "rgba(126,255,159,0.12)", label: "LIVE" },
    live: { fg: "#7eff9f", bg: "rgba(126,255,159,0.12)", label: "LIVE" },
    pending: { fg: "#ffe66d", bg: "rgba(255,230,109,0.12)", label: "PENDING" },
    flagged: { fg: "#ffb86b", bg: "rgba(255,184,107,0.14)", label: "FLAGGED" },
    rejected: { fg: "#ff6b6b", bg: "rgba(255,107,107,0.12)", label: "REJECTED" },
    removed: { fg: "#a0a0a0", bg: "rgba(160,160,160,0.12)", label: "REMOVED" },
    draft: { fg: "#aafff0", bg: "rgba(0,255,170,0.08)", label: "DRAFT" },
};

interface Props {
    status: string;
    children?: never;
    title?: string;
}

export default function StatusBadge({ status, title }: Props) {
    const key = (status?.toLowerCase() as Status) || "pending";
    const cfg = PALETTE[key] ?? { fg: "#aafff0", bg: "rgba(0,255,170,0.08)", label: status?.toUpperCase() || "?" };
    return (
        <span
            title={title}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: 1,
                color: cfg.fg,
                background: cfg.bg,
                border: `1px solid ${cfg.fg}40`,
                fontFamily: "ui-monospace,monospace",
                whiteSpace: "nowrap",
            }}
        >
            <span
                aria-hidden="true"
                style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.fg, boxShadow: `0 0 6px ${cfg.fg}` }}
            />
            {cfg.label}
        </span>
    );
}
