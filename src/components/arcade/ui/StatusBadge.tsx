type Status = "active" | "pending" | "flagged" | "rejected" | "removed" | "draft" | "live";

const STATUS_CLASS: Record<Status, string> = {
    active: "arcade-badge--live",
    live: "arcade-badge--live",
    pending: "arcade-badge--pending",
    flagged: "arcade-badge--flagged",
    rejected: "arcade-badge--rejected",
    removed: "arcade-badge--removed",
    draft: "arcade-badge--draft",
};

const STATUS_LABEL: Record<Status, string> = {
    active: "LIVE",
    live: "LIVE",
    pending: "PENDING",
    flagged: "FLAGGED",
    rejected: "REJECTED",
    removed: "REMOVED",
    draft: "DRAFT",
};

interface Props {
    status: string;
    children?: never;
    title?: string;
}

export default function StatusBadge({ status, title }: Props) {
    const key = (status?.toLowerCase() as Status) || "pending";
    const modifierClass = STATUS_CLASS[key] ?? "arcade-badge--draft";
    const label = STATUS_LABEL[key] ?? status?.toUpperCase() ?? "?";
    return (
        <span title={title} className={`arcade-badge ${modifierClass}`}>
            <span aria-hidden="true" className="arcade-badge__dot" />
            {label}
        </span>
    );
}
