export default function Manifesto() {
    return (
        <div className="container" style={{ maxWidth: "680px", paddingBlock: "4rem 6rem" }}>

            <p className="section-label" style={{ marginBottom: "2rem" }}>manifesto</p>

            <h1 style={{
                fontFamily: "var(--font)",
                fontSize: "clamp(2rem, 6vw, 3.5rem)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                lineHeight: 1.1,
                marginBottom: "3rem",
                color: "var(--fg)",
            }}>
                Something<br />new is here.
            </h1>

            <div style={{
                fontFamily: "var(--font)",
                fontSize: "0.85rem",
                lineHeight: 2,
                color: "var(--fg-2)",
                fontWeight: 700,
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
            }}>
                <p>Not a platform. Not a product roadmap. Not a team with a vision statement and a runway and a plan to exit. Something older than that. Something that predates the idea that you need permission or funding or a market to justify making a thing.</p>

                <p style={{ color: "var(--fg)", fontWeight: 700 }}>This is what happens when builders build for builders because building is the point.</p>

                <p>You want to know what this looks like? No doors. No walls. No membership fee, no credential check, no inner circle that knows the real plan. Just a roof, floating, held up by nothing except the shared understanding that the work matters and the knowledge belongs to everyone and the chain is a commons not a commodity.</p>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

                <p style={{ color: "var(--fg)", fontSize: "1rem", fontWeight: 700, letterSpacing: "0.04em" }}>
                    Tezos gave us a protocol that doesn't need gatekeepers.<br />
                    We added gatekeepers anyway.
                </p>

                <p>Bakers consolidated. Marketplaces centralized. Infrastructure calcified around whoever got there first. The ecosystem didn't die from outside pressure. It narrowed from inside, slowly, because centralization is always easier than the alternative and profit is a cleaner motive than freedom.</p>

                <p style={{ color: "var(--ok)", fontWeight: 700, letterSpacing: "0.06em" }}>We are the alternative.</p>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

                <p>Everything here is unlicensed. The code, the contracts, the ideas. Take them. The subdomain you claim is a name in a space we tend but do not own in any way that matters. It is a place at the table. A way to be found by the people who are looking for someone like you.</p>

                <p>Claim your name. Not as property. <strong style={{ color: "var(--fg)" }}>As a signal.</strong> A badge you choose to wear that says you were here, you built here, you are findable to the people who are looking for exactly you. We have plans for what this becomes. But they are not the whole picture. They never could be. This becomes what we make it, all of us, and we are just keeping the lights on and the door off its hinges.</p>

                <p>Find the people building under the same roof. Make something that doesn't need to extract from the people who use it to justify its existence.</p>

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

                <p style={{ color: "var(--fg)", fontWeight: 700, fontSize: "1rem" }}>
                    That's the whole thing.<br />
                    That's always been the whole thing.
                </p>

                <p style={{ color: "var(--fg-3)", fontSize: "0.75rem", letterSpacing: "0.1em", marginTop: "1rem" }}>
                    — Unlicensed. Unowned. Unafraid.
                </p>
            </div>
        </div>
    );
}
