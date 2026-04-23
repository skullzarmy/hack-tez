import { useState, useEffect, useCallback, useRef } from "react";
import { useWikiApi } from "../../hooks/useWikiApi";
import type { WikiBanProposal, WikiAuditEntry } from "../../hooks/useWikiApi";
import { useTezos } from "../../context/TezosContext";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function ModDashboard() {
  const api = useWikiApi();
  const { domain, token } = useTezos();
  const [tab, setTab] = useState<"proposals" | "audit">("proposals");
  const [proposals, setProposals] = useState<WikiBanProposal[]>([]);
  const [audit, setAudit] = useState<WikiAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const [lockSlug, setLockSlug] = useState("");
  const [lockReason, setLockReason] = useState("");
  const [lockHours, setLockHours] = useState("24");

  const [banDomain, setBanDomain] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banHours, setBanHours] = useState("");

  const [propTarget, setPropTarget] = useState("");
  const [propReason, setPropReason] = useState("");

  const [busy, setBusy] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    if (!hasFetchedRef.current) setLoading(true);
    try {
      const [p, a] = await Promise.all([api.listProposals("open"), api.getAuditLog(50)]);
      setProposals(p.proposals); setAudit(a.entries); hasFetchedRef.current = true;
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [api, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = useCallback(async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name); setError(null);
    try { await fn(); await fetchData(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }, [fetchData]);

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
            // MODERATION
          </h1>
          <p style={{ color: "var(--fg-muted)", fontSize: "0.75rem" }}>
            acting as <span style={{ color: "var(--info)" }}>{domain}</span>
          </p>
        </header>
      </div>

      {error && (
        <div style={{ padding: "0.5rem 0.75rem", background: "var(--err-bg)", border: "1px solid var(--err)", marginBottom: "1.5rem", fontFamily: "var(--font)", fontSize: "0.7rem", color: "var(--err)" }}>
          {error}
        </div>
      )}

      {/* Action forms grid */}
      <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: "3rem" }}>
        {/* Lock */}
        <div style={{ padding: "1rem", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-3)", marginBottom: "1rem" }}>
            lock article
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <input
              placeholder="article slug"
              value={lockSlug}
              onChange={e => setLockSlug(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "100%" }}
            />
            <input
              placeholder="reason"
              value={lockReason}
              onChange={e => setLockReason(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "100%" }}
            />
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                placeholder="hrs"
                type="number"
                value={lockHours}
                onChange={e => setLockHours(e.target.value)}
                style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "70px" }}
              />
              <button
                type="button"
                disabled={busy === "lock" || !lockSlug.trim()}
                onClick={() => act("lock", async () => { await api.lockArticle(lockSlug.trim(), lockReason.trim(), lockHours ? Number(lockHours) : undefined); setLockSlug(""); setLockReason(""); })}
                style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--fg)", color: "var(--bg)", border: "none", cursor: (!lockSlug.trim() || busy === "lock") ? "default" : "pointer", opacity: busy === "lock" || !lockSlug.trim() ? 0.4 : 1, flex: 1 }}
              >
                LOCK
              </button>
            </div>
          </div>
        </div>

        {/* Soft ban */}
        <div style={{ padding: "1rem", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-3)", marginBottom: "1rem" }}>
            soft ban
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <input
              placeholder="domain.hack.tez"
              value={banDomain}
              onChange={e => setBanDomain(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "100%" }}
            />
            <input
              placeholder="reason"
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "100%" }}
            />
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                placeholder="hrs"
                type="number"
                value={banHours}
                onChange={e => setBanHours(e.target.value)}
                style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "70px" }}
              />
              <button
                type="button"
                disabled={busy === "ban" || !banDomain.trim()}
                onClick={() => act("ban", async () => { await api.softBan(banDomain.trim(), banReason.trim(), banHours ? Number(banHours) : undefined); setBanDomain(""); setBanReason(""); setBanHours(""); })}
                style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--err-bg)", color: "var(--err)", border: "1px solid var(--err)", cursor: (!banDomain.trim() || busy === "ban") ? "default" : "pointer", opacity: busy === "ban" || !banDomain.trim() ? 0.4 : 1, flex: 1 }}
              >
                BAN
              </button>
            </div>
          </div>
        </div>

        {/* Propose hard ban */}
        <div style={{ padding: "1rem", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-3)", marginBottom: "1rem" }}>
            propose hard ban
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <input
              placeholder="target domain"
              value={propTarget}
              onChange={e => setPropTarget(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "100%" }}
            />
            <input
              placeholder="reason + evidence"
              value={propReason}
              onChange={e => setPropReason(e.target.value)}
              style={{ fontFamily: "var(--font)", fontSize: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg)", letterSpacing: "0.04em", width: "100%" }}
            />
            <button
              type="button"
              disabled={busy === "prop" || !propTarget.trim()}
              onClick={() => act("prop", async () => { await api.proposeHardBan(propTarget.trim(), propReason.trim()); setPropTarget(""); setPropReason(""); })}
              style={{ fontFamily: "var(--font)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.5rem 1rem", background: "var(--err-bg)", color: "var(--err)", border: "1px solid var(--err)", cursor: (!propTarget.trim() || busy === "prop") ? "default" : "pointer", opacity: busy === "prop" || !propTarget.trim() ? 0.4 : 1, width: "100%", marginTop: "auto" }}
            >
              PROPOSE
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "1.5rem" }}>
        {(["proposals", "audit"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{ padding: "0.4rem 0.8rem", background: tab === t ? "var(--bg-3)" : "transparent", border: tab === t ? "1px solid var(--border)" : "1px solid transparent", borderBottom: "none", color: tab === t ? "var(--fg)" : "var(--fg-2)", fontFamily: "var(--font)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", transition: "all 0.15s" }}
          >
            {t === "proposals" ? `proposals (${proposals?.length ?? 0})` : "audit log"}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.75rem" }}>Loading…</p>
      ) : tab === "proposals" ? (
        (proposals?.length ?? 0) === 0 ? (
          <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.75rem" }}>No open proposals.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {proposals.map(p => (
              <div key={p.id} style={{ padding: "1rem", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontFamily: "var(--font)", fontSize: "0.85rem", color: "var(--err)", fontWeight: 700 }}>{p.target}</span>
                  <span style={{ fontFamily: "var(--font)", fontSize: "0.6rem", color: "var(--fg-3)", letterSpacing: "0.04em" }}>by {p.proposer}</span>
                </div>
                <p style={{ fontFamily: "var(--font)", fontSize: "0.75rem", lineHeight: 1.5, color: "var(--fg-2)", margin: 0 }}>{p.reason}</p>
              </div>
            ))}
          </div>
        )
      ) : (
        (audit?.length ?? 0) === 0 ? (
          <p style={{ color: "var(--fg-3)", fontFamily: "var(--font)", fontSize: "0.75rem" }}>No audit entries.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {audit.map(e => (
              <div key={e.id} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", padding: "0.75rem", background: "var(--bg-3)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font)", fontSize: "0.65rem", color: "var(--info)", fontWeight: 700, minWidth: "120px", letterSpacing: "0.04em" }}>
                  {e.action.replace(/_/g, " ").toUpperCase()}
                </span>
                <span style={{ fontFamily: "var(--font)", fontSize: "0.75rem" }}>{e.target}</span>
                <span style={{ fontFamily: "var(--font)", color: "var(--fg-3)", fontSize: "0.65rem", letterSpacing: "0.04em" }}>by {e.actor}</span>
                <span style={{ fontFamily: "var(--font)", color: "var(--fg-3)", fontSize: "0.6rem", letterSpacing: "0.06em", marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
