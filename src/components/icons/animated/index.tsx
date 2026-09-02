import type * as React from "react";
import { Component, lazy, Suspense, forwardRef, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";

import type { AnimatedIconHandle } from "./users";
export type { AnimatedIconHandle } from "./users";

/* ── Lazy bundles (Motion only loads when these mount) ──────────────── */

export const LazyUsersIcon = lazy(() =>
    import("./users").then((m) => ({ default: m.UsersIcon })),
);
export const LazyMessageCircleIcon = lazy(() =>
    import("./message-circle").then((m) => ({ default: m.MessageCircleIcon })),
);
export const LazyFlaskIcon = lazy(() =>
    import("./flask").then((m) => ({ default: m.FlaskIcon })),
);
export const LazyBookTextIcon = lazy(() =>
    import("./book-text").then((m) => ({ default: m.BookTextIcon })),
);
export const LazyChessKnightIcon = lazy(() =>
    import("./chess-knight").then((m) => ({ default: m.ChessKnightIcon })),
);
export const LazyEyeIcon = lazy(() =>
    import("./eye").then((m) => ({ default: m.EyeIcon })),
);
export const LazySquarePenIcon = lazy(() =>
    import("./square-pen").then((m) => ({ default: m.SquarePenIcon })),
);
export const LazyLinkIcon = lazy(() =>
    import("./link").then((m) => ({ default: m.LinkIcon })),
);
export const LazyArrowDownIcon = lazy(() =>
    import("./arrow-down").then((m) => ({ default: m.ArrowDownIcon })),
);
export const LazyArrowUpIcon = lazy(() =>
    import("./arrow-up").then((m) => ({ default: m.ArrowUpIcon })),
);
export const LazyBellIcon = lazy(() =>
    import("./bell").then((m) => ({ default: m.BellIcon })),
);
export const LazyRefreshCwIcon = lazy(() =>
    import("./refresh-cw").then((m) => ({ default: m.RefreshCwIcon })),
);
export const LazyMenuIcon = lazy(() =>
    import("./menu").then((m) => ({ default: m.MenuIcon })),
);
export const LazySunIcon = lazy(() =>
    import("./sun").then((m) => ({ default: m.SunIcon })),
);
export const LazyMoonIcon = lazy(() =>
    import("./moon").then((m) => ({ default: m.MoonIcon })),
);
export const LazyCpuIcon = lazy(() =>
    import("./cpu").then((m) => ({ default: m.CpuIcon })),
);
export const LazyDownloadIcon = lazy(() =>
    import("./download").then((m) => ({ default: m.DownloadIcon })),
);

/* ── Error boundary: if the chunk 404s or throws, render the static icon ─ */

class IconErrorBoundary extends Component<
    { fallback: ReactNode; children: ReactNode },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch(error: unknown) {
        if (import.meta.env.DEV) console.warn("[AnimatedIcon] failed to load:", error);
    }
    render() {
        if (this.state.failed) return this.props.fallback;
        return this.props.children;
    }
}

/* ── Wrapper ──────────────────────────────────────────────────────────

   Renders the lazy animated icon when motion is allowed, otherwise the
   static lucide fallback. Forwards a ref so a parent (button, link) can
   trigger the animation on hover/focus — the imperative handle is a
   no-op when reduced motion is active or the chunk fails.

────────────────────────────────────────────────────────────────────── */

type AnimatedIconComponent = React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & { size?: number } & React.RefAttributes<AnimatedIconHandle>
>;

type LazyIconComponent = React.LazyExoticComponent<AnimatedIconComponent>;

interface AnimatedIconProps {
    Lazy: LazyIconComponent;
    fallback: ReactNode;
    size?: number;
    className?: string;
}

export const AnimatedIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
    ({ Lazy, fallback, size, className }, ref) => {
        const reduced = usePrefersReducedMotion();

        if (reduced) return <>{fallback}</>;

        return (
            <IconErrorBoundary fallback={fallback}>
                <Suspense fallback={fallback}>
                    <Lazy ref={ref} size={size} className={className} />
                </Suspense>
            </IconErrorBoundary>
        );
    },
);

AnimatedIcon.displayName = "AnimatedIcon";

/* ── StateAnimatedIcon ─────────────────────────────────────────────────

   For icons whose animation maps to a boolean state (menu open/closed,
   playing/paused, etc.) rather than hover. The icon plays its "animate"
   variant whenever `active` is true and reverts to "normal" when false.

   A callback ref re-applies the current `active` whenever the inner
   handle attaches — handles the lazy-load case where `active` may
   already be true before the chunk resolves.

   Under prefers-reduced-motion, renders `fallbackActive` when active,
   otherwise `fallback`. This preserves the visual state change for
   reduced-motion users (e.g. hamburger → X) without animating.

────────────────────────────────────────────────────────────────────── */

interface StateAnimatedIconProps {
    Lazy: LazyIconComponent;
    fallback: ReactNode;
    fallbackActive?: ReactNode;
    active: boolean;
    size?: number;
    className?: string;
}

export function StateAnimatedIcon({
    Lazy,
    fallback,
    fallbackActive,
    active,
    size,
    className,
}: StateAnimatedIconProps) {
    const reduced = usePrefersReducedMotion();

    const setIconRef = useCallback(
        (node: AnimatedIconHandle | null) => {
            if (!node) return;
            if (active) node.startAnimation();
            else node.stopAnimation();
        },
        [active],
    );

    if (reduced) return <>{active ? (fallbackActive ?? fallback) : fallback}</>;

    return (
        <IconErrorBoundary fallback={active ? (fallbackActive ?? fallback) : fallback}>
            <Suspense fallback={active ? (fallbackActive ?? fallback) : fallback}>
                <Lazy ref={setIconRef} size={size} className={className} />
            </Suspense>
        </IconErrorBoundary>
    );
}

/* ── useAnimatedIconTrigger ───────────────────────────────────────────

   Helper for attaching hover + focus handlers to a parent button/link
   so the inner AnimatedIcon plays on the whole control, not just the
   icon's small hit area. onFocus/onBlur are bundled so keyboard users
   get parity with mouse users (WCAG 2.4.7 / 1.4.13).

────────────────────────────────────────────────────────────────────── */

export function useAnimatedIconTrigger() {
    const iconRef = useRef<AnimatedIconHandle>(null);
    const start = useCallback(() => iconRef.current?.startAnimation(), []);
    const stop = useCallback(() => iconRef.current?.stopAnimation(), []);
    const handlers = useMemo(
        () => ({ onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop }),
        [start, stop],
    );
    return { iconRef, handlers };
}
