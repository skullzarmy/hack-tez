/**
 * TED (Tezos Domains) ownership lookup.
 *
 * No Node-only deps — safe to import from PartyKit, browsers, edge functions.
 * Used by the worker during /auth and /auth/refresh to confirm which hack.tez
 * domains a wallet currently owns.
 */

import type { Network } from "./types.js";

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
  const { tld, graphqlUrl } = NETWORK_CONFIG[network];
  const PAGE_SIZE = 50;
  const MAX_PAGES = 20; // hard cap: 1000 domains

  const names: string[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      domains: {
        items: Array<{ name: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await tedGql(
      graphqlUrl,
      `query OwnerDomains($owner: Address!, $parent: String!, $first: Int!, $after: String) {
        domains(
          first: $first,
          after: $after,
          where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }
        ) {
          items { name }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { owner: address, parent: `.hack.${tld}`, first: PAGE_SIZE, after },
    );

    for (const d of data.domains.items) names.push(d.name);
    if (!data.domains.pageInfo.hasNextPage) break;
    after = data.domains.pageInfo.endCursor;
    if (!after) break;
  }

  return names;
}
