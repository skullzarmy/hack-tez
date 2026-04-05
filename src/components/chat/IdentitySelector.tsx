import Select from "../ui/Select";

interface IdentitySelectorProps {
    domains: string[];
    activeDomain: string;
    onSwitch: (domain: string) => void;
}

/** Strip the parent domain (hack.gho, hack.tez) to show just the label(s) */
function shortLabel(domain: string): string {
    return domain.replace(/\.hack\.\w+$/, "");
}

export default function IdentitySelector({ domains, activeDomain, onSwitch }: IdentitySelectorProps) {
    if (domains.length <= 1) {
        return (
            <span
                className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 gap-1"
                style={{
                    background: "var(--accent, #00ffc8)",
                    color: "var(--bg, #000)",
                    fontFamily: "var(--font-mono)",
                    minHeight: "28px",
                    letterSpacing: "0.12em",
                    maxWidth: "120px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
                title={activeDomain}
                aria-label={`Active identity: ${activeDomain}`}
            >
                {shortLabel(activeDomain)}
            </span>
        );
    }

    const options = domains.map((d) => ({ value: d, label: shortLabel(d) }));

    return (
        <Select
            options={options}
            value={activeDomain}
            onChange={onSwitch}
            variant="accent"
            id="identity-selector"
            aria-label="Active identity"
        />
    );
}
