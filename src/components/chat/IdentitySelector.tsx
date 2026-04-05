import Select from "../ui/Select";

interface IdentitySelectorProps {
    domains: string[];
    activeDomain: string;
    onSwitch: (domain: string) => void;
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
                }}
                aria-label={`Active identity: ${activeDomain}`}
            >
                {activeDomain}
            </span>
        );
    }

    const options = domains.map((d) => ({ value: d, label: d }));

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
