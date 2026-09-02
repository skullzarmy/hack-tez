import { useCallback, useState } from "react";

/**
 * Avatar sources, in the order they're tried.
 *
 * The API endpoint proxies whatever the profile points at — an IPFS picture, a
 * gravatar, or a generated hackatar — at its original size. Profile pictures
 * routinely run into the megabytes, which is a lot to download to paint a 32px
 * circle, so we ask Netlify's Image CDN to resize it first.
 *
 * The CDN only exists under `netlify dev` and in production; under plain `vite`
 * the request 404s. That's why `useAvatarSrc` falls back to the raw endpoint
 * before giving up and letting the caller render a <Hackatar>.
 */

/** Widths we're willing to request, so the derivative cache stays small. */
const WIDTH_STEPS = [32, 64, 128, 256, 512];

/** Retina without asking for a 4x derivative nobody can see. */
const MAX_PIXEL_RATIO = 2;

export function avatarEndpoint(label: string): string {
	return `/api/v1/avatar/${encodeURIComponent(label)}`;
}

/** Square webp derivative at the given pixel width, snapped to a cache step. */
export function avatarThumbnail(label: string, pixelWidth: number): string {
	const width =
		WIDTH_STEPS.find((step) => step >= pixelWidth) ?? WIDTH_STEPS.at(-1);
	const source = encodeURIComponent(avatarEndpoint(label));
	return `/.netlify/images?url=${source}&w=${width}&h=${width}&fit=cover&fm=webp`;
}

/** CSS pixels the element occupies → device pixels we should request for it. */
function devicePixels(cssSize: number): number {
	const ratio =
		typeof window === "undefined"
			? MAX_PIXEL_RATIO
			: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
	return Math.ceil(cssSize * ratio);
}

/**
 * Resolves an avatar to the smallest source that actually loads.
 *
 * Returns `src: null` once every source has failed, which is the caller's cue
 * to render a <Hackatar> instead.
 */
export function useAvatarSrc(
	label: string,
	size: number,
): { src: string | null; onError: () => void } {
	const [stage, setStage] = useState<"thumbnail" | "original" | "failed">(
		"thumbnail",
	);
	// A list can reuse this instance for a different member; without resetting,
	// one broken avatar would poison whoever scrolls into its slot next.
	const [seen, setSeen] = useState(label);
	if (seen !== label) {
		setSeen(label);
		setStage("thumbnail");
	}

	const onError = useCallback(() => {
		setStage((current) => (current === "thumbnail" ? "original" : "failed"));
	}, []);

	if (stage === "failed") return { src: null, onError };
	return {
		src:
			stage === "thumbnail"
				? avatarThumbnail(label, devicePixels(size))
				: avatarEndpoint(label),
		onError,
	};
}
