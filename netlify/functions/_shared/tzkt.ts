/**
 * TzKT API helpers for account verification
 */

const TZKT_MAINNET = "https://api.tzkt.io";
const TZKT_GHOSTNET = "https://api.ghostnet.tzkt.io";

function getBaseUrl(): string {
    return process.env.VITE_TEZOS_NETWORK === "mainnet" ? TZKT_MAINNET : TZKT_GHOSTNET;
}

interface AccountInfo {
    type: string;
    address: string;
    revealed: boolean;
    balance: number;
    firstActivityTime: string | null;
    numTransactions: number;
}

export async function getAccount(address: string): Promise<AccountInfo | null> {
    const res = await fetch(`${getBaseUrl()}/v1/accounts/${address}`);
    if (!res.ok) return null;
    return res.json();
}

export async function isRevealed(address: string): Promise<boolean> {
    const account = await getAccount(address);
    return account?.revealed === true;
}

export async function getAccountAgeHours(address: string): Promise<number> {
    const account = await getAccount(address);
    if (!account?.firstActivityTime) return 0;
    const firstActivity = new Date(account.firstActivityTime);
    return (Date.now() - firstActivity.getTime()) / (1000 * 60 * 60);
}

export async function verifyEligibility(address: string): Promise<{ eligible: boolean; reason?: string }> {
    const account = await getAccount(address);
    if (!account) return { eligible: false, reason: "Account not found" };

    if (!account.revealed) {
        return { eligible: false, reason: "Account is not revealed" };
    }

    if (!account.firstActivityTime) {
        return { eligible: false, reason: "Account has no activity" };
    }

    const ageHours = (Date.now() - new Date(account.firstActivityTime).getTime()) / (1000 * 60 * 60);
    if (ageHours < 4) {
        return {
            eligible: false,
            reason: `Account must be at least 4 hours old (currently ${ageHours.toFixed(1)}h)`,
        };
    }

    return { eligible: true };
}
