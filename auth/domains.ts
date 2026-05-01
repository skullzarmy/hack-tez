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
 */
export async function getOwnedDomains(
  address: string,
  network: Network = "ghostnet",
): Promise<string[]> {
  const { tld, graphqlUrl } = NETWORK_CONFIG[network];

  const data = await tedGql<{
    domains: { items: Array<{ name: string }> };
  }>(
    graphqlUrl,
    `query OwnerDomains($owner: Address!, $parent: String!) {
      domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
        items { name }
      }
    }`,
    { owner: address, parent: `.hack.${tld}` },
  );

  return data.domains.items.map((d) => d.name);
}
