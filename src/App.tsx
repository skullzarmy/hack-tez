/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
/** biome-ignore-all lint/a11y/useSemanticElements: <I said so> */
import { useState, useEffect, Component, lazy, Suspense, type ReactNode, type ErrorInfo } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { TezosProvider, useTezos } from "./context/TezosContext";
import { OnboardingProvider } from "./context/OnboardingContext";
import { Menu, X, Sun, Moon, Cpu } from "lucide-react";
import ConnectWallet from "./components/ConnectWallet";
import ConnectHint from "./components/onboarding/ConnectHint";
import {
    AnimatedIcon,
    StateAnimatedIcon,
    LazyMenuIcon,
    LazySunIcon,
    LazyMoonIcon,
    LazyCpuIcon,
    useAnimatedIconTrigger,
} from "./components/icons/animated";
import ChatHint from "./components/onboarding/ChatHint";
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
const Chat = lazy(() => import("./components/chat/ChatPage"));
const WikiApp = lazy(() => import("./pages/WikiApp"));
const Arcade = lazy(() => import("./pages/Arcade"));
const Labs = lazy(() => import("./pages/Labs"));
const LabDetail = lazy(() => import("./pages/LabDetail"));
const ColdMilk = lazy(() => import("./pages/labs/ColdMilk"));
const Gaspedal = lazy(() => import("./pages/labs/Gaspedal"));
const BulkRelist = lazy(() => import("./pages/labs/BulkRelist"));

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
    const autoTrigger = useAnimatedIconTrigger();
    const darkTrigger = useAnimatedIconTrigger();
    const lightTrigger = useAnimatedIconTrigger();

    return (
        <div className="theme-switcher" role="group" aria-label="Color theme">
            <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === "auto"}
                onClick={() => setTheme("auto")}
                title="Auto (system default)"
                aria-label="Auto"
                {...autoTrigger.handlers}
            >
                <AnimatedIcon
                    ref={autoTrigger.iconRef}
                    Lazy={LazyCpuIcon}
                    fallback={<Cpu size={14} aria-hidden="true" />}
                    size={14}
                />
            </button>
            <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
                title="Dark mode"
                aria-label="Dark"
                {...darkTrigger.handlers}
            >
                <AnimatedIcon
                    ref={darkTrigger.iconRef}
                    Lazy={LazyMoonIcon}
                    fallback={<Moon size={14} aria-hidden="true" />}
                    size={14}
                />
            </button>
            <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
                title="Light mode"
                aria-label="Light"
                {...lightTrigger.handlers}
            >
                <AnimatedIcon
                    ref={lightTrigger.iconRef}
                    Lazy={LazySunIcon}
                    fallback={<Sun size={14} aria-hidden="true" />}
                    size={14}
                />
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
                    HACK<span className="dot-tez">TEZ</span>
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
                            <StateAnimatedIcon
                                Lazy={LazyMenuIcon}
                                active={open}
                                fallback={<Menu size={24} aria-hidden="true" />}
                                fallbackActive={<X size={24} aria-hidden="true" />}
                                size={24}
                            />
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
                                        href="/arcade"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Arcade
                                    </a>
                                    <a
                                        href="/labs"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Labs
                                    </a>
                                    <a
                                        href="/wiki"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Wiki
                                    </a>
                                    <a
                                        href="/hackers"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Hackers
                                    </a>
                                    <a
                                        href="/developers"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Docs
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
                                    <a
                                        href="/manifesto"
                                        role="menuitem"
                                        className="nav-drawer-link"
                                        onClick={() => setOpen(false)}
                                    >
                                        Manifesto
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
    const { domain, restoring } = useTezos();
    const { events, newEvents, isLoading } = useRecentActivity();
    // Only show on the landing page (unauthenticated homepage)
    if (location.pathname !== "/") return null;
    if (domain || restoring) return null;
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
    const location = useLocation();
    const isChat = location.pathname === "/chat";
    const isWiki = location.pathname.startsWith("/wiki");

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
            <main
                id="main-content"
                tabIndex={-1}
                style={isChat
                    ? { flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" as const, overflow: "hidden" }
                    : { flex: "1 0 auto" }
                }
            >
                <Routes>
                    <Route path="/manifesto" element={<Manifesto />} />
                    <Route path="/hackers" element={<Hackers />} />
                    <Route path="/developers" element={<Developers />} />
                    <Route path="/policies" element={<Policies />} />
                    <Route path="/skills/:slug" element={<Suspense fallback={null}><SkillDetail /></Suspense>} />
                    <Route path="/skills" element={<Suspense fallback={null}><Skills /></Suspense>} />
                    <Route path="/u/:subdomain" element={<Suspense fallback={null}><Profile /></Suspense>} />
                    <Route path="/manage" element={<Navigate to="/" replace />} />
                    <Route path="/chat" element={<Suspense fallback={null}><Chat /></Suspense>} />
                    <Route path="/wiki/*" element={<Suspense fallback={null}><WikiApp /></Suspense>} />
                    <Route path="/arcade/*" element={<Suspense fallback={null}><Arcade /></Suspense>} />
                    <Route path="/labs" element={<Suspense fallback={null}><Labs /></Suspense>} />
                    <Route path="/labs/coldmilk" element={<Suspense fallback={null}><ColdMilk /></Suspense>} />
                    <Route path="/labs/gaspedal" element={<Suspense fallback={null}><Gaspedal /></Suspense>} />
                    <Route path="/labs/bulk-relist" element={<Suspense fallback={null}><BulkRelist /></Suspense>} />
                    <Route path="/labs/:slug" element={<Suspense fallback={null}><LabDetail /></Suspense>} />
                    <Route path="/" element={<Home />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </main>

            <ActivityLayer />
            <Footer compact={isChat || isWiki} />
            <ConnectHint />
            <ChatHint />
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <TezosProvider>
                <BrowserRouter>
                    <OnboardingProvider>
                        <AppShell />
                    </OnboardingProvider>
                </BrowserRouter>
            </TezosProvider>
        </ErrorBoundary>
    );
}
