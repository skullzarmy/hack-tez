import { useState, useEffect, useRef } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiRevisionFull } from "../../hooks/useWikiApi";
import { Clock, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Props {
  slug: string;
  revision: string;
}

export default function ArticleRevisionView({ slug, revision }: Props) {
  const api = useWikiApi();
  const [rev, setRev] = useState<WikiRevisionFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    hasFetchedRef.current = false;
    setLoading(true);
    setError(null);

    api.getRevision(slug, Number(revision)).then((data) => {
      setRev(data);
      hasFetchedRef.current = true;
    }).catch((err) => {
      setError((err as Error).message);
    }).finally(() => setLoading(false));
  }, [slug, revision, api]);

  if (loading) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--fg-2)" }}>
        Loading revision…
      </div>
    );
  }

  if (error || !rev) {
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
          // REVISION NOT FOUND
        </h2>
        <p style={{ color: "var(--fg-2)", fontSize: "0.9rem" }}>
          {error ?? "This revision doesn't exist."}
        </p>
        <a
          href={`/wiki/${slug}/history`}
          style={{
            display: "inline-block",
            marginTop: "1rem",
            padding: "0.6rem 1.2rem",
            background: "var(--bg-3)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
            fontWeight: 700,
          }}
        >
          Return to History
        </a>
      </div>
    );
  }

  return (
    <article
      className="wiki-article"
      style={{
        fontFamily: "var(--font)",
        padding: "clamp(1.5rem, 4vw, 3rem) 0",
      }}
    >
      <div className="container" style={{ maxWidth: "800px", margin: "0 auto", padding: "0 1rem" }}>

        {/* Warning banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem 1.5rem",
            background: "var(--warn-bg, rgba(255, 209, 102, 0.08))",
            border: "1px solid var(--warn, #ffd166)",
            color: "var(--warn, #ffd166)",
            marginBottom: "2rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}
        >
          <AlertTriangle size={16} />
          <div>
            <span style={{ display: "block" }}>YOU ARE VIEWING A HISTORIC REVISION (REV {rev.revision}).</span>
            <a href={`/wiki/${slug}`} style={{ color: "var(--fg)", textDecoration: "underline", marginTop: "0.25rem", display: "inline-block" }}>
              Return to current version
            </a>
          </div>
        </div>

        <a
          href={`/wiki/${slug}/history`}
          style={{
            display: "inline-block",
            marginBottom: "2rem",
            color: "var(--fg-3)",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            textTransform: "uppercase"
          }}
        >
          ← Back to History
        </a>

        <h1
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: "0.75rem",
            lineHeight: 1.2,
          }}
        >
          {rev.title}
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
          <span>{rev.editor}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Clock size={12} />
            <time>
              {new Date(rev.createdAt).toLocaleString()}
            </time>
          </span>
          <span>rev {rev.revision}</span>
          {rev.editSummary && (
            <span style={{ fontStyle: "italic", opacity: 0.8 }}>
              "{rev.editSummary}"
            </span>
          )}
        </div>

        {/* Summary */}
        {rev.summary && (
          <p
            style={{
              fontSize: "1.05rem",
              lineHeight: 1.7,
              color: "var(--fg-2)",
              marginBottom: "2rem",
              fontStyle: "italic",
            }}
          >
            {rev.summary}
          </p>
        )}

        {/* Article content */}
        <div
          className="wiki-content prose prose-invert"
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.8,
            color: "var(--fg)",
            maxWidth: "none",
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {rev.markdown}
          </ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
