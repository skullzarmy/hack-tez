/**
 * <Hackatar /> — server-rendered generative identity for hack.tez domains.
 *
 * Static mode (default): shows single-frame GIF, animates on hover.
 * Animated mode: shows animated GIF (auto-plays in browser).
 *
 * Images are served from /api/v1/hackatar/:label (animated) and
 * /api/v1/hackatar/:label?static=1 (first frame). In the current
 * phase-1 implementation, generation is deterministic from the provided
 * label via the server's salted label-based seed; it does not resolve
 * the label to an opHash.
 */
import { useState, useEffect, useRef } from "react";

interface HackatarProps {
  /** Domain label forwarded to the salted label-seeded generation endpoint */
  label: string;
  /** CSS display size in pixels */
  size: number;
  /** Continuously animate (true for profile, false for grids) */
  animated?: boolean;
  /** Whether hovering plays animation when not in animated mode (default true) */
  hoverAnimate?: boolean;
  /** External playing state — overrides internal hover (e.g. parent card hover) */
  playing?: boolean;
  /** Additional CSS class */
  className?: string;
  /** border-radius override (default "50%") */
  borderRadius?: string;
}

export function Hackatar({
  label,
  size,
  animated = false,
  hoverAnimate = true,
  playing,
  className,
  borderRadius = "50%",
}: HackatarProps) {
  const [hovering, setHovering] = useState(false);
  const [gifReady, setGifReady] = useState(false);
  const preloadRef = useRef<HTMLImageElement | null>(null);

  const encodedLabel = encodeURIComponent(label);
  const staticUrl = `/api/v1/hackatar/${encodedLabel}?static=1`;
  const animatedUrl = `/api/v1/hackatar/${encodedLabel}`;

  // Preload animated GIF in background once the element is near-viewport
  const containerRef = useRef<HTMLImageElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || animated) return; // always-animated mode doesn't need lazy preload

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }, // start preloading 200px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animated]);

  useEffect(() => {
    if (animated || !isNearViewport) return;

    let cancelled = false;
    setGifReady(false);

    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setGifReady(true);
      }
    };
    img.src = animatedUrl;
    preloadRef.current = img;

    return () => {
      cancelled = true;
      img.onload = null;
      preloadRef.current = null;
    };
  }, [animatedUrl, animated, isNearViewport]);

  // External `playing` prop takes priority, then self-hover
  const wantsAnimate = animated || playing === true || (playing === undefined && hoverAnimate && hovering);
  const showAnimated = wantsAnimate && (animated || gifReady);

  return (
    <img
      ref={containerRef}
      src={showAnimated ? animatedUrl : staticUrl}
      alt={`${label} hackatar`}
      loading="lazy"
      className={className}
      onMouseEnter={playing === undefined ? () => setHovering(true) : undefined}
      onMouseLeave={playing === undefined ? () => setHovering(false) : undefined}
      style={{
        width: size,
        height: size,
        borderRadius,
        imageRendering: "pixelated",
        flexShrink: 0,
        objectFit: "cover",
        backgroundColor: "#000",
      }}
    />
  );
}
