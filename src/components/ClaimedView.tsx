import { useEffect, useState } from "react";
import { useTezos } from "../context/TezosContext";
import config from "../config/tezos";
import type { SubdomainRecord } from "../lib/domains";

interface TzktAccountData {
    alias: string | null;
    loading: boolean;
}

function useTzktAccount(address: string | null): TzktAccountData {
    const [data, setData] = useState<TzktAccountData>({ alias: null, loading: false });

    useEffect(() => {
        if (!address) {
            setData({ alias: null, loading: false });
            return;
        }
        let cancelled = false;
        setData({ alias: null, loading: true });
        fetch(`${config.tzktApi}/v1/accounts/${address}`)
            .then((r) => r.json())
            .then((json) => {
                if (!cancelled) setData({ alias: json.alias ?? null, loading: false });
            })
            .catch(() => {
                if (!cancelled) setData({ alias: null, loading: false });
            });
        return () => {
            cancelled = true;
        };
    }, [address]);

    return data;
}

export default function ClaimedView({ subdomain }: { subdomain: SubdomainRecord }) {
    const { address } = useTezos();
    const tzkt = useTzktAccount(address);

    const label = subdomain.name.replace(`.hack.${config.tld}`, "");
    const profileUrl = "https://profiles.tzkt.io/";
    const domainsBase = config.name === "mainnet" ? "https://app.tezos.domains" : `https://${config.name}.tezos.domains`;
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

            {profileUrl && (
                <div className="claimed-profile-card">
                    <div className="claimed-profile-header">
                        <span className="claimed-profile-eyebrow">Your tzkt profile</span>
                        {!tzkt.loading && tzkt.alias && (
                            <span className="claimed-profile-alias">{tzkt.alias}</span>
                        )}
                    </div>

                    <p className="claimed-profile-blurb">
                        We'll use your{" "}
                        <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="claimed-link">
                            tzkt profile
                        </a>{" "}
                        — including any social accounts you've linked — to reach out with news, drops, and
                        what's next for hack.tez.
                    </p>

                    <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm claimed-profile-btn"
                        aria-label="View your tzkt profile (opens in new tab)"
                    >
                        View profile on tzkt.io ↗
                    </a>
                </div>
            )}

            <div className="claimed-next-card">
                <span className="claimed-next-eyebrow">What's next</span>
                <p className="claimed-next-blurb">
                    <strong>hack.tez is phase one.</strong> More is coming — tools, features, and a community
                    built around this namespace. Your name is your seat at the table.
                </p>
                <p className="claimed-next-blurb">
                    Stay in the loop. Follow{" "}
                    <a
                        href="https://x.com/fafo_lab"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="claimed-link"
                        aria-label="Follow @fafo_lab on X (opens in new tab)"
                    >
                        @fafo_lab
                    </a>{" "}
                    on X for announcements.
                </p>
            </div>

            <div className="claimed-actions">
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
