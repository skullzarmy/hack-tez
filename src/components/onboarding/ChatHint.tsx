import { ArrowRight } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";

/**
 * Floating bottom toast inviting the user to join hackchat.
 * Persistent until dismissed — once dismissed, the tour is complete.
 */
export default function ChatHint() {
    const { step, ready, dismiss } = useOnboarding();

    if (!ready || step !== "chat") return null;

    return (
        <div className="onboarding-toast" role="status" aria-live="polite" aria-label="Join hackchat">
            <div
                className="onboarding-hint"
                style={{
                    position: "relative",
                    padding: "0.75rem 1rem",
                }}
            >
                <span className="onboarding-step-badge" aria-hidden="true">STEP 5</span>
                <button
                    className="onboarding-hint-dismiss"
                    onClick={() => dismiss("chat")}
                    aria-label="Dismiss chat invitation"
                    type="button"
                >
                    ×
                </button>
                <div style={{ paddingTop: "0.25rem" }}>
                    <span>
                        <strong style={{ color: "var(--ok)" }}>🎉 You're all set!</strong>{" "}
                        Come say hello in hackchat.
                    </span>
                    <div style={{ marginTop: "0.5rem" }}>
                        <a
                            href="/chat"
                            style={{ fontSize: "0.75rem", color: "var(--ok)", textDecoration: "underline", textUnderlineOffset: "2px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "0.35em" }}
                        >
                            Join hackchat <ArrowRight size={14} aria-hidden="true" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
