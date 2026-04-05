import { verifySignature, getPkhfromPk } from "@taquito/utils";

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const NETWORK_CONFIG = {
  ghostnet: {
    tld: "gho",
    graphqlUrl: "https://ghostnet-api.tezos.domains/graphql",
  },
  mainnet: {
    tld: "tez",
    graphqlUrl: "https://api.tezos.domains/graphql",
  },
} as const;

function packMichelineString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const lenHex = bytes.length.toString(16).padStart(8, "0");
  return (
    "0501" +
    lenHex +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Verify a Tezos wallet signature for hack.tez chat authentication.
 * The signed message format is: `hack.tez-chat:{timestamp}:{nonce}`
 */
export async function verifyTezosSignature(params: {
  address: string;
  publicKey: string;
  signature: string;
  timestamp: number;
  nonce: string;
}): Promise<boolean> {
  const { address, publicKey, signature, timestamp, nonce } = params;

  // Derive address from public key and verify it matches
  const derivedAddress = getPkhfromPk(publicKey);
  if (derivedAddress !== address) return false;

  // Validate nonce format
  if (!/^[A-Fa-f0-9]{8,128}$/.test(nonce)) return false;

  // Validate timestamp — frontend sends seconds, normalize to ms
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp) || timestamp <= 0) return false;
  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const now = Date.now();
  if (Math.abs(now - timestampMs) > TIMESTAMP_WINDOW_MS) return false;

  // Reconstruct the signed message using the original timestamp value
  const message = `hack.tez-chat:${timestamp}:${nonce}`;
  const payloadHex = packMichelineString(message);

  return verifySignature(payloadHex, publicKey, signature);
}

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
  network: "ghostnet" | "mainnet" = "ghostnet",
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
