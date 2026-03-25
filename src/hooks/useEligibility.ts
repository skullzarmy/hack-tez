import { useState, useEffect } from "react";
import config from "../config/tezos";

interface Eligibility {
    loading: boolean;
    revealed: boolean | null;
    age: number | null; // hours since first activity
    eligible: boolean;
    reason: string | null;
}

const MIN_AGE_HOURS = 4;

export function useEligibility(address: string | null): Eligibility {
    const [state, setState] = useState<Eligibility>({
        loading: false,
        revealed: null,
        age: null,
        eligible: false,
        reason: null,
    });

    useEffect(() => {
        if (!address) {
            setState({ loading: false, revealed: null, age: null, eligible: false, reason: null });
            return;
        }

        let cancelled = false;
        setState((s) => ({ ...s, loading: true }));

        fetch(`${config.tzktApi}/v1/accounts/${address}`)
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;

                const revealed = data.revealed === true;
                const firstActivity = data.firstActivityTime ? new Date(data.firstActivityTime) : null;
                const ageHours = firstActivity ? (Date.now() - firstActivity.getTime()) / (1000 * 60 * 60) : 0;

                let eligible = true;
                let reason: string | null = null;

                if (!revealed) {
                    eligible = false;
                    reason = "Account must be revealed (make at least one on-chain transaction first)";
                } else if (ageHours < MIN_AGE_HOURS) {
                    eligible = false;
                    reason = `Account must be at least ${MIN_AGE_HOURS} hours old (currently ${ageHours.toFixed(1)}h)`;
                }

                setState({
                    loading: false,
                    revealed,
                    age: ageHours,
                    eligible,
                    reason,
                });
            })
            .catch(() => {
                if (!cancelled) {
                    setState({
                        loading: false,
                        revealed: null,
                        age: null,
                        eligible: false,
                        reason: "Failed to check account status",
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [address]);

    return state;
}
