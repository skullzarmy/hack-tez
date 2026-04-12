import OnboardingHint from "./OnboardingHint";

/**
 * Banner nudging the user to set up their hacker profile.
 * Rendered on Dashboard when profile data is empty.
 */
export default function ProfileHint() {
    return (
        <OnboardingHint step="profile" dismissible ariaLabel="Set up your hacker profile" style={{ marginBottom: "1rem" }}>
            <p style={{ margin: 0, fontSize: "0.8rem" }}>
                <strong style={{ color: "var(--ok)" }}>🛠 Set up your profile.</strong>{" "}
                Add your bio, skills, and projects to stand out.
            </p>
        </OnboardingHint>
    );
}
