/**
 * Helpers for Teztree profiles.
 * Specification: https://www.teztree.com/brand
 */

/** Strip leading URL prefix, @, and trailing slash to extract the handle. */
export function cleanTezTreeHandle(raw: string | undefined): string {
	if (!raw) return "";
	return raw
		.trim()
		.replace(/^https?:\/\/(www\.)?teztree\.com\//i, "")
		.replace(/^@+/, "")
		.replace(/\/+$/, "");
}

/** Canonical URL for a user's page on Teztree: https://www.teztree.com/:handle */
export function teztreeProfileUrl(raw: string | undefined): string | null {
	const cleaned = cleanTezTreeHandle(raw);
	if (!cleaned) return null;
	return `https://www.teztree.com/${cleaned}`;
}
