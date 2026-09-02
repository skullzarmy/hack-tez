import { useState, useEffect, useRef } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiArticleSummary, WikiCategory } from "../../hooks/useWikiApi";
import { useWikiSearch } from "../../hooks/useWikiSearch";
import { useTezos } from "../../context/TezosContext";
import { Search, BookOpen, Clock, Users, TrendingUp, PenLine, Shield, Settings } from "lucide-react";
import WikiAvatar from "./WikiAvatar";
import { usePageMeta } from "../../hooks/usePageMeta";

type WikiStats = { articles: number; contributors: number; revisions: number };

/** Reads a named array off an untyped API payload, or [] if it isn't one. */
function arrayField<T>(payload: unknown, key: string): T[] {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function isStats(payload: unknown): payload is WikiStats {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).articles === "number"
  );
}

export default function WikiHome() {
  usePageMeta({
    title: "Wiki — Community knowledge base — hack.tez",
    description:
      "The hack.tez community wiki. Articles, guides, and shared knowledge for builders, artists, and tezonians on Tezos. Edit by signing with your wallet.",
    path: "/wiki",
  });
  const api = useWikiApi();
  const { domain, isAdmin } = useTezos();
  const { query, results, loading: searchLoading, search, clear } = useWikiSearch();

  const [recent, setRecent] = useState<WikiArticleSummary[]>([]);
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [stats, setStats] = useState<WikiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    Promise.all([
      api.getRecent(12),
      api.listCategories(),
      api.getStats(),
    ]).then(([recentData, catData, statsData]) => {
      // Be defensive: these come off the network, so check before trusting.
      setRecent(arrayField<WikiArticleSummary>(recentData, "articles"));
      setCategories(arrayField<WikiCategory>(catData, "categories"));
      setStats(isStats(statsData) ? statsData : null);
    }).catch(() => {
      // Silent fail on initial load
    }).finally(() => setLoading(false));
  }, [api]);

  const isSearching = query.trim().length >= 2;

  return (
    <div className="wiki-home" style={{ fontFamily: "var(--font)", padding: "clamp(1.5rem, 4vw, 3rem) 0" }}>
      <div className="container" style={{ maxWidth: "960px", margin: "0 auto", padding: "0 1rem" }}>

        {/* Hero */}
        <header style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h1
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(1.75rem, 5vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: "0.75rem",
              textTransform: "uppercase"
            }}
          >
            // HACK<span className="dot-tez">TEZ</span> WIKI
          </h1>
          <p
            style={{
              color: "var(--fg-2)",
              fontSize: "clamp(0.875rem, 2vw, 1.05rem)",
              maxWidth: "520px",
              margin: "0 auto 2.5rem",
              lineHeight: 1.7,
            }}
          >
            Community knowledge base for Tezos.
            <br />
            All Hack.tez holders can contribute.
          </p>

          {/* Search bar */}
          <div
            style={{
              position: "relative",
              maxWidth: "540px",
              margin: "0 auto",
            }}
          >
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--fg-3)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              placeholder="SEARCH ARTICLES…"
              value={query}
              onChange={(e) => search(e.target.value)}
              style={{
                width: "100%",
                padding: "1rem 1rem 1rem 3rem",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.9rem",
                letterSpacing: "0.05em",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--info)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
            {query && (
              <button
                type="button"
                onClick={clear}
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-2)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8rem",
                  padding: "0.2rem 0.5rem"
                }}
              >
                CLEAR
              </button>
            )}
          </div>
        </header>

        {/* Search results overlay */}
        {isSearching && (
          <section style={{ marginBottom: "3rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--fg-3)",
                marginBottom: "1rem",
              }}
            >
              // {searchLoading ? "SEARCHING…" : `${results.length} RESULT${results.length !== 1 ? "S" : ""}`}
            </h2>
            {(results?.length ?? 0) > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
                      transition: "border-color 0.2s, background 0.2s",
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--info)"}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                  >
                    <strong style={{ fontSize: "1rem", fontFamily: "var(--font-mono)" }}>{r.title}</strong>
                    {r.excerpt && (
                      <p
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--fg-2)",
                          marginTop: "0.5rem",
                          lineHeight: 1.6,
                        }}
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: wiki search escapes the excerpt server-side and re-inserts only <mark>, see renderExcerpt in wiki.mts
                        dangerouslySetInnerHTML={{ __html: r.excerpt }}
                      />
                    )}
                  </a>
                ))}
              </div>
            ) : !searchLoading ? (
              <div style={{ padding: "1.5rem", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--fg-3)", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
                NO ARTICLES FOUND.
              </div>
            ) : null}
          </section>
        )}

        {/* Action bar for authenticated users */}
        {!isSearching && domain && (
          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginBottom: "3rem", flexWrap: "wrap" }}>
            <a href="/wiki/new" style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1.5rem", background: "var(--fg)", color: "var(--bg)", border: "1px solid var(--fg)", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              <PenLine size={14} /> NEW ARTICLE
            </a>
            <a href="/wiki/mod" style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1.5rem", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--fg)", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              <Shield size={14} /> MODERATION
            </a>
            {isAdmin && (
              <a href="/wiki/admin" style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1.5rem", background: "var(--bg)", border: "1px solid var(--info)", color: "var(--info)", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
                <Settings size={14} /> ADMIN
              </a>
            )}
          </div>
        )}

        {/* Stats bar */}
        {!isSearching && stats && (
          <div
            style={{
              display: "flex",
              gap: "2rem",
              justifyContent: "center",
              marginBottom: "3rem",
              flexWrap: "wrap",
              borderTop: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              padding: "1.5rem 0"
            }}
          >
            {[
              { icon: BookOpen, label: "ARTICLES", value: stats.articles },
              { icon: Users, label: "CONTRIBUTORS", value: stats.contributors },
              { icon: TrendingUp, label: "REVISIONS", value: stats.revisions },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.75rem",
                  color: "var(--fg-3)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em"
                }}
              >
                <Icon size={14} />
                <span style={{ color: "var(--fg)", fontSize: "1rem" }}>
                  {value}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Categories grid */}
        {!isSearching && (categories?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "3rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--fg-3)",
                marginBottom: "1.5rem",
              }}
            >
              // CATEGORIES
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`/wiki/categories/${cat.slug}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    padding: "1.25rem",
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    textDecoration: "none",
                    color: "var(--fg)",
                    transition: "border-color 0.2s",
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--info)"}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                    <strong style={{ fontSize: "1rem", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>{cat.name}</strong>
                    <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>
                      {cat.articleCount ?? 0}
                    </span>
                  </div>
                  {cat.description && (
                    <span style={{ fontSize: "0.75rem", color: "var(--fg-3)", lineHeight: 1.5 }}>
                      {cat.description}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Recent articles */}
        {!isSearching && (
          <section>
            <h2
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--fg-3)",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Clock size={16} />
              RECENT UPDATES
            </h2>

            {loading ? (
              <p style={{ color: "var(--fg-3)", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>LOADING...</p>
            ) : recent.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem 1rem",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-3)",
                }}
              >
                <p style={{ fontSize: "0.85rem", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>NO ARTICLES FOUND.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {recent.map((article) => (
                  <a
                    key={article.slug}
                    href={`/wiki/${article.slug}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "1rem",
                      padding: "1rem 1.25rem",
                      background: "var(--bg-3)",
                      border: "1px solid var(--border)",
                      textDecoration: "none",
                      color: "var(--fg)",
                      transition: "border-color 0.2s",
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--info)"}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 250px" }}>
                      <strong style={{ fontSize: "1rem", fontFamily: "var(--font-mono)" }}>{article.title}</strong>
                      {article.summary && (
                        <p
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--fg-2)",
                            marginTop: "0.4rem",
                            lineHeight: 1.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {article.summary}
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        flexShrink: 0,
                        fontSize: "0.75rem",
                        color: "var(--fg-3)",
                        fontFamily: "var(--font-mono)",
                        whiteSpace: "nowrap",
                        padding: "0.25rem 0.5rem",
                        background: "var(--bg)",
                        border: "1px solid var(--border)"
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        <WikiAvatar label={(article.lastEditor?.split(".")[0]) ?? ""} size={16} animated={false} />
                        {article.lastEditor}
                      </span>
                      <span style={{ opacity: 0.5, margin: "0 0.3rem" }}>|</span>
                      REV {article.revision}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
