import type { ReactNode } from "react";
import { useOnboarding, STEP_NUMBER, type OnboardingStep } from "../../context/OnboardingContext";

interface OnboardingHintProps {
    /** Only render when the current step matches */
    step: OnboardingStep;
    children: ReactNode;
    /** If provided, renders a dismiss button */
    dismissible?: boolean;
    ariaLabel: string;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * Shared wrapper for inline onboarding hint banners.
 * Renders a fieldset-legend–style "STEP #" badge in the top-left,
 * an optional dismiss button top-right, and content below.
 */
export default function OnboardingHint({
    step,
    children,
    dismissible = false,
    ariaLabel,
    style,
    className,
}: OnboardingHintProps) {
    const { step: current, ready, dismiss } = useOnboarding();
    const num = STEP_NUMBER[step];

    if (!ready || current !== step) return null;

    return (
        <div
            className={`onboarding-hint${className ? ` ${className}` : ""}`}
            role="status"
            aria-live="polite"
            aria-label={ariaLabel}
            style={{ position: "relative", ...style }}
        >
            {num != null && (
                <span className="onboarding-step-badge" aria-hidden="true">
                    STEP {num}
                </span>
            )}
            {dismissible && (
                <button
                    className="onboarding-hint-dismiss"
                    onClick={() => dismiss(step)}
                    aria-label={`Dismiss ${ariaLabel}`}
                    type="button"
                >
                    ×
                </button>
            )}
            <div style={{ paddingTop: "0.25rem" }}>{children}</div>
        </div>
    );
}
