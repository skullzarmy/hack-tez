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
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            onClick={(e) => {
                if (!dismissable) return;
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.78)",
                backdropFilter: "blur(2px)",
                WebkitBackdropFilter: "blur(2px)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                animation: "hackcadeFadeIn 120ms ease-out",
            }}
        >
            <style>{`
                @keyframes hackcadeFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes hackcadePop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
            `}</style>
            <div
                ref={cardRef}
                tabIndex={-1}
                style={{
                    width: "100%",
                    maxWidth: typeof width === "number" ? `${width}px` : width,
                    maxHeight: "90vh",
                    overflow: "auto",
                    background: "rgba(8, 14, 12, 0.96)",
                    border: "1px solid rgba(0,255,170,0.35)",
                    borderRadius: 8,
                    boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 24px rgba(0,255,170,0.08)",
                    color: "#aafff0",
                    fontFamily: "ui-monospace,monospace",
                    animation: "hackcadePop 140ms ease-out",
                    outline: "none",
                }}
            >
                {title && (
                    <div
                        style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid rgba(0,255,170,0.2)",
                            fontSize: 13,
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            color: "#aafff0",
                        }}
                    >
                        {title}
                    </div>
                )}
                <div style={{ padding: title ? 16 : 0 }}>{children}</div>
            </div>
        </div>,
        document.body
    );
}
