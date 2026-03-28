import { useTezos } from "../context/TezosContext";
import { useEligibility } from "../hooks/useEligibility";

export default function EligibilityPanel() {
    const { address } = useTezos();
    const eligibility = useEligibility(address);

    if (!address) return null;

    return (
        <div className="eligibility-panel">
            <div className="eligibility-label">Wallet Status</div>
            {eligibility.loading ? (
                <div className="eligibility-stamp eligibility-stamp--loading">CHECKING…</div>
            ) : eligibility.eligible ? (
                <div className="eligibility-stamp eligibility-stamp--ok">: ELIGIBLE</div>
            ) : (
                <>
                    <div className="eligibility-stamp eligibility-stamp--err">: INELIGIBLE</div>
                    <p className="eligibility-reason">
                        To register a name, your wallet must meet both requirements:
                    </p>
                    <ul className="eligibility-reqs">
                        <li>
                            Account must be <strong>revealed</strong> — send at least one on-chain transaction
                        </li>
                        <li>
                            Account must be <strong>at least 4 hours old</strong>
                        </li>
                    </ul>
                </>
            )}
        </div>
    );
}
