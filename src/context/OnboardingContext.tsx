import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
    type ReactNode,
} from "react";
import { useTezos } from "./TezosContext";
import { useSubdomains } from "../hooks/useSubdomains";
import {
    isPushSubscribed,
    getPushPermissionState,
} from "../lib/pushSubscription";
import type { HackProfile } from "../types/profile";

// ── Types ────────────────────────────────────────────────────────────

export type OnboardingStep =
    | "connect"
    | "claim"
    | "profile"
    | "push"
    | "chat"
    | "complete"
    | "loading";

/** Numeric label for each actionable step (used in "STEP #" UI badges) */
export const STEP_NUMBER: Record<string, number> = {
    connect: 1,
    claim: 2,
    profile: 3,
    push: 4,
    chat: 5,
};

interface OnboardingState {
    step: OnboardingStep;
    ready: boolean;
    dismiss: (step: OnboardingStep) => void;
    reset: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";

function storageKey(address: string | null): string {
    return `hack-tez-onboarding-${address ?? "anon"}`;
}

function loadDismissed(address: string | null): Set<string> {
    if (!isBrowser) return new Set();
    try {
        const raw = localStorage.getItem(storageKey(address));
        if (!raw) return new Set();
        const arr: unknown = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === "string"));
    } catch { /* corrupted — start fresh */ }
    return new Set();
}

function saveDismissed(address: string | null, dismissed: Set<string>): void {
    if (!isBrowser) return;
    try {
        localStorage.setItem(storageKey(address), JSON.stringify([...dismissed]));
    } catch { /* quota or private-mode — ignore */ }
}

function hasProfileData(profile: HackProfile): boolean {
    return !!(
        profile.bio ||
        profile.status ||
        profile.skills?.length ||
        profile.projects?.length ||
        profile.location ||
        profile.github ||
        profile.twitter ||
        profile.website
    );
}

function deriveStep(
    address: string | null,
    subdomainsLoaded: boolean,
    subdomains: Array<{ profile: HackProfile }>,
    primary: { profile: HackProfile } | null,
    pushSubscribed: boolean,
    pushSupported: boolean,
    dismissed: Set<string>,
): OnboardingStep {
    // Guard: don't show anything until data is ready
    if (address && !subdomainsLoaded) return "loading";

    if (!address) {
        return dismissed.has("connect") ? "complete" : "connect";
    }

    const hasDomain = subdomains.length > 0;
    if (!hasDomain) {
        return dismissed.has("claim") ? "complete" : "claim";
    }

    // Prompt against the domain they actually use, not an arbitrary one.
    if (!hasProfileData((primary ?? subdomains[0]).profile)) {
        return dismissed.has("profile") ? "push" : "profile";
    }

    // Push: skip entirely when unsupported, never dismissible
    if (pushSupported && !pushSubscribed) {
        return "push";
    }

    if (!dismissed.has("chat")) {
        return "chat";
    }

    return "complete";
}

// ── Context ──────────────────────────────────────────────────────────

const OnboardingContext = createContext<OnboardingState | null>(null);

const PUSH_POLL_MS = 10_000;

export function OnboardingProvider({ children }: { children: ReactNode }) {
    const { address } = useTezos();
    const { subdomains, primary, loading: subdomainsLoading } = useSubdomains(address);
    const hasFetched = useRef(false);

    // Track whether initial subdomain fetch has completed
    const subdomainsLoaded = !address || (!subdomainsLoading && hasFetched.current);
    useEffect(() => {
        if (!subdomainsLoading && address) hasFetched.current = true;
    }, [subdomainsLoading, address]);
    useEffect(() => { hasFetched.current = false; }, [address]);

    // Per-wallet dismissed steps
    const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed(address));
    useEffect(() => { setDismissed(loadDismissed(address)); }, [address]);

    // Push subscription state (polled)
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushSupported, setPushSupported] = useState(() =>
        isBrowser ? getPushPermissionState() !== "unsupported" : false,
    );

    useEffect(() => {
        if (!isBrowser) return;
        setPushSupported(getPushPermissionState() !== "unsupported");
        let cancelled = false;
        const check = () => {
            isPushSubscribed().then((v) => { if (!cancelled) setPushSubscribed(v); });
        };
        check();
        const id = setInterval(check, PUSH_POLL_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    const step = deriveStep(address, subdomainsLoaded, subdomains, primary, pushSubscribed, pushSupported, dismissed);
    const ready = step !== "loading";

    const dismiss = useCallback((s: OnboardingStep) => {
        setDismissed((prev) => {
            const next = new Set(prev);
            next.add(s);
            saveDismissed(address, next);
            return next;
        });
    }, [address]);

    const reset = useCallback(() => {
        setDismissed(new Set());
        saveDismissed(address, new Set());
    }, [address]);

    return (
        <OnboardingContext.Provider value={{ step, ready, dismiss, reset }}>
            {children}
        </OnboardingContext.Provider>
    );
}

export function useOnboarding(): OnboardingState {
    const ctx = useContext(OnboardingContext);
    if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
    return ctx;
}
