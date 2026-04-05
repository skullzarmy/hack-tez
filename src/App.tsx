/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
/** biome-ignore-all lint/a11y/useSemanticElements: <I said so> */
import { useState, useEffect, Component, lazy, Suspense, type ReactNode, type ErrorInfo } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { TezosProvider, useTezos } from "./context/TezosContext";
import ConnectWallet from "./components/ConnectWallet";
import Home from "./pages/Home";
import Manifesto from "./pages/Manifesto";
import Hackers from "./pages/Hackers";
import Developers from "./pages/Developers";
import Policies from "./pages/Policies";
import Footer from "./components/Footer";
import { useRecentActivity } from "./hooks/useRecentActivity";

const ActivityFeedPanel = lazy(() => import("./components/ActivityFeedPanel"));
const ActivityToastQueue = lazy(() => import("./components/ActivityToastQueue"));
const Skills = lazy(() => import("./pages/Skills"));
const SkillDetail = lazy(() => import("./pages/SkillDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const Chat = lazy(() => import("./components/chat/ChatPage"));

interface ErrorBoundaryState {
    hasError: boolean;
    message: string;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, message: "" };

    static getDerivedStateFromError(err: Error): ErrorBoundaryState {
        return { hasError: true, message: err.message };
    }

    componentDidCatch(err: Error, info: ErrorInfo) {
        if (import.meta.env.DEV) {
            console.error("[hack.tez] Unhandled render error:", err, info.componentStack);
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    role="alert"
                    style={{
                        padding: "2rem",
                        fontFamily: "monospace",
                        background: "var(--bg, #000)",
                        color: "var(--err, #ff6b6b)",
                        border: "1px solid var(--err, #ff6b6b)",
                        margin: "2rem auto",
                        maxWidth: "600px",
                    }}
                >
                    <h1 style={{ fontSize: "1rem", marginBottom: "1rem" }}>// SYSTEM ERROR</h1>
                    <p style={{ color: "var(--fg, #fff)", marginBottom: "1.5rem" }}>
                        {this.state.message || "Something went wrong. Please reload."}
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false, message: "" })}
                        style={{
                            background: "var(--fg, #fff)",
                            color: "var(--bg, #000)",
                            border: "none",
                            padding: "0.5rem 1.5rem",
                            fontFamily: "monospace",
                            cursor: "pointer",
                        }}
                    >
                        RETRY
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

type Theme = "auto" | "dark" | "light";

function useTheme() {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof localStorage === "undefined") return "auto";
        return (localStorage.getItem("hack-tez-theme") as Theme) ?? "auto";
    });

    useEffect(() => {
        const root = document.documentElement;
        if (theme === "auto") {
            root.removeAttribute("data-theme");
        } else {
            root.setAttribute("data-theme", theme);
        }
        localStorage.setItem("hack-tez-theme", theme);
    }, [theme]);

    return { theme, setTheme: setThemeState };
}

function ThemeSwitcher({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
    return (
        <div className="theme-switcher" role="group" aria-label="Color theme">
            <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === "auto"}
                onClick={() => setTheme("auto")}
                title="Auto (system default)"
                aria-label="Auto"
            >
                ⊙
            </button>
            <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
                title="Dark mode"
                aria-label="Dark"
            >
                ◑
            </button>
            <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
                title="Light mode"
                aria-label="Light"
            >
                ○
            </button>
        </div>
    );
}

function Nav({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
    const [open, setOpen] = useState(false);
    const { domain } = useTezos();

    return (
        <nav className="nav" aria-label="Site navigation">
            <div className="container nav-inner">
                <a href="/" className="nav-logo" aria-label="hack.tez home">
                    HACK<span className="dot-tez">.TEZ</span>
                </a>

                <div className="nav-actions">
                    <ThemeSwitcher theme={theme} setTheme={setTheme} />
                    <ConnectWallet />
                    <div className="nav-menu">
                        <button
                            type="button"
                            className="nav-hamburger"
                            aria-label={open ? "Close menu" : "Open menu"}
                            aria-expanded={open}
                            aria-controls="nav-drawer"
                            onClick={() => setOpen((o) => !o)}
                        >
                            <span className="nav-hamburger-bar" />
                            <span className="nav-hamburger-bar" />
                            <span className="nav-hamburger-bar" />
                        </button>
                        {open && (
                            <div
                                id="nav-drawer"
                                className="nav-drawer"
                                role="menu"
                                aria-label="Navigation menu"
                                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                            >
                                <div className="nav-drawer-inner">
                                    <a
                                        href="/"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Home
                                    </a>
                                    <a
                                        href="/manifesto"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Manifesto
                                    </a>
                                    <a
                                        href="/hackers"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Hackers
                                    </a>
                                    {domain && (
                                    <a
                                        href="/manage"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Manage
                                    </a>
                                    )}
                                    {domain && (
                                    <a
                                        href="/chat"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Chat
                                    </a>
                                    )}
                                    <a
                                        href="/developers"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Developers
                                    </a>
                                    <a
                                        href="/skills"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Skills
                                    </a>
                                    <a
                                        href="/policies"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Policies
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}

function ActivityLayer() {
    const location = useLocation();
    const { events, newEvents, isLoading } = useRecentActivity();
    if (location.pathname === "/developers") return null;
    return (
        <>
            {/* Desktop: fixed side panel (lg+ only, hidden via CSS on smaller screens) */}
            <Suspense fallback={null}>
                <ActivityFeedPanel events={events} isLoading={isLoading} />
            </Suspense>
            {/* Mobile: toast queue (hidden on lg+ via CSS) */}
            <Suspense fallback={null}>
                <ActivityToastQueue newEvents={newEvents} />
            </Suspense>
        </>
    );
}

export function AppShell() {
    const { theme, setTheme } = useTheme();

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
            {/* Noise grain overlay — decorative, hidden from AT */}
            <div className="noise-overlay" aria-hidden="true" />

            {/* Skip to main content link */}
            <a href="#main-content" className="skip-link">
                Skip to content
            </a>

            {/* Navigation */}
            <Nav theme={theme} setTheme={setTheme} />

            {/* Main content */}
            <main id="main-content" tabIndex={-1} style={{ flex: "1 0 auto" }}>
                <Routes>
                    <Route path="/manifesto" element={<Manifesto />} />
                    <Route path="/hackers" element={<Hackers />} />
                    <Route path="/developers" element={<Developers />} />
                    <Route path="/policies" element={<Policies />} />
                    <Route path="/skills/:slug" element={<Suspense fallback={null}><SkillDetail /></Suspense>} />
                    <Route path="/skills" element={<Suspense fallback={null}><Skills /></Suspense>} />
                    <Route path="/u/:subdomain" element={<Suspense fallback={null}><Profile /></Suspense>} />
                    <Route path="/manage" element={<Suspense fallback={null}><Dashboard /></Suspense>} />
                    <Route path="/chat" element={<Suspense fallback={null}><Chat /></Suspense>} />
                    <Route path="/" element={<Home />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </main>

            <ActivityLayer />
            <Footer />
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <TezosProvider>
                <BrowserRouter>
                    <AppShell />
                </BrowserRouter>
            </TezosProvider>
        </ErrorBoundary>
    );
}
