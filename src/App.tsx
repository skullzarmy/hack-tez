import { useState, useEffect, Component, lazy, Suspense, type ReactNode, type ErrorInfo } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TezosProvider } from "./context/TezosContext";
import ConnectWallet from "./components/ConnectWallet";
import Home from "./pages/Home";
import Manifesto from "./pages/Manifesto";
import { useRecentActivity } from "./hooks/useRecentActivity";

const ActivityFeedPanel = lazy(() => import("./components/ActivityFeedPanel"));
const ActivityToastQueue = lazy(() => import("./components/ActivityToastQueue"));

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
                    <h1 style={{ fontSize: "1rem", marginBottom: "1rem" }}>
                        // SYSTEM ERROR
                    </h1>
                    <p style={{ color: "var(--fg, #fff)", marginBottom: "1.5rem" }}>
                        {this.state.message || "Something went wrong. Please reload."}
                    </p>
                    <button
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
                className="theme-btn"
                aria-pressed={theme === "auto"}
                onClick={() => setTheme("auto")}
                title="Auto (system default)"
            >
                Auto
            </button>
            <button
                className="theme-btn"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
                title="Dark mode"
                aria-label="Dark"
            >
                ◑
            </button>
            <button
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

function ActivityLayer() {
    const { events, newEvents, isLoading } = useRecentActivity();
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

export default function App() {
    const { theme, setTheme } = useTheme();

    return (
        <ErrorBoundary>
        <TezosProvider>
            <BrowserRouter>
                {/* Noise grain overlay — decorative, hidden from AT */}
                <div className="noise-overlay" aria-hidden="true" />

                {/* Skip to main content link */}
                <a href="#main-content" className="skip-link">
                    Skip to content
                </a>

                {/* Navigation */}
                <nav className="nav" aria-label="Site navigation">
                    <div className="container nav-inner">
                        <a href="/" className="nav-logo" aria-label="hack.tez home">
                            HACK<span className="dot-tez">.TEZ</span>
                        </a>

                        <div className="nav-actions">
                            <ThemeSwitcher theme={theme} setTheme={setTheme} />
                            <ConnectWallet />
                        </div>
                    </div>
                </nav>

                {/* Main content */}
                <main id="main-content" tabIndex={-1}>
                    <Routes>
                        <Route path="/manifesto" element={<Manifesto />} />
                        <Route path="/" element={<Home />} />
                        <Route path="*" element={<Home />} />
                    </Routes>
                </main>

                <ActivityLayer />
            </BrowserRouter>
        </TezosProvider>
        </ErrorBoundary>
    );
}
