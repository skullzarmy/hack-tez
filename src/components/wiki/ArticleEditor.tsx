import { useState, useEffect, useCallback, useRef } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiArticle, WikiCategory } from "../../hooks/useWikiApi";
import { useTezos } from "../../context/TezosContext";
import { ArrowLeft, Lock, Unlock, Archive, Trash2, Save } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

interface Props {
  slug?: string; // undefined = new article
}

export default function ArticleEditor({ slug }: Props) {
  const api = useWikiApi();
  const { domain, isAdmin } = useTezos();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [editSummary, setEditSummary] = useState("");
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successSlug, setSuccessSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!slug);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [lockHours, setLockHours] = useState("24");
  const [status, setStatus] = useState<string>("published");
  const [isMod, setIsMod] = useState(false);

  const hasFetchedRef = useRef(false);

  // Initialize BlockNote
  const editor = useCreateBlockNote();

  useEffect(() => {
    api.listCategories().then((d) => setCategories(d.categories)).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (!slug || hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    api.getArticle(slug).then(async (article: WikiArticle) => {
      setTitle(article.title);
      setSummary(article.summary ?? "");
      setStatus(article.status ?? "published");
      setIsMod(article.currentUserIsMod ?? false);
      setCategoryId(article.category?.slug ? article.category.slug : null);
      if (article.category) {
        api.listCategories().then((d) => {
          const cat = d.categories.find((c) => c.slug === article.category?.slug);
          if (cat) setCategoryId(cat.id);
        }).catch(() => {});
      }
      setTags(article.tags.map((t) => t.name));

      // Parse content to blocks
      try {
        if (article.content?.trim().startsWith("[")) {
          // If we have actual blocknote JSON, parse and replace blocks
          const blocks = JSON.parse(article.content);
          editor.replaceBlocks(editor.document, blocks);
        } else if (article.markdown) {
          // Fallback to tryParseMarkdownToBlocks if we only have legacy markdown
          const blocks = await editor.tryParseMarkdownToBlocks(article.markdown);
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch (e) {
        console.error("Error parsing article content into BlockNote:", e);
      }
    }).catch((err) => {
      setError((err as Error).message);
    }).finally(() => setLoading(false));
  }, [slug, api, editor]);

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 20) {
      setTags((prev) => [...prev, t]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) { setError("title is required"); return; }
    
    // Extract JSON array and markdown from BlockNote
    const contentBlocks = editor.document;
    if (!contentBlocks || contentBlocks.length === 0) { setError("content is required"); return; }
    
    const content = JSON.stringify(contentBlocks);
    const markdown = await editor.blocksToMarkdownLossy(contentBlocks);

    setSaving(true);
    setError(null);

    try {
      if (slug) {
        const result = await api.updateArticle(slug, {
          title: title.trim(),
          content,
          markdown,
          summary: summary.trim() || undefined,
          categoryId: categoryId ?? undefined,
          tags: tags.length > 0 ? tags : undefined,
          editSummary: editSummary.trim() || undefined,
        });
        setSuccessSlug(result.slug);
      } else {
        const result = await api.createArticle({
          title: title.trim(),
          content,
          markdown,
          summary: summary.trim() || undefined,
          categoryId: categoryId ?? undefined,
          tags: tags.length > 0 ? tags : undefined,
          editSummary: editSummary.trim() || "Initial creation",
        });
        setSuccessSlug(result.slug);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [title, summary, categoryId, tags, editSummary, slug, api, editor]);

  const handleDelete = useCallback(async () => {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteArticle(slug);
      window.location.href = "/wiki";
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      setConfirmDelete(false);
    }
  }, [slug, api]);

  const handleArchive = useCallback(async () => {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      await api.archiveArticle(slug);
      window.location.href = "/wiki";
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      setConfirmArchive(false);
    }
  }, [slug, api]);

  const handleLock = useCallback(async () => {
    if (!slug) return;
    if (!lockReason.trim()) { setError("Lock reason is required."); return; }
    const hrs = parseInt(lockHours, 10);
    if (Number.isNaN(hrs) || hrs < 0) { setError("Invalid lock duration."); return; }
    setSaving(true);
    setError(null);
    try {
      await api.lockArticle(slug, lockReason.trim(), hrs === 0 ? undefined : hrs);
      setStatus("locked");
      setConfirmLock(false);
      setLockReason("");
      setLockHours("24");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [slug, api, lockReason, lockHours]);

  const handleUnlock = useCallback(async () => {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      await api.unlockArticle(slug);
      setStatus("published");
      setConfirmUnlock(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [slug, api]);

  if (!domain) {
    return (
      <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.75rem" }}>
          Requires wallet connection and a hack.tez domain.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.75rem" }}>
          Loading article…
        </p>
      </div>
    );
  }

  if (successSlug) {
    return (
      <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
        <div style={{ padding: "1.5rem", background: "var(--bg-3)", border: "1px solid var(--ok)", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "flex-start" }}>
          <h2 style={{ fontFamily: "var(--font)", fontSize: "0.85rem", color: "var(--ok)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            // {slug ? "article updated" : "article created"}
          </h2>
          <a href={`/wiki/${successSlug}`} style={{ fontFamily: "var(--font)", fontSize: "0.75rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--fg)", color: "var(--bg)", textDecoration: "none" }}>
            VIEW ARTICLE →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "3rem 5rem", maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
        <header>
          <a href={slug ? `/wiki/${slug}` : "/wiki"} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", color: "var(--fg-3)", textDecoration: "none", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.75rem" }}>
            <ArrowLeft size={12} /> {slug ? "BACK TO ARTICLE" : "BACK TO WIKI"}
          </a>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.4rem, 4vw, 2rem)", letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
            // {slug ? "EDIT ARTICLE" : "NEW ARTICLE"}
          </h1>
          <p style={{ color: "var(--fg-muted)", fontSize: "0.75rem" }}>
            editing as <span style={{ color: "var(--info)" }}>{domain}</span>
          </p>
        </header>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {slug && (
            <>
              {/* Lock/Unlock - Visible to mods/admins */}
              {isMod && (
                status === "locked" ? (
                  confirmUnlock ? (
                    <>
                      <button type="button" onClick={handleUnlock} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--info)", color: "var(--bg)", border: "none", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        <Unlock size={12} /> CONFIRM UNLOCK
                      </button>
                      <button type="button" onClick={() => setConfirmUnlock(false)} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "transparent", color: "var(--fg)", border: "1px solid var(--border)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1 }}>
                        CANCEL
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmUnlock(true)} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "transparent", color: "var(--info)", border: "1px solid var(--info)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                      <Unlock size={12} /> UNLOCK
                    </button>
                  )
                ) : (
                  <button type="button" onClick={() => setConfirmLock((p) => !p)} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "transparent", color: "var(--warn)", border: "1px solid var(--warn)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    <Lock size={12} /> LOCK
                  </button>
                )
              )}

              {/* Archive */}
              {confirmArchive ? (
                <>
                  <button type="button" onClick={handleArchive} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--err)", color: "var(--bg)", border: "none", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    <Archive size={12} /> CONFIRM ARCHIVE
                  </button>
                  <button type="button" onClick={() => setConfirmArchive(false)} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "transparent", color: "var(--fg)", border: "1px solid var(--border)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1 }}>
                    CANCEL
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmArchive(true)} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--err-bg)", color: "var(--err)", border: "1px solid var(--err)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <Archive size={12} /> ARCHIVE
                </button>
              )}

              {/* Delete - Admin only */}
              {isAdmin && (
                confirmDelete ? (
                  <>
                    <button type="button" onClick={handleDelete} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "#ff0000", color: "#fff", border: "none", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                      <Trash2 size={12} /> CONFIRM DELETE
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "transparent", color: "var(--fg)", border: "1px solid var(--border)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1 }}>
                      CANCEL
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "transparent", color: "#ff0000", border: "1px solid #ff0000", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    <Trash2 size={12} /> DELETE
                  </button>
                )
              )}
            </>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1.5rem", background: "var(--ok, #2ecc71)", color: "var(--bg)", border: "none", cursor: saving ? "default" : "pointer", opacity: saving ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
          >
            <Save size={12} /> {saving ? "SAVING…" : "SAVE ARTICLE"}
          </button>
        </div>
      </div>

      {status === "archived" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", background: "var(--err-bg, rgba(255, 107, 107, 0.1))", border: "1px solid var(--err, rgba(255, 107, 107, 0.3))", marginBottom: "1.5rem", fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--err, #ff6b6b)", textTransform: "uppercase" }}>
          <span><strong>ARCHIVED:</strong> This article is soft-deleted and hidden from the public wiki.</span>
        </div>
      )}

      {status === "locked" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", background: "var(--warn-bg, rgba(255, 209, 102, 0.08))", border: "1px solid var(--warn, #ffd166)", marginBottom: "1.5rem", fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--warn, #ffd166)", textTransform: "uppercase" }}>
          <span><strong>LOCKED:</strong> This article is locked by a moderator. Edits are disabled.</span>
        </div>
      )}

      {confirmLock && isMod && status !== "locked" && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", padding: "1rem", background: "var(--bg-3)", border: "1px solid var(--warn)", marginBottom: "1.5rem" }}>
          <input type="text" placeholder="Reason for locking..." value={lockReason} onChange={(e) => setLockReason(e.target.value)} disabled={saving} style={{ flex: "1 1 200px", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} />
          <input type="number" placeholder="hrs" value={lockHours} onChange={(e) => setLockHours(e.target.value)} disabled={saving} style={{ width: "80px", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} title="Duration in hours (0 for permanent)" />
          <button type="button" onClick={handleLock} disabled={saving} style={{ padding: "0.5rem 1rem", background: "var(--warn)", color: "var(--bg)", border: "none", fontFamily: "var(--font-mono)", fontSize: "0.8rem", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>CONFIRM LOCK</button>
          <button type="button" onClick={() => setConfirmLock(false)} disabled={saving} style={{ padding: "0.5rem 1rem", background: "transparent", color: "var(--fg-2)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", cursor: "pointer" }}>CANCEL</button>
        </div>
      )}

      {error && (
        <div style={{ padding: "0.5rem 0.75rem", background: "var(--err-bg)", border: "1px solid var(--err)", marginBottom: "1.5rem", fontFamily: "var(--font)", fontSize: "0.7rem", color: "var(--err)" }}>
          {error}
        </div>
      )}

      {/* Metadata Form */}
      <div style={{ padding: "1.5rem", background: "var(--bg-3)", border: "1px solid var(--border)", marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <input
          type="text"
          placeholder="ARTICLE TITLE"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", padding: "0.5rem 0", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", color: "var(--fg)", outline: "none", width: "100%" }}
        />

        <input
          type="text"
          placeholder="brief summary (optional)…"
          value={summary}
          maxLength={300}
          onChange={(e) => setSummary(e.target.value)}
          style={{ fontFamily: "var(--font)", fontSize: "0.85rem", padding: "0.5rem 0", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", color: "var(--fg-2)", outline: "none", width: "100%" }}
        />

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", fontFamily: "var(--font)", fontSize: "0.6rem", color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }} htmlFor="article-category">Category</label>
            <select
              id="article-category"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", width: "100%", outline: "none", cursor: "pointer" }}
            >
              <option value="">NO CATEGORY</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: "2 1 300px" }}>
            <label style={{ display: "block", fontFamily: "var(--font)", fontSize: "0.6rem", color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }} htmlFor="article-tag-input">Tags</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {tags.map((tag) => (
                <span key={tag} style={{ fontFamily: "var(--font)", fontSize: "0.65rem", padding: "0.3rem 0.5rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} style={{ background: "none", border: "none", color: "var(--err)", cursor: "pointer", padding: 0 }}>✕</button>
                </span>
              ))}
              <input
                id="article-tag-input"
                type="text"
                placeholder="+ tag (enter)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.4rem 0.6rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", width: "120px", outline: "none" }}
              />
            </div>
          </div>
        </div>

        {slug && (
          <div style={{ marginTop: "0.5rem" }}>
            <input
              type="text"
              placeholder="edit summary — what did you change?"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", width: "100%", outline: "none" }}
            />
          </div>
        )}
      </div>

      {/* BlockNote Editor */}
      <div style={{ border: "1px solid var(--border)", background: "var(--bg-2)", padding: "1rem 0", position: "relative" }}>
        <style>{`
          .mantine-Portal-root, div[data-floating-ui-portal] {
            z-index: 99999 !important;
          }
          .bn-suggestion-menu, .bn-grid-suggestion-menu, .mantine-Popover-dropdown, .mantine-Menu-dropdown {
            max-height: 300px !important;
            display: flex !important;
            flex-direction: column !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            overscroll-behavior: contain !important;
          }
          .mantine-ScrollArea-root {
            flex: 1 1 auto !important;
            max-height: 300px !important;
            overflow: hidden !important;
          }
          .mantine-ScrollArea-viewport {
            max-height: 300px !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
          }
          .mantine-ScrollArea-viewport > div {
            display: block !important;
          }
        `}</style>
        <MantineProvider forceColorScheme="dark">
          <BlockNoteView editor={editor} theme="dark" />
        </MantineProvider>
      </div>
    </div>
  );
}
