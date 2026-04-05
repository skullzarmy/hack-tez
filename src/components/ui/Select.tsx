import { useState, useRef, useEffect, useCallback, useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
    variant?: "default" | "compact" | "accent";
    fullWidth?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
}

interface DropdownPos {
    top: number;
    left: number;
    width: number;
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
    const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0, width: 0 });
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

    // Position the dropdown relative to the trigger
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setPos({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
        });
    }, [open]);

    // Reposition on scroll/resize while open
    useEffect(() => {
        if (!open) return;
        function reposition() {
            if (!triggerRef.current) return;
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        }
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
        return () => {
            window.removeEventListener("scroll", reposition, true);
            window.removeEventListener("resize", reposition);
        };
    }, [open]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (listRef.current?.contains(target)) return;
            setOpen(false);
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

    const openAt = useCallback((idx: number) => {
        setOpen(true);
        setFocusIndex(idx >= 0 ? idx : 0);
    }, []);

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

    const focusRing: React.CSSProperties = {
        boxShadow: "inset 0 0 0 2px var(--accent, #00ffc8)",
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

    const dropdownMinWidth = variant === "accent" ? 180 : pos.width;

    const dropdownStyle: React.CSSProperties = {
        position: "absolute",
        top: pos.top + 2,
        left: pos.left,
        minWidth: dropdownMinWidth,
        zIndex: 9999,
        background: "var(--bg-2, #111)",
        border: "1px solid var(--border, #333)",
        borderRadius: "4px",
        maxHeight: "200px",
        overflow: "hidden auto",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        listStyle: "none",
        margin: 0,
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

    const triggerId = id ?? `${uid}-trigger`;

    const dropdown =
        open &&
        createPortal(
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
            </ul>,
            document.body,
        );

    return (
        <div style={{ display: fullWidth ? "block" : "inline-block", width: fullWidth ? "100%" : undefined }}>
            <style>{`#${CSS.escape(triggerId)}:focus-visible { outline: 2px solid var(--accent, #00ffc8); outline-offset: 2px; }`}</style>
            <button
                ref={triggerRef}
                type="button"
                id={triggerId}
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
            {dropdown}
        </div>
    );
}
