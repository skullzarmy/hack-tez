import { useEffect } from "react";
import { applyPageMeta, type PageMeta } from "../lib/pageMeta";

/**
 * Update <title> and meta tags for the current page.
 * Pass a stable object or memoize fields that change to avoid unnecessary work.
 */
export function usePageMeta(meta: PageMeta | null | undefined): void {
    const title = meta?.title;
    const description = meta?.description;
    const path = meta?.path;
    const image = meta?.image;

    useEffect(() => {
        if (!title || !description || !path) return;
        applyPageMeta({ title, description, path, image });
    }, [title, description, path, image]);
}
