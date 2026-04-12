import { ExternalLink } from "lucide-react";
import config from "../config/tezos";

export default function ClaimUsedView() {
    const domainsUrl = config.tedAppUrl;

    return (
        <div className="claim-used-view" role="region" aria-label="Claim already used">
            <div className="claim-used-badge-row">
                <span className="claim-used-badge">⚠ Claim Used</span>
            </div>

            <p className="claim-used-headline">You've already registered a .hack.{config.tld} name.</p>

            <p className="claim-used-body">
                This wallet has used its one free claim. Each wallet is limited to one name.
            </p>

            <p className="claim-used-body">
                If you no longer hold your subdomain — it may have been transferred or expired — you can
                check on{" "}
                <a href={domainsUrl} target="_blank" rel="noopener noreferrer" className="claimed-link">
                    Tezos Domains
                </a>
                .
            </p>

            <div className="claim-used-next">
                <span className="claimed-next-eyebrow">Stay connected</span>
                <p className="claim-used-body">
                    More is coming to hack.tez — new features, tools, and ways to participate. Follow{" "}
                    <a
                        href="https://x.com/fafo_lab"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="claimed-link"
                        aria-label="Follow @fafo_lab on X (opens in new tab)"
                    >
                        @fafo_lab
                    </a>{" "}
                    on X to stay in the loop.
                </p>
            </div>

            <div className="claimed-actions">
                <a
                    href={domainsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    aria-label="Check your subdomains on Tezos Domains (opens in new tab)"
                >
                    Check on Tezos Domains <ExternalLink size={14} aria-hidden="true" />
                </a>
                <a
                    href="https://x.com/fafo_lab"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    aria-label="Follow @fafo_lab on X (opens in new tab)"
                >
                    Follow @fafo_lab <ExternalLink size={14} aria-hidden="true" />
                </a>
            </div>
        </div>
    );
}
