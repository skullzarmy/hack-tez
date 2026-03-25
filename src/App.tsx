import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { TezosProvider } from "./context/TezosContext";
import ConnectWallet from "./components/ConnectWallet";
import Home from "./pages/Home";
import Manage from "./pages/Manage";

export default function App() {
    return (
        <TezosProvider>
            <BrowserRouter>
                <div className="min-h-screen bg-gray-900 text-white">
                    {/* Nav */}
                    <nav className="border-b border-gray-800 px-6 py-4">
                        <div className="max-w-5xl mx-auto flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <Link
                                    to="/"
                                    className="font-bold text-lg text-white hover:text-emerald-400 transition-colors"
                                >
                                    hack<span className="text-emerald-400">.tez</span>
                                </Link>
                                <Link to="/manage" className="text-sm text-gray-400 hover:text-white transition-colors">
                                    My Subdomains
                                </Link>
                            </div>
                            <ConnectWallet />
                        </div>
                    </nav>

                    {/* Content */}
                    <main className="max-w-5xl mx-auto px-6">
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/manage" element={<Manage />} />
                        </Routes>
                    </main>
                </div>
            </BrowserRouter>
        </TezosProvider>
    );
}
