import { useWikiSearch } from "../../hooks/useWikiSearch";
import { Search } from "lucide-react";

export default function WikiSearch() {
  const { query, results, loading, error, search } = useWikiSearch();

  // Extract query from URL on mount
  const urlParams = new URLSearchParams(window.location.search);
  const initialQ = urlParams.get("q") ?? "";

  // Trigger search if URL has a query
  if (initialQ && !query) {
    search(initialQ);
  }

  return (
    <div style={{ fontFamily: "var(--font)", padding: "clamp(1.5rem, 4vw, 3rem) 0" }}>
      <div className="container" style={{ maxWidth: "800px", margin: "0 auto", padding: "0 1rem" }}>
        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: "2rem" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "1rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--fg-2, rgba(255,255,255,0.4))",
              pointerEvents: "none",
            }}
          />
          <input
            type="search"
            placeholder="Search wiki…"
            defaultValue={initialQ}
            onChange={(e) => search(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: the field is the reason the dialog opened, so focusing it on open is the expected behaviour
            autoFocus
            style={{
              width: "100%",
              padding: "0.85rem 1rem 0.85rem 2.75rem",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-mono)",
              fontSize: "1rem",
              outline: "none",
            }}
          />
        </div>

        {/* Results */}
        {error && (
          <p style={{ color: "var(--err, #ff6b6b)", fontSize: "0.9rem" }}>{error}</p>
        )}

        {loading && (
          <p style={{ color: "var(--fg-2)", fontSize: "0.9rem" }}>Searching…</p>
        )}

        {!loading && query.trim().length >= 2 && (results?.length ?? 0) === 0 && (
          <p style={{ color: "var(--fg-2)", fontSize: "0.9rem" }}>
            No results found for &ldquo;{query}&rdquo;
          </p>
        )}

        {(results?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--fg-2)",
              }}
            >
              {(results?.length ?? 0)} result{(results?.length ?? 0) !== 1 ? "s" : ""}
            </p>
            {results.map((r) => (
              <a
                key={r.slug}
                href={`/wiki/${r.slug}`}
                style={{
                  display: "block",
                  padding: "1rem 1.25rem",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  textDecoration: "none",
                  color: "var(--fg)",
                  transition: "border-color 0.2s",
                }}
              >
                <strong style={{ fontSize: "1rem" }}>{r.title}</strong>
                {r.excerpt && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--fg-2)",
                      marginTop: "0.35rem",
                      lineHeight: 1.5,
                    }}
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: wiki search escapes the excerpt server-side and re-inserts only <mark>, see renderExcerpt in wiki.mts
                        dangerouslySetInnerHTML={{ __html: r.excerpt }}
                  />
                )}
                <div style={{ fontSize: "0.7rem", color: "var(--fg-2)", marginTop: "0.4rem", fontFamily: "var(--font-mono)" }}>
                  {r.author} · {new Date(r.updatedAt).toLocaleDateString()}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
