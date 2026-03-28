import { useState, useEffect } from "react";
import config from "../config/tezos";

interface RegistrationStatus {
    loading: boolean;
    count: number;
}

export function useRegistrationCount(address: string | null): RegistrationStatus {
    const [status, setStatus] = useState<RegistrationStatus>({ loading: false, count: 0 });

    useEffect(() => {
        if (!address || !config.registrarAddress) {
            setStatus({ loading: false, count: 0 });
            return;
        }

        let cancelled = false;
        setStatus({ loading: true, count: 0 });

        fetch(
            `${config.tzktApi}/v1/contracts/${config.registrarAddress}/bigmaps/registrations/keys/${address}`,
        )
            .then((r) => {
                if (!r.ok) return null;
                return r.json();
            })
            .then((data) => {
                if (cancelled) return;
                const count = data?.value ? parseInt(data.value, 10) : 0;
                setStatus({ loading: false, count });
            })
            .catch(() => {
                if (!cancelled) setStatus({ loading: false, count: 0 });
            });

        return () => {
            cancelled = true;
        };
    }, [address]);

    return status;
}
