/**
 * Helpers for TezCity profiles and Share to TezCity browser URL intent.
 * Specification: https://tezcity.com/developers/share
 */

/** Strip leading URL prefix, @, and trailing slash to extract the handle / .tez domain. */
export function cleanTezCityHandle(raw: string | undefined): string {
	if (!raw) return "";
	return raw
		.trim()
		.replace(/^https?:\/\/tezcity\.com\/u\//i, "")
		.replace(/^@+/, "")
		.replace(/\/+$/, "");
}

/** Canonical URL for a user's profile on TezCity: https://tezcity.com/u/:handle */
export function tezcityProfileUrl(raw: string | undefined): string | null {
	const cleaned = cleanTezCityHandle(raw);
	if (!cleaned) return null;
	return `https://tezcity.com/u/${cleaned}`;
}

export interface TezCityShareParams {
	text?: string;
	url?: string;
	hashtags?: string;
}

/**
 * Builds an intent URL for TezCity (https://tezcity.com/intent/post).
 * Uses URLSearchParams for proper URL encoding as specified in the docs.
 */
export function buildTezCityShareIntentUrl(params: TezCityShareParams): string {
	const intent = new URL("https://tezcity.com/intent/post");
	const search = new URLSearchParams();

	if (params.text?.trim()) {
		search.set("text", params.text.trim());
	}
	if (params.url?.trim()) {
		search.set("url", params.url.trim());
	}
	if (params.hashtags?.trim()) {
		search.set("hashtags", params.hashtags.trim());
	}

	intent.search = search.toString();
	return intent.toString();
}
