import { useState, useEffect, useCallback, useRef } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiModerator, WikiCategory } from "../../hooks/useWikiApi";
import { useTezos } from "../../context/TezosContext";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface EditingCategory {
  id: string;
  name: string;
  description: string;
}

export default function AdminPanel() {
  const api = useWikiApi();
  const { domain, token } = useTezos();
  const [mods, setMods] = useState<WikiModerator[]>([]);
  const [cats, setCats] = useState<WikiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const [newMod, setNewMod] = useState("");
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [editing, setEditing] = useState<EditingCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    if (!hasFetchedRef.current) setLoading(true);
    try {
      const [m, c] = await Promise.all([api.listModerators(), api.listCategories()]);
      setMods(m.moderators); setCats(c.categories); hasFetchedRef.current = true;
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [api, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = useCallback(async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name); setError(null);
    try { await fn(); await fetchData(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }, [fetchData]);

  const startEdit = (cat: WikiCategory) => {
    setEditing({ id: cat.id, name: cat.name, description: cat.description ?? "" });
    setConfirmDelete(null);
  };

  const saveEdit = () => {
    if (!editing?.name.trim()) return;
    act(`editCat-${editing.id}`, async () => {
      await api.upsertCategory({ id: editing.id, name: editing.name.trim(), description: editing.description.trim() || undefined });
      setEditing(null);
    });
  };

  if (!domain || !token) {
    return (
      <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.75rem" }}>
          Requires wallet connection and a hack.tez domain.
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
        <header>
          <Link to="/wiki" style={{ fontFamily: "var(--font)", fontSize: "0.65rem", color: "var(--fg-3)", textDecoration: "none", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.75rem" }}>
            <ArrowLeft size={12} /> WIKI
          </Link>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.4rem, 4vw, 2rem)", letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
            // ADMIN
          </h1>
          <p style={{ color: "var(--fg-muted)", fontSize: "0.75rem" }}>
            restricted to <span style={{ color: "var(--info)" }}>admin.hack.tez</span>
          </p>
        </header>
      </div>

      {error && (
        <div style={{ padding: "0.5rem 0.75rem", background: "var(--err-bg)", border: "1px solid var(--err)", marginBottom: "1.5rem", fontFamily: "var(--font)", fontSize: "0.7rem", color: "var(--err)" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "1fr 1fr" }}>
        {/* ── MODERATORS ── */}
        <section>
          <h2 style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-3)", marginBottom: "1rem" }}>
            moderators
          </h2>

          {/* Add form */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <input
              type="text"
              placeholder="domain.hack.tez"
              value={newMod}
              onChange={e => setNewMod(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newMod.trim()) act("addMod", async () => { await api.addModerator(newMod.trim()); setNewMod(""); }); }}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", width: "100%", letterSpacing: "0.04em" }}
            />
            <button
              type="button"
              disabled={busy === "addMod" || !newMod.trim()}
              onClick={() => act("addMod", async () => { await api.addModerator(newMod.trim()); setNewMod(""); })}
              style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--fg)", color: "var(--bg)", border: "none", cursor: busy === "addMod" ? "default" : "pointer", opacity: busy === "addMod" || !newMod.trim() ? 0.4 : 1, whiteSpace: "nowrap" }}
            >
              + ADD
            </button>
          </div>

          {/* List */}
          {loading ? (
            <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.7rem" }}>Loading…</p>
          ) : mods.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.7rem" }}>No moderators assigned.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {mods.map(m => (
                <div key={m.domain} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
                  <div>
                    <span style={{ fontFamily: "var(--font)", fontSize: "0.8rem", fontWeight: 700 }}>{m.domain}</span>
                    <span style={{ fontFamily: "var(--font)", fontSize: "0.6rem", color: "var(--fg-3)", marginLeft: "0.75rem", letterSpacing: "0.04em" }}>by {m.grantedBy}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => act(`rm-${m.domain}`, () => api.removeModerator(m.domain))}
                    style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.25rem 0.5rem", color: "var(--err)", background: "var(--err-bg)", border: "1px solid var(--err)", cursor: "pointer" }}
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── CATEGORIES ── */}
        <section>
          <h2 style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-3)", marginBottom: "1rem" }}>
            categories
          </h2>

          {/* Add form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.25rem" }}>
            <input
              type="text"
              placeholder="category name"
              value={catName}
              onChange={e => setCatName(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em" }}
            />
            <input
              type="text"
              placeholder="description (optional)"
              value={catDesc}
              onChange={e => setCatDesc(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em" }}
            />
            <button
              type="button"
              disabled={busy === "addCat" || !catName.trim()}
              onClick={() => act("addCat", async () => { await api.upsertCategory({ name: catName.trim(), description: catDesc.trim() || undefined }); setCatName(""); setCatDesc(""); })}
              style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--fg)", color: "var(--bg)", border: "none", cursor: !catName.trim() ? "default" : "pointer", opacity: !catName.trim() || busy === "addCat" ? 0.4 : 1, alignSelf: "flex-start" }}
            >
              + ADD CATEGORY
            </button>
          </div>

          {/* List */}
          {cats.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.7rem" }}>No categories.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {cats.map(c => {
                const isEditing = editing?.id === c.id;
                const isDeleting = confirmDelete === c.id;

                if (isEditing) {
                  return (
                    <div key={c.id} style={{ padding: "0.75rem", background: "var(--bg-3)", border: "1px solid var(--info)" }}>
                      <input
                        value={editing.name}
                        onChange={e => setEditing({ ...editing, name: e.target.value })}
                        autoFocus
                        style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.4rem 0.6rem", background: "var(--bg-2)", border: "1px solid var(--info)", color: "var(--fg)", width: "100%", marginBottom: "0.3rem", letterSpacing: "0.04em" }}
                      />
                      <input
                        value={editing.description}
                        onChange={e => setEditing({ ...editing, description: e.target.value })}
                        placeholder="description"
                        style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.4rem 0.6rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", width: "100%", marginBottom: "0.5rem", letterSpacing: "0.04em" }}
                      />
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button type="button" onClick={saveEdit} disabled={!editing.name.trim()} style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.3rem 0.7rem", background: "var(--fg)", color: "var(--bg)", border: "none", cursor: "pointer", opacity: !editing.name.trim() ? 0.4 : 1 }}>
                          SAVE
                        </button>
                        <button type="button" onClick={() => setEditing(null)} style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.3rem 0.7rem", background: "none", color: "var(--fg-3)", border: "1px solid var(--border)", cursor: "pointer" }}>
                          CANCEL
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: "var(--font)", fontSize: "0.8rem", fontWeight: 700 }}>{c.name}</div>
                      {c.description && <div style={{ fontFamily: "var(--font)", fontSize: "0.65rem", color: "var(--fg-3)", marginTop: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "0.04em" }}>{c.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem", marginLeft: "0.75rem", flexShrink: 0 }}>
                      <button type="button" onClick={() => startEdit(c)} style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.25rem 0.5rem", color: "var(--fg-3)", background: "none", border: "1px solid var(--border)", cursor: "pointer", transition: "border-color 0.15s" }}>
                        EDIT
                      </button>
                      {isDeleting ? (
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button type="button" onClick={() => act(`rmCat-${c.id}`, async () => { await api.deleteCategory(c.id); setConfirmDelete(null); })} style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.25rem 0.5rem", color: "var(--err)", background: "var(--err-bg)", border: "1px solid var(--err)", cursor: "pointer" }}>
                            CONFIRM
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)} style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.25rem 0.5rem", color: "var(--fg-3)", background: "none", border: "1px solid var(--border)", cursor: "pointer" }}>
                            NO
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDelete(c.id)} style={{ fontFamily: "var(--font)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.25rem 0.5rem", color: "var(--err)", background: "none", border: "1px solid var(--border)", cursor: "pointer" }}>
                          DEL
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
