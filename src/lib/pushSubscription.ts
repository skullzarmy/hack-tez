/**
 * Client-side push subscription management.
 * Handles browser permission, PushManager subscription, and server sync.
 */
import { hackchatUrl } from "../config/tezos";

const VAPID_KEY_CACHE_KEY = "hack-tez-vapid-public-key";

/** Convert a base64url VAPID public key to a Uint8Array for PushManager */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

/** Fetch VAPID public key from the chat server (cached in sessionStorage) */
async function getVapidPublicKey(): Promise<string> {
    // Try VITE env var first (build-time)
    const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (envKey) return envKey;

    // Try cache
    const cached = sessionStorage.getItem(VAPID_KEY_CACHE_KEY);
    if (cached) return cached;

    // Fetch from server
    const res = await fetch(`${hackchatUrl}/push/vapid-key`);
    if (!res.ok) throw new Error("Failed to fetch VAPID key");
    const data: { publicKey: string } = await res.json();
    sessionStorage.setItem(VAPID_KEY_CACHE_KEY, data.publicKey);
    return data.publicKey;
}

export type PushPermissionState = "prompt" | "granted" | "denied" | "unsupported";

/** Get the current push permission state */
export function getPushPermissionState(): PushPermissionState {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
    return Notification.permission as PushPermissionState;
}

/** Check if push is currently subscribed */
export async function isPushSubscribed(): Promise<boolean> {
    if (!("serviceWorker" in navigator)) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return !!sub;
    } catch {
        return false;
    }
}

/** Request notification permission and subscribe to push */
export async function subscribeToPush(token: string): Promise<boolean> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    try {
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = await getVapidPublicKey();

        // Subscribe to push
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });

        // Extract keys
        const rawKeys = subscription.toJSON();
        const p256dh = rawKeys.keys?.p256dh;
        const auth = rawKeys.keys?.auth;

        if (!p256dh || !auth) throw new Error("Subscription missing keys");

        // Send to server
        const res = await fetch(`${hackchatUrl}/push/subscribe`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                endpoint: subscription.endpoint,
                p256dh,
                auth,
                userAgent: navigator.userAgent,
            }),
        });

        return res.ok;
    } catch (err) {
        console.error("Push subscription failed:", err);
        return false;
    }
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(token: string): Promise<boolean> {
    if (!("serviceWorker" in navigator)) return false;

    try {
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.getSubscription();

        if (!subscription) return true; // Already unsubscribed

        // Unsubscribe locally
        await subscription.unsubscribe();

        // Remove from server
        await fetch(`${hackchatUrl}/push/subscribe`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        return true;
    } catch (err) {
        console.error("Push unsubscribe failed:", err);
        return false;
    }
}

export interface PushPreferences {
    pushEnabled: boolean;
    pushDms: boolean;
    pushMentions: boolean;
    pushBroadcasts: boolean;
    quietStart: string | null;
    quietEnd: string | null;
}

const DEFAULT_PUSH_PREFS: PushPreferences = {
    pushEnabled: true,
    pushDms: true,
    pushMentions: true,
    pushBroadcasts: true,
    quietStart: null,
    quietEnd: null,
};

/** Fetch push preferences from server */
export async function getPushPreferences(token: string): Promise<PushPreferences> {
    try {
        const res = await fetch(`${hackchatUrl}/push/preferences`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return DEFAULT_PUSH_PREFS;
        const data = await res.json();
        return data.preferences ?? DEFAULT_PUSH_PREFS;
    } catch {
        return DEFAULT_PUSH_PREFS;
    }
}

/** Update push preferences on server */
export async function updatePushPreferences(
    token: string,
    prefs: Partial<PushPreferences>,
): Promise<boolean> {
    try {
        const res = await fetch(`${hackchatUrl}/push/preferences`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(prefs),
        });
        return res.ok;
    } catch {
        return false;
    }
}
