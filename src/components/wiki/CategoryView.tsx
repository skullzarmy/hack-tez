import { useState, useEffect, useRef } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiArticleSummary, WikiCategory } from "../../hooks/useWikiApi";
import { Hackatar } from "../Hackatar";
import Breadcrumbs from "./Breadcrumbs";

interface Props {
  slug: string;
}

export default function CategoryView({ slug }: Props) {
  const api = useWikiApi();
  const [category, setCategory] = useState<WikiCategory | null>(null);
  const [articles, setArticles] = useState<WikiArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    Promise.all([
      api.listCategories(),
      api.listArticles({ category: slug, limit: 50 }),
    ])
      .then(([catData, artData]) => {
        const found = catData.categories.find((c) => c.slug === slug);
        if (!found) {
          setError("Category not found.");
        } else {
          setCategory(found);
          setArticles(artData.articles);
        }
      })
      .catch(() => setError("Failed to load category."))
      .finally(() => setLoading(false));
  }, [slug, api]);

  if (loading) {
    return <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>LOADING...</div>;
  }

  if (error || !category) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--err, #ff6b6b)", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
        {error || "CATEGORY NOT FOUND"}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font)", padding: "clamp(1.5rem, 4vw, 3rem) 0" }}>
      <div className="container" style={{ maxWidth: "800px", margin: "0 auto", padding: "0 1rem" }}>
        <Breadcrumbs items={[{ label: "Wiki", href: "/wiki" }, { label: category.name }]} />

        <header style={{ marginTop: "1.5rem", marginBottom: "3rem" }}>
          <h1
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: "0.5rem"
            }}
          >
            // {category.name}
          </h1>
          {category.description && (
            <p style={{ color: "var(--fg-2)", fontSize: "0.95rem", lineHeight: 1.6 }}>
              {category.description}
            </p>
          )}
        </header>

        <section>
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
            // ARTICLES
          </h2>

          {(articles?.length ?? 0) === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 1rem",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                color: "var(--fg-3)",
              }}
            >
              <p style={{ fontSize: "0.85rem", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>NO ARTICLES FOUND IN THIS CATEGORY.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {articles.map((article) => (
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
                      <Hackatar label={(article.author?.split(".")[0]) ?? ""} size={16} animated={false} />
                      {article.author}
                    </span>
                    <span style={{ opacity: 0.5, margin: "0 0.3rem" }}>|</span>
                    REV {article.revision}
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
