import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowUp } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";

const ATTR = "data-onboarding";
const TARGET = "connect-wallet";

/**
 * Portal-positioned bouncing arrow that floats below the ConnectWallet button.
 * Uses getBoundingClientRect for precise positioning; recalculates on scroll/resize.
 */
export default function ConnectHint() {
    const { step, ready, dismiss } = useOnboarding();
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const rafRef = useRef(0);

    const reposition = useCallback(() => {
        const el = document.querySelector(`[${ATTR}="${TARGET}"]`);
        if (!el) { setPos(null); return; }
        const r = el.getBoundingClientRect();
        setPos({ top: r.bottom + 6, left: r.left + r.width / 2, width: r.width });
    }, []);

    useEffect(() => {
        if (!ready || step !== "connect") return;
        reposition();

        const onUpdate = () => {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(reposition);
        };
        window.addEventListener("scroll", onUpdate, { passive: true });
        window.addEventListener("resize", onUpdate, { passive: true });
        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener("scroll", onUpdate);
            window.removeEventListener("resize", onUpdate);
        };
    }, [ready, step, reposition]);

    if (!ready || step !== "connect" || !pos) return null;

    return createPortal(
        <div
            className="onboarding-connect-portal"
            style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
            role="status"
            aria-live="polite"
            aria-label="Connect your wallet to get started"
        >
            <div className="onboarding-hint onboarding-connect-inner">
                <span className="onboarding-step-badge" aria-hidden="true">STEP 1</span>
                <button
                    className="onboarding-hint-dismiss"
                    onClick={() => dismiss("connect")}
                    aria-label="Dismiss connect wallet hint"
                    type="button"
                >
                    ×
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", paddingTop: "0.25rem" }}>
                    <ArrowUp className="onboarding-arrow onboarding-arrow-v" size={20} aria-hidden="true" />
                    <span className="onboarding-connect-label">Connect your wallet</span>
                </div>
            </div>
        </div>,
        document.body,
    );
}
