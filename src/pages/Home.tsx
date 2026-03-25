import SubdomainSearch from "../components/SubdomainSearch";
import { useTezos } from "../context/TezosContext";
import { useEligibility } from "../hooks/useEligibility";

export default function Home() {
    const { address } = useTezos();
    const eligibility = useEligibility(address);

    return (
        <div className="space-y-16">
            {/* Hero */}
            <section className="text-center pt-12 pb-8">
                <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
                    hack<span className="text-emerald-400">.tez</span>
                </h1>
                <p className="text-xl text-gray-400 max-w-md mx-auto">
                    Claim your free Tezos subdomain. No fees — just gas.
                </p>
            </section>

            {/* Search */}
            <section>
                <SubdomainSearch />
            </section>

            {/* Eligibility Status */}
            {address && (
                <section className="max-w-lg mx-auto">
                    <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Wallet Status</h3>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Revealed</span>
                                <span className={eligibility.revealed ? "text-emerald-400" : "text-red-400"}>
                                    {eligibility.loading ? "…" : eligibility.revealed ? "✓ Yes" : "✗ No"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Account Age</span>
                                <span
                                    className={
                                        eligibility.age !== null && eligibility.age >= 4
                                            ? "text-emerald-400"
                                            : "text-yellow-400"
                                    }
                                >
                                    {eligibility.loading
                                        ? "…"
                                        : eligibility.age !== null
                                          ? `${eligibility.age.toFixed(1)} hours`
                                          : "Unknown"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Eligible</span>
                                <span className={eligibility.eligible ? "text-emerald-400" : "text-red-400"}>
                                    {eligibility.loading ? "…" : eligibility.eligible ? "✓ Yes" : "✗ No"}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* How it works */}
            <section className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-white text-center mb-8">How it works</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        {
                            step: "1",
                            title: "Connect",
                            desc: "Link your Tezos wallet. Your account must be revealed and at least 4 hours old.",
                        },
                        {
                            step: "2",
                            title: "Search",
                            desc: "Find an available subdomain. Names are lowercase letters, numbers, and hyphens.",
                        },
                        {
                            step: "3",
                            title: "Register",
                            desc: "Sign a message, approve a tiny gas transaction (~0.01 ꜩ), and your subdomain is live!",
                        },
                    ].map((item) => (
                        <div
                            key={item.step}
                            className="p-6 rounded-lg bg-gray-800/50 border border-gray-700 text-center"
                        >
                            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center mx-auto mb-3">
                                {item.step}
                            </div>
                            <h3 className="text-white font-medium mb-2">{item.title}</h3>
                            <p className="text-gray-400 text-sm">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Footer info */}
            <section className="text-center text-gray-500 text-sm pb-8">
                <p>
                    hack.tez is a free community project.{" "}
                    <a
                        href="https://github.com/skullzarmy/hack-tez"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-500 hover:text-emerald-400"
                    >
                        Open source on GitHub ↗
                    </a>
                </p>
            </section>
        </div>
    );
}
