import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    width?: number | string;
    dismissable?: boolean;
    labelledBy?: string;
    title?: string;
}

export default function Modal({
    open,
    onClose,
    children,
    width = 480,
    dismissable = true,
    labelledBy,
    title,
}: ModalProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const lastFocus = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        lastFocus.current = document.activeElement as HTMLElement | null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKey = (e: KeyboardEvent) => {
            if (!dismissable) return;
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);

        const t = window.setTimeout(() => {
            const card = cardRef.current;
            if (!card) return;
            const focusables = card.querySelectorAll<HTMLElement>(
                'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
            );
            const first = Array.from(focusables).find((el) => !el.hasAttribute("disabled"));
            (first ?? card).focus();
        }, 0);

        return () => {
            window.removeEventListener("keydown", onKey);
            window.clearTimeout(t);
            document.body.style.overflow = prevOverflow;
            const prev = lastFocus.current;
            if (prev && typeof prev.focus === "function") {
                try {
                    prev.focus();
                } catch {
                    /* ignore */
                }
            }
        };
    }, [open, dismissable, onClose]);

    if (!open) return null;
    if (typeof document === "undefined") return null;

    return createPortal(
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes this modal; the overlay click is a redundant mouse affordance
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            onClick={(e) => {
                if (!dismissable) return;
                if (e.target === e.currentTarget) onClose();
            }}
            className="arcade-modal-overlay"
        >
            <div
                ref={cardRef}
                tabIndex={-1}
                className="arcade-modal-body"
                style={{ maxWidth: typeof width === "number" ? `${width}px` : width }}
            >
                {title && (
                    <div className="arcade-modal-title">{title}</div>
                )}
                <div style={{ padding: title ? 16 : 0 }}>{children}</div>
            </div>
        </div>,
        document.body
    );
}
