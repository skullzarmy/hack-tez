import { useState, useEffect, useRef, useCallback } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiArticle } from "../../hooks/useWikiApi";
import { useTezos } from "../../context/TezosContext";
import { Clock, Edit3, History, Lock, Tag, Archive } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import Breadcrumbs from "./Breadcrumbs";
import { Hackatar } from "../Hackatar";

interface Props {
  slug: string;
}

export default function ArticleView({ slug }: Props) {
  const api = useWikiApi();
  const { domain } = useTezos();
  const [article, setArticle] = useState<WikiArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const [contributors, setContributors] = useState<string[]>([]);

  const fetchArticle = useCallback(() => {
    api.getArticle(slug).then((data) => {
      setArticle(data);
      hasFetchedRef.current = true;
    }).catch((err) => {
      setError((err as Error).message);
    }).finally(() => setLoading(false));
  }, [slug, api]);

  useEffect(() => {
    hasFetchedRef.current = false;
    setLoading(true);
    setError(null);
    fetchArticle();
  }, [fetchArticle]);

  // Fetch contributors (unique editors) in background without blocking render
  useEffect(() => {
    if (!slug) return;
    api.getRevisions(slug).then((data) => {
      const names = new Set<string>();
      if (article?.author) names.add(article.author);
      if (article?.lastEditor) names.add(article.lastEditor);
      for (const r of data.revisions) names.add(r.editor);
      setContributors(Array.from(names));
    }).catch(() => { /* silent */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, api, article?.author, article?.lastEditor]);

  function labelFromDomain(name: string | null | undefined): string {
    if (!name) return "";
    const i = name.indexOf(".hack.");
    if (i > 0) return name.slice(0, i);
    return name.split(".")[0] ?? name;
  }

  if (loading) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--fg-2)" }}>
        Loading article…
      </div>
    );
  }

  if (error || !article) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "1rem",
            color: "var(--err, #ff6b6b)",
            marginBottom: "0.5rem",
          }}
        >
          // ARTICLE NOT FOUND
        </h2>
        <p style={{ color: "var(--fg-2)", fontSize: "0.9rem" }}>
          {error ?? "This article doesn't exist yet."}
        </p>
        {domain && (
          <a
            href={`/wiki/new`}
            style={{
              display: "inline-block",
              marginTop: "1rem",
              padding: "0.6rem 1.2rem",
              background: "var(--fg)",
              color: "var(--bg)",
              textDecoration: "none",
              fontFamily: "var(--font-mono)",
              fontSize: "0.85rem",
              fontWeight: 700,
            }}
          >
            Create this article
          </a>
        )}
      </div>
    );
  }

  const isLocked = article.status === "locked";
  const isArchived = article.status === "archived";

  return (
    <article
      className="wiki-article"
      itemScope
      itemType="https://schema.org/Article"
      style={{
        fontFamily: "var(--font)",
        padding: "clamp(1.5rem, 4vw, 3rem) 0",
      }}
    >
      <div className="container" style={{ maxWidth: "800px", margin: "0 auto", padding: "0 1rem" }}>
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: "Wiki", href: "/wiki" },
            ...(article.category ? [{ label: article.category.name, href: `/wiki/categories/${article.category.slug}` }] : []),
            { label: article.title },
          ]}
        />

        {/* Archived banner */}
        {isArchived && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              background: "var(--err-bg, rgba(255, 107, 107, 0.1))",
              border: "1px solid var(--err, rgba(255, 107, 107, 0.3))",
              borderRadius: "0",
              marginBottom: "1.5rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.85rem",
              color: "var(--err, #ff6b6b)",
              textTransform: "uppercase",
            }}
          >
            <Archive size={16} />
            <span>
              <strong>ARCHIVED:</strong> This article is soft-deleted and hidden from the public wiki.
            </span>
          </div>
        )}

        {/* Lock banner */}
        {isLocked && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              background: "var(--info-bg, rgba(255, 186, 8, 0.1))",
              border: "1px solid var(--info, rgba(255, 186, 8, 0.3))",
              marginBottom: "1.5rem",
              fontSize: "0.85rem",
              color: "var(--info, #ffba08)",
            }}
          >
            <Lock size={16} />
            <span>
              This article is locked{article.lockReason ? `: ${article.lockReason}` : "."}
              {article.lockExpires && (
                <span style={{ opacity: 0.7 }}> (expires {new Date(article.lockExpires).toLocaleString()})</span>
              )}
            </span>
          </div>
        )}

        {/* Title */}
        <h1
          itemProp="headline"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: "0.75rem",
            lineHeight: 1.2,
          }}
        >
          {article.title}
        </h1>

        {/* Meta line */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1.5rem",
            fontSize: "0.78rem",
            color: "var(--fg-2)",
            fontFamily: "var(--font-mono)",
            marginBottom: "1.5rem",
            paddingBottom: "1.5rem",
            borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
        >
          <span itemProp="author" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            {article.author && (
              <Hackatar label={labelFromDomain(article.author)} size={18} animated={false} />
            )}
            {article.author}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Clock size={12} />
            <time itemProp="dateModified" dateTime={article.updatedAt}>
              {new Date(article.updatedAt).toLocaleDateString()}
            </time>
          </span>
          <span>rev {article.revision}</span>
          {article.category && (
            <a
              href={`/wiki/categories/${article.category.slug}`}
              style={{ color: "var(--accent, #00ffc8)", textDecoration: "none" }}
            >
              {article.category.name}
            </a>
          )}
        </div>

        {/* Summary */}
        {article.summary && (
          <p
            itemProp="description"
            style={{
              fontSize: "1.05rem",
              lineHeight: 1.7,
              color: "var(--fg-2)",
              marginBottom: "2rem",
              fontStyle: "italic",
            }}
          >
            {article.summary}
          </p>
        )}

        {/* Article content — rendered from markdown for now, BlockNote viewer later */}
        <div
          itemProp="articleBody"
          className="wiki-content prose prose-invert"
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.8,
            color: "var(--fg)",
            maxWidth: "none",
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {article.markdown}
          </ReactMarkdown>
        </div>

        {/* Contributors */}
        {contributors.length > 0 && (
          <section style={{ marginTop: "2rem" }}>
            <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fg-3)", marginBottom: "0.6rem" }}>
              // CONTRIBUTORS
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
              {contributors.map((name) => (
                <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.5rem", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
                  <Hackatar label={labelFromDomain(name)} size={18} animated={false} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{name}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tags */}
        {(article.tags?.length ?? 0) > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginTop: "2.5rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
            }}
          >
            <Tag size={14} style={{ color: "var(--fg-2)", marginTop: "0.2rem" }} />
            {article.tags.map((tag) => (
              <a
                key={tag.slug}
                href={`/wiki/tag/${tag.slug}`}
                style={{
                  padding: "0.25rem 0.6rem",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--fg-3)",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  transition: "border-color 0.2s",
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--info)"}
                onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border)"}
              >
                {tag.name}
              </a>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginTop: "2rem",
            flexWrap: "wrap",
          }}
        >
          {domain && !isLocked && (
            <a
              href={`/wiki/${article.slug}/edit`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.75rem 1.5rem",
                background: "var(--fg)",
                color: "var(--bg)",
                border: "1px solid var(--fg)",
                textDecoration: "none",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              <Edit3 size={14} /> Edit
            </a>
          )}
          <a
            href={`/wiki/${article.slug}/history`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.75rem 1.5rem",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              textDecoration: "none",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              letterSpacing: "0.08em",
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--info)"}
            onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border)"}
          >
            <History size={14} /> History
          </a>
        </div>
      </div>

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.summary,
            author: { "@type": "Person", name: article.author },
            datePublished: article.createdAt,
            dateModified: article.updatedAt,
            url: `https://hacktez.com/wiki/${article.slug}`,
            publisher: {
              "@type": "Organization",
              name: "hack.tez Wiki",
              url: "https://hacktez.com/wiki",
            },
          }),
        }}
      />
    </article>
  );
}
