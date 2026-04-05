import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps {
    options: readonly SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    id?: string;
    /** Compact variant for tight spaces (chat header, etc.) */
    variant?: "default" | "compact" | "accent";
    /** Full width */
    fullWidth?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
}

export default function Select({
    options,
    value,
    onChange,
    placeholder,
    id,
    variant = "default",
    fullWidth = false,
    disabled = false,
    "aria-label": ariaLabel,
}: SelectProps) {
    const [open, setOpen] = useState(false);
    const [focusIndex, setFocusIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = options.find((o) => o.value === value);
    const displayLabel = selected?.label ?? placeholder ?? "Select…";

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    // Scroll focused item into view
    useEffect(() => {
        if (!open || focusIndex < 0) return;
        const items = listRef.current?.children;
        if (items?.[focusIndex]) {
            (items[focusIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
        }
    }, [focusIndex, open]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (disabled) return;

            switch (e.key) {
                case "Enter":
                case " ":
                    e.preventDefault();
                    if (!open) {
                        setOpen(true);
                        setFocusIndex(options.findIndex((o) => o.value === value));
                    } else if (focusIndex >= 0) {
                        onChange(options[focusIndex].value);
                        setOpen(false);
                    }
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    if (!open) {
                        setOpen(true);
                        setFocusIndex(options.findIndex((o) => o.value === value));
                    } else {
                        setFocusIndex((i) => Math.min(i + 1, options.length - 1));
                    }
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    if (open) {
                        setFocusIndex((i) => Math.max(i - 1, 0));
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    setOpen(false);
                    break;
                case "Tab":
                    setOpen(false);
                    break;
            }
        },
        [disabled, open, focusIndex, options, value, onChange],
    );

    const handleSelect = useCallback(
        (val: string) => {
            onChange(val);
            setOpen(false);
        },
        [onChange],
    );

    const triggerStyle: React.CSSProperties =
        variant === "accent"
            ? {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  border: "none",
                  cursor: disabled ? "default" : "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  background: "var(--accent, #00ffc8)",
                  color: "var(--bg, #000)",
                  padding: "0.35rem 0.5rem",
                  minHeight: "28px",
                  whiteSpace: "nowrap",
              }
            : {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: fullWidth ? "100%" : undefined,
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  padding: variant === "compact" ? "0.35rem 0.5rem" : "0.5rem 0.65rem",
                  color: selected ? "var(--fg)" : "var(--fg-3)",
                  fontFamily: "var(--font)",
                  fontSize: variant === "compact" ? "0.65rem" : "0.8rem",
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  boxSizing: "border-box",
                  whiteSpace: "nowrap",
              };

    const dropdownStyle: React.CSSProperties = {
        position: "absolute",
        top: "100%",
        left: 0,
        right: variant === "accent" ? undefined : 0,
        minWidth: variant === "accent" ? "180px" : undefined,
        zIndex: 999,
        marginTop: "2px",
        background: "var(--bg-2, #111)",
        border: "1px solid var(--border, #333)",
        borderRadius: "4px",
        maxHeight: "200px",
        overflowY: "auto",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    };

    const itemBase: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: variant === "compact" ? "0.35rem 0.5rem" : "0.45rem 0.65rem",
        fontSize: variant === "accent" ? "0.7rem" : variant === "compact" ? "0.65rem" : "0.8rem",
        fontFamily: variant === "accent" ? "var(--font-mono)" : "var(--font)",
        cursor: "pointer",
        whiteSpace: "nowrap",
    };

    return (
        <div ref={containerRef} style={{ position: "relative", display: fullWidth ? "block" : "inline-block", width: fullWidth ? "100%" : undefined }}>
            <button
                type="button"
                id={id}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => {
                    if (!disabled) {
                        setOpen((o) => !o);
                        if (!open) setFocusIndex(options.findIndex((o) => o.value === value));
                    }
                }}
                onKeyDown={handleKeyDown}
                style={triggerStyle}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{displayLabel}</span>
                <ChevronDown
                    size={variant === "accent" ? 10 : 12}
                    style={{
                        flexShrink: 0,
                        marginLeft: "0.25rem",
                        transition: "transform 150ms",
                        transform: open ? "rotate(180deg)" : "none",
                        color: variant === "accent" ? "var(--bg, #000)" : "var(--fg-3)",
                    }}
                    aria-hidden="true"
                />
            </button>

            {open && (
                <ul ref={listRef} role="listbox" style={dropdownStyle}>
                    {options.map((opt, i) => {
                        const isSelected = opt.value === value;
                        const isFocused = i === focusIndex;
                        return (
                            <li
                                key={opt.value}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => handleSelect(opt.value)}
                                onMouseEnter={() => setFocusIndex(i)}
                                style={{
                                    ...itemBase,
                                    background: isFocused ? "var(--bg-3, #222)" : "transparent",
                                    color: isSelected ? "var(--accent, #00ffc8)" : "var(--fg)",
                                }}
                            >
                                <span>{opt.label}</span>
                                {isSelected && <Check size={12} style={{ flexShrink: 0, marginLeft: "0.5rem", color: "var(--accent, #00ffc8)" }} />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
