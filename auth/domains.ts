/**
 * TED (Tezos Domains) ownership lookup.
 *
 * No Node-only deps — safe to import from PartyKit, browsers, edge functions.
 * Used by the worker during /auth and /auth/refresh to confirm which hack.tez
 * domains a wallet currently owns.
 */

import type { Network } from "./types.js";
import {
  parseProfileFromData,
  resolvePrimary,
  type PrimaryCandidate,
} from "../src/types/profile.js";

const NETWORK_CONFIG: Record<Network, { tld: "tez" | "gho"; graphqlUrl: string }> = {
  ghostnet: {
    tld: "gho",
    graphqlUrl: "https://ghostnet-api.tezos.domains/graphql",
  },
  mainnet: {
    tld: "tez",
    graphqlUrl: "https://api.tezos.domains/graphql",
  },
};

async function tedGql<T>(
  graphqlUrl: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`TED GraphQL HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data as T;
}

/**
 * Query TED GraphQL for all hack.tez (or hack.gho) domains owned by an address.
 * Returns an array of full domain names (e.g. ["alice.hack.tez"]).
 *
 * Paginates with `first: 50` (TED's max page size) — without this, TED defaults
 * to 10 results per page, silently dropping domains for any wallet owning more
 * than 10. That manifests as admin.hack.tez disappearing from JWTs after the
 * first /auth/refresh.
 */
export async function getOwnedDomains(
  address: string,
  network: Network = "ghostnet",
): Promise<string[]> {
  return (await getOwnedDomainsWithPrimary(address, network)).domains;
}

/**
 * Owned domains plus the resolved primary — the identity we sign the wallet
 * into. Same single query as `getOwnedDomains`, no extra round trip: the
 * marker rides in the `data` map we now select.
 *
 * `order: NAME ASC` is load-bearing. Without it TED returns an arbitrary
 * order, and the lexicographic fallback in `resolvePrimary` would be the only
 * thing keeping a multi-domain wallet from flipping identity between calls.
 */
export async function getOwnedDomainsWithPrimary(
  address: string,
  network: Network = "ghostnet",
): Promise<{ domains: string[]; primary: string | null }> {
  const { tld, graphqlUrl } = NETWORK_CONFIG[network];
  const PAGE_SIZE = 50;
  const MAX_PAGES = 20; // hard cap: 1000 domains
  const suffix = `.hack.${tld}`;

  const names: string[] = [];
  const candidates: PrimaryCandidate[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      domains: {
        items: Array<{
          name: string;
          owner: string;
          data: Array<{ key: string; value: unknown }>;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await tedGql(
      graphqlUrl,
      `query OwnerDomains($owner: Address!, $parent: String!, $first: Int!, $after: String) {
        domains(
          first: $first,
          after: $after,
          where: { owner: { equalTo: $owner }, name: { endsWith: $parent } },
          order: { field: NAME, direction: ASC }
        ) {
          items { name owner data { key value } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { owner: address, parent: suffix, first: PAGE_SIZE, after },
    );

    for (const d of data.domains.items) {
      names.push(d.name);
      // Sub-subdomains (a.b.hack.tez) belong to a member, they are not one.
      if (d.name.slice(0, -suffix.length).includes(".")) continue;
      candidates.push({
        name: d.name,
        owner: d.owner,
        profile: parseProfileFromData(d.data ?? []),
      });
    }
    if (!data.domains.pageInfo.hasNextPage) break;
    after = data.domains.pageInfo.endCursor;
    if (!after) break;
  }

  return { domains: names, primary: resolvePrimary(address, candidates) };
}
