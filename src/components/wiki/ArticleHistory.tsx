import { useState, useEffect, useRef } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiRevision } from "../../hooks/useWikiApi";
import { Clock, Eye } from "lucide-react";

interface Props {
  slug: string;
}

export default function ArticleHistory({ slug }: Props) {
  const api = useWikiApi();
  const [revisions, setRevisions] = useState<WikiRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    api.getRevisions(slug).then((data) => {
      setRevisions(data.revisions);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [slug, api]);

  if (loading) {
    return <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--fg-2)" }}>Loading history…</div>;
  }

  return (
    <div style={{ fontFamily: "var(--font)", padding: "clamp(1.5rem, 4vw, 3rem) 0" }}>
      <div className="container" style={{ maxWidth: "800px", margin: "0 auto", padding: "0 1rem" }}>
        <a
          href={`/wiki/${slug}`}
          style={{ color: "var(--fg-2)", textDecoration: "none", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}
        >
          ← Back to article
        </a>

        <h1
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
            fontWeight: 700,
            marginTop: "1rem",
            marginBottom: "1.5rem",
            textTransform: "uppercase"
          }}
        >
          // REVISION HISTORY
        </h1>

        {(revisions?.length ?? 0) === 0 ? (
          <p style={{ color: "var(--fg-2)" }}>No revisions found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {revisions.map((rev) => (
              <div
                key={rev.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem 1.25rem",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  gap: "1rem",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--fg)",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        textTransform: "uppercase"
                      }}
                    >
                      REV {rev.revision}
                    </span>
                    <span style={{ color: "var(--fg)" }}>{rev.editor}</span>
                  </div>
                  {rev.editSummary && (
                    <p style={{ fontSize: "0.8rem", color: "var(--fg-2)", marginTop: "0.2rem" }}>
                      {rev.editSummary}
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.2rem", fontSize: "0.7rem", color: "var(--fg-2)" }}>
                    <Clock size={10} />
                    <time>{new Date(rev.createdAt).toLocaleString()}</time>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                  <a
                    href={`/wiki/${slug}/revisions/${rev.revision}`}
                    title="View this revision"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0.4rem 0.75rem",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--fg-2)",
                      textDecoration: "none",
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <Eye size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
