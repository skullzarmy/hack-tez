import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";

const TARGET = "setup-profile";

/**
 * Portal-positioned bouncing arrow that floats near the "Set up your profile →"
 * button in ClaimedView. Same pattern as ConnectHint.
 */
export default function ProfileArrowHint() {
    const { step, ready, dismiss } = useOnboarding();
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const rafRef = useRef(0);

    const reposition = useCallback(() => {
        const el = document.querySelector(`[data-onboarding="${TARGET}"]`);
        if (!el) { setPos(null); return; }
        const r = el.getBoundingClientRect();
        setPos({ top: r.top + r.height / 2, left: r.right + 8 });
    }, []);

    useEffect(() => {
        if (!ready || step !== "profile") return;
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

    if (!ready || step !== "profile" || !pos) return null;

    return createPortal(
        <div
            className="onboarding-connect-portal"
            style={{ top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
            role="status"
            aria-live="polite"
            aria-label="Set up your profile"
        >
            <div className="onboarding-hint onboarding-connect-inner">
                <span className="onboarding-step-badge" aria-hidden="true">STEP 3</span>
                <button
                    className="onboarding-hint-dismiss"
                    onClick={() => dismiss("profile")}
                    aria-label="Dismiss profile hint"
                    type="button"
                >
                    ×
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", paddingTop: "0.25rem" }}>
                    <ArrowLeft className="onboarding-arrow onboarding-arrow-h" size={20} aria-hidden="true" />
                    <span className="onboarding-connect-label">Tell us what you hack on!</span>
                </div>
            </div>
        </div>,
        document.body,
    );
}
