/**
 * Objkt.com v3 marketplace query + in-situ `fulfill_ask` purchase helper.
 * Uses raw Micheline via DAppClient.requestOperation() (hack.tez convention).
 */
import type { DAppClient, TezosOperationType } from "@tezos-x/octez.connect-sdk";

export const OBJKT_GRAPHQL = "https://data.objkt.com/v3/graphql";
/** Objkt marketplace v3 contract on Tezos mainnet. */
export const OBJKT_MARKETPLACE_V3 = "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X";

export interface ObjktListing {
    bigmapKey: string;
    priceMutez: number;
    amountLeft: number;
    sellerAddress: string;
    marketplaceContract: string;
}

export interface ObjktTokenInfo {
    contract: string;
    tokenId: string;
    name: string;
    supply: number;
    displayUri: string | null;
    creatorAlias: string | null;
    creatorTwitter: string | null;
    listings: ObjktListing[];
}

interface GraphQlListing {
    bigmap_key: string | number;
    price: number;
    amount_left: number;
    seller_address: string;
    marketplace_contract: string;
    currency_id: number;
}

interface GraphQlToken {
    name: string | null;
    supply: number;
    display_uri: string | null;
    creators: Array<{
        holder: {
            alias: string | null;
            twitter: string | null;
        } | null;
    }>;
    listings_active: GraphQlListing[];
}

const TOKEN_QUERY = `
query ObjktToken($fa: String!, $tokenId: String!) {
  token(where: { fa_contract: { _eq: $fa }, token_id: { _eq: $tokenId } }) {
    name
    supply
    display_uri
    creators {
      holder {
        alias
        twitter
      }
    }
    listings_active(
      where: { currency_id: { _eq: 1 }, amount_left: { _gt: 0 } }
      order_by: { price: asc }
    ) {
      bigmap_key
      price
      amount_left
      seller_address
      marketplace_contract
      currency_id
    }
  }
}`;

/** Convert an ipfs:// URI to an HTTPS gateway URL. */
export function ipfsToHttp(uri: string | null | undefined): string | null {
    if (!uri) return null;
    if (uri.startsWith("ipfs://")) {
        return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
    }
    return uri;
}

/** Format mutez as a clean XTZ string (e.g. 5000000 -> "5", 1500000 -> "1.5"). */
export function formatMutezToXtz(mutez: number): string {
    const xtz = mutez / 1_000_000;
    return Number.isInteger(xtz) ? String(xtz) : xtz.toFixed(6).replace(/\.?0+$/, "");
}

/** Fetch token metadata and active XTZ listings from objkt's GraphQL API. */
export async function fetchObjktToken(contract: string, tokenId: string): Promise<ObjktTokenInfo | null> {
    const res = await fetch(OBJKT_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query: TOKEN_QUERY,
            variables: { fa: contract, tokenId },
        }),
    });
    if (!res.ok) {
        throw new Error(`objkt API returned ${res.status}`);
    }
    const json = (await res.json()) as {
        data?: { token?: GraphQlToken[] };
        errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
        throw new Error(json.errors[0].message);
    }
    const t = json.data?.token?.[0];
    if (!t) return null;

    const creator = t.creators?.[0]?.holder;
    return {
        contract,
        tokenId,
        name: t.name ?? `Token #${tokenId}`,
        supply: t.supply ?? 0,
        displayUri: t.display_uri ?? null,
        creatorAlias: creator?.alias ?? null,
        creatorTwitter: creator?.twitter ?? null,
        listings: (t.listings_active ?? []).map((l) => ({
            bigmapKey: String(l.bigmap_key),
            priceMutez: Number(l.price),
            amountLeft: Number(l.amount_left),
            sellerAddress: l.seller_address,
            marketplaceContract: l.marketplace_contract,
        })),
    };
}

/**
 * Fulfill an active XTZ ask on objkt's v3 marketplace (`KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X`).
 * Entrypoint signature:
 *   fulfill_ask(ask_id: nat, amount: nat, proxy_for: option(address), condition_extra: option(bytes), referrers: map(address, nat))
 */
export async function fulfillObjktAsk(
    client: DAppClient,
    listing: ObjktListing,
    editions = 1,
): Promise<string> {
    if (listing.marketplaceContract !== OBJKT_MARKETPLACE_V3) {
        throw new Error(`Unsupported marketplace contract: ${listing.marketplaceContract}`);
    }
    if (editions < 1 || editions > listing.amountLeft) {
        throw new Error("Invalid edition quantity");
    }

    const totalMutez = Math.round(listing.priceMutez * editions);
    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "transaction" as TezosOperationType.TRANSACTION,
                destination: listing.marketplaceContract,
                amount: String(totalMutez),
                parameters: {
                    entrypoint: "fulfill_ask",
                    value: {
                        prim: "Pair",
                        args: [
                            { int: listing.bigmapKey },
                            {
                                prim: "Pair",
                                args: [
                                    { int: String(editions) },
                                    {
                                        prim: "Pair",
                                        args: [
                                            { prim: "None" },
                                            {
                                                prim: "Pair",
                                                args: [{ prim: "None" }, []],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        ],
    });
    return (result as { transactionHash: string }).transactionHash;
}
