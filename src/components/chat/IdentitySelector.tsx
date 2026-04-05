import { ChevronDown } from "lucide-react";

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

    return (
        <div className="relative inline-flex items-center">
            <label className="sr-only" htmlFor="identity-selector">
                Active identity
            </label>
            <select
                id="identity-selector"
                value={activeDomain}
                onChange={(e) => onSwitch(e.target.value)}
                className="appearance-none border-0 text-[10px] font-bold uppercase tracking-widest cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 pr-6 pl-2"
                style={{
                    background: "var(--accent, #00ffc8)",
                    color: "var(--bg, #000)",
                    fontFamily: "var(--font-mono)",
                    minHeight: "44px",
                    outlineColor: "var(--bg, #000)",
                    letterSpacing: "0.12em",
                }}
            >
                {domains.map((d) => (
                    <option key={d} value={d}>
                        {d}
                    </option>
                ))}
            </select>
            <ChevronDown
                size={12}
                className="pointer-events-none absolute right-1"
                style={{ color: "var(--bg, #000)" }}
                aria-hidden="true"
            />
        </div>
    );
}
