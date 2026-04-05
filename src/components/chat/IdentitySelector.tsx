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
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold tracking-wide"
                style={{
                    background: "var(--accent, #00ffc8)",
                    color: "var(--bg, #000)",
                    fontFamily: "var(--font-mono)",
                }}
            >
                {activeDomain}
            </span>
        );
    }

    return (
        <div className="relative inline-flex items-center">
            <select
                value={activeDomain}
                onChange={(e) => onSwitch(e.target.value)}
                className="appearance-none rounded border-0 pr-6 pl-2 py-0.5 text-xs font-bold tracking-wide cursor-pointer"
                style={{
                    background: "var(--accent, #00ffc8)",
                    color: "var(--bg, #000)",
                    fontFamily: "var(--font-mono)",
                }}
                aria-label="Select active domain"
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
            />
        </div>
    );
}
