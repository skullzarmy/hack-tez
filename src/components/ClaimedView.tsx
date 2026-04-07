import config, { appUrl } from "../config/tezos";
import type { SubdomainRecord } from "../lib/domains";

export default function ClaimedView({ subdomain }: { subdomain: SubdomainRecord }) {
    const label = subdomain.name.replace(`.hack.${config.tld}`, "");
    const domainsBase = config.tedAppUrl;
    const domainsUrl = `${domainsBase}/domain/${subdomain.name}`;

    return (
        <div className="claimed-view" role="region" aria-label="Your claimed name">
            <div className="claimed-badge-row">
                <span className="claimed-badge">✓ Registered</span>
            </div>

            <div className="claimed-name-display" aria-label={`Your subdomain: ${subdomain.name}`}>
                <span className="claimed-label mono">{label}</span>
                <span className="claimed-tld">.hack.{config.tld}</span>
            </div>

            <div className="claimed-next-card">
                <span className="claimed-next-eyebrow">What's next</span>
                <p className="claimed-next-blurb">
                    <strong>Set up your hacker profile.</strong> Add your bio, skills, and projects — share it
                    at <code style={{ fontSize: "0.85em" }}>{appUrl}/u/{label}</code>.
                </p>
                <a
                    href={`/u/${label}?edit=true`}
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: "0.5rem" }}
                >
                    Set up your profile →
                </a>
            </div>

            <div className="claimed-actions">
                <a
                    href={`/u/${label}`}
                    className="btn btn-ghost btn-sm"
                    aria-label={`View your profile at /u/${label}`}
                >
                    View profile
                </a>
                <a
                    href={domainsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Manage ${subdomain.name} on Tezos Domains (opens in new tab)`}
                >
                    Manage on Tezos Domains ↗
                </a>
            </div>
        </div>
    );
}
