import { useState, useCallback, useRef, useEffect } from "react";
import type { WikiSearchResult } from "./useWikiApi";
import wikiUrl from "../config/wiki";

const DEBOUNCE_MS = 300;

export function useWikiSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikiSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedRef = useRef(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Only show loading on first search
    if (!hasFetchedRef.current) setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${wikiUrl}/search?${new URLSearchParams({ q: q.trim() })}`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json() as { results: WikiSearchResult[] };
      setResults(data.results);
      hasFetchedRef.current = true;
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback(
    (q: string) => {
      setQuery(q);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => doSearch(q), DEBOUNCE_MS);
    },
    [doSearch],
  );

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setError(null);
    hasFetchedRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return { query, results, loading, error, search, clear };
}
