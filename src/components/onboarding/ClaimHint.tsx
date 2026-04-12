import OnboardingHint from "./OnboardingHint";

/**
 * Neon callout text rendered above the search area on the Home page.
 * The actual neon glow border on .search-wrap is applied via className
 * in Home.tsx — this component just renders the callout label.
 */
export default function ClaimHint() {
    return (
        <div className="onboarding-claim-callout" role="status" aria-live="polite">
            <span className="onboarding-step-badge" aria-hidden="true" style={{ left: "0.5rem" }}>STEP 2</span>
            ⚡ Claim your name — it's free, only gas!
        </div>
    );
}

/**
 * Inline banner variant for use on pages other than Home.
 */
export function ClaimHintBanner() {
    return (
        <OnboardingHint step="claim" dismissible ariaLabel="Claim your hack.tez domain" style={{ padding: "0.75rem 1rem", marginBottom: "1rem" }}>
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
                <strong style={{ color: "var(--ok)" }}>⚡ Ready to claim?</strong>{" "}
                Head to the <a href="/" style={{ color: "var(--ok)", textDecoration: "underline" }}>home page</a> to register your hack.tez name.
            </p>
        </OnboardingHint>
    );
}
