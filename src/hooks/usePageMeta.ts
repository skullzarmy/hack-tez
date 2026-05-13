import { useEffect, useMemo } from "react";
import { applyPageMeta, type PageMeta } from "../lib/pageMeta";

/**
 * Update <title>, meta tags, and JSON-LD for the current page.
 * Pass a stable object or memoize fields that change to avoid unnecessary work.
 *
 * The structuredData field is compared by JSON value (not reference) so callers
 * can safely build fresh objects on each render without flicker.
 */
export function usePageMeta(meta: PageMeta | null | undefined): void {
    const title = meta?.title;
    const description = meta?.description;
    const path = meta?.path;
    const image = meta?.image;
    const imageAlt = meta?.imageAlt;
    const structuredData = meta?.structuredData;

    const structuredDataKey = useMemo(
        () => (structuredData ? JSON.stringify(structuredData) : ""),
        [structuredData],
    );

    useEffect(() => {
        if (!title || !description || !path) return;
        applyPageMeta({
            title,
            description,
            path,
            image,
            imageAlt,
            structuredData: structuredDataKey ? JSON.parse(structuredDataKey) : undefined,
        });
    }, [title, description, path, image, imageAlt, structuredDataKey]);
}
