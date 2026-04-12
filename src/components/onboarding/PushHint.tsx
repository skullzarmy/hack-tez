import { useOnboarding } from "../../context/OnboardingContext";

/**
 * Callout label rendered near the PushSubscribeButton on Dashboard.
 * NOT dismissible — disappears only when push is actually subscribed.
 * The glow ring on PushSubscribeButton itself is applied via the `glowing` prop.
 */
export default function PushHint() {
    const { step, ready } = useOnboarding();

    if (!ready || step !== "push") return null;

    return (
        <div
            className="onboarding-hint"
            role="status"
            aria-live="polite"
            aria-label="Enable push notifications"
            style={{ position: "relative", padding: "0.6rem 0.75rem" }}
        >
            <span className="onboarding-step-badge" aria-hidden="true">STEP 4</span>
            <div
                style={{
                    paddingTop: "0.25rem",
                    fontSize: "0.7rem",
                    color: "var(--ok)",
                    letterSpacing: "0.04em",
                }}
            >
                🔔 Enable notifications on this device
            </div>
        </div>
    );
}
