import { useState, useRef, useEffect, useCallback, useId } from "react";
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
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const uid = useId();
    const listboxId = `${uid}-listbox`;
    const optionId = (i: number) => `${uid}-opt-${i}`;

    const selected = options.find((o) => o.value === value);
    const displayLabel = selected?.label ?? placeholder ?? "Select…";

    const closeAndFocus = useCallback(() => {
        setOpen(false);
        triggerRef.current?.focus();
    }, []);

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

    const openAt = useCallback(
        (idx: number) => {
            setOpen(true);
            setFocusIndex(idx >= 0 ? idx : 0);
        },
        [],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (disabled) return;
            const currentIdx = options.findIndex((o) => o.value === value);

            switch (e.key) {
                case "Enter":
                case " ":
                    e.preventDefault();
                    if (!open) {
                        openAt(currentIdx);
                    } else if (focusIndex >= 0) {
                        onChange(options[focusIndex].value);
                        closeAndFocus();
                    }
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    if (!open) {
                        openAt(currentIdx);
                    } else {
                        setFocusIndex((i) => Math.min(i + 1, options.length - 1));
                    }
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    if (!open) {
                        openAt(currentIdx);
                    } else {
                        setFocusIndex((i) => Math.max(i - 1, 0));
                    }
                    break;
                case "Home":
                    e.preventDefault();
                    if (open) setFocusIndex(0);
                    break;
                case "End":
                    e.preventDefault();
                    if (open) setFocusIndex(options.length - 1);
                    break;
                case "Escape":
                    e.preventDefault();
                    closeAndFocus();
                    break;
                case "Tab":
                    setOpen(false);
                    break;
            }
        },
        [disabled, open, focusIndex, options, value, onChange, openAt, closeAndFocus],
    );

    const handleSelect = useCallback(
        (val: string) => {
            onChange(val);
            closeAndFocus();
        },
        [onChange, closeAndFocus],
    );

    // Focus ring applied via outline — visible on :focus-visible via browser default,
    // but we also set an explicit outline for all-variant consistency.
    const focusRing: React.CSSProperties = {
        outline: "2px solid var(--accent, #00ffc8)",
        outlineOffset: "2px",
    };

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
                  minHeight: "44px",
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
                  minHeight: "44px",
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
        listStyle: "none",
        margin: "2px 0 0",
        padding: "4px 0",
    };

    const itemBase: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.45rem 0.65rem",
        minHeight: "36px",
        fontSize: variant === "accent" ? "0.7rem" : variant === "compact" ? "0.65rem" : "0.8rem",
        fontFamily: variant === "accent" ? "var(--font-mono)" : "var(--font)",
        cursor: "pointer",
        whiteSpace: "nowrap",
    };

    return (
        <div ref={containerRef} style={{ position: "relative", display: fullWidth ? "block" : "inline-block", width: fullWidth ? "100%" : undefined }}>
            {/* The focus-visible outline is injected via a <style> tag scoped by uid to avoid
                inline-style :focus-visible limitations. */}
            <style>{`#${CSS.escape(id ?? `${uid}-trigger`)}:focus-visible { outline: 2px solid var(--accent, #00ffc8); outline-offset: 2px; }`}</style>
            <button
                ref={triggerRef}
                type="button"
                id={id ?? `${uid}-trigger`}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={open ? listboxId : undefined}
                aria-activedescendant={open && focusIndex >= 0 ? optionId(focusIndex) : undefined}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => {
                    if (!disabled) {
                        if (!open) {
                            openAt(options.findIndex((o) => o.value === value));
                        } else {
                            setOpen(false);
                        }
                    }
                }}
                onKeyDown={handleKeyDown}
                style={{ ...triggerStyle, outline: "none" }}
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
                <ul ref={listRef} id={listboxId} role="listbox" aria-label={ariaLabel} style={dropdownStyle}>
                    {options.map((opt, i) => {
                        const isSelected = opt.value === value;
                        const isFocused = i === focusIndex;
                        return (
                            <li
                                key={opt.value}
                                id={optionId(i)}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => handleSelect(opt.value)}
                                onMouseEnter={() => setFocusIndex(i)}
                                style={{
                                    ...itemBase,
                                    background: isFocused ? "var(--bg-3, #222)" : "transparent",
                                    color: isSelected ? "var(--accent, #00ffc8)" : "var(--fg)",
                                    ...(isFocused ? focusRing : {}),
                                }}
                            >
                                <span>{opt.label}</span>
                                {isSelected && <Check size={12} style={{ flexShrink: 0, marginLeft: "0.5rem", color: "var(--accent, #00ffc8)" }} aria-hidden="true" />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
