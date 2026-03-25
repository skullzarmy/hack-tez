/**
 * API wrappers for Netlify Functions
 */

interface PermitRequest {
    address: string;
    label: string;
    targetAddress: string;
    walletSignature: string;
    walletPublicKey: string;
}

interface PermitResponse {
    permitSignature: string;
    expiry: string; // ISO timestamp
    labelBytes: string;
}

export async function requestPermit(req: PermitRequest): Promise<PermitResponse> {
    const res = await fetch("/.netlify/functions/permit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Permit request failed (${res.status})`);
    }
    return res.json();
}

interface SetRedirectRequest {
    subdomain: string;
    redirectUrl: string;
    walletSignature: string;
    walletPublicKey: string;
    address: string;
}

export async function setRedirect(req: SetRedirectRequest): Promise<void> {
    const res = await fetch("/.netlify/functions/set-redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Set redirect failed (${res.status})`);
    }
}

export async function getRedirect(subdomain: string): Promise<string | null> {
    const res = await fetch(`/.netlify/functions/get-redirect?subdomain=${encodeURIComponent(subdomain)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.redirectUrl || null;
}
