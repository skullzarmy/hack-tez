import { useCallback, useMemo } from "react";
import wikiUrl from "../config/wiki";
import { authedFetch } from "../lib/authedFetch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WikiArticleSummary {
  slug: string;
  title: string;
  summary: string | null;
  author: string;
  lastEditor: string;
  category: { slug: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface WikiArticle extends WikiArticleSummary {
  content: string;
  markdown: string;
  tags: Array<{ slug: string; name: string }>;
  status: string;
  lockedBy: string | null;
  lockReason: string | null;
  lockExpires: string | null;
  currentUserIsMod?: boolean;
}

export interface WikiCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  articleCount?: number;
}

export interface WikiTag {
  slug: string;
  name: string;
  count: number;
}

export interface WikiRevision {
  id: string;
  revision: number;
  title: string;
  editor: string;
  editSummary: string | null;
  createdAt: string;
}

export interface WikiRevisionFull extends WikiRevision {
  content: string;
  markdown: string;
  summary: string | null;
}

export interface WikiSearchResult {
  slug: string;
  title: string;
  summary: string | null;
  excerpt: string;
  author: string;
  updatedAt: string;
}

export interface WikiStats {
  articles: number;
  contributors: number;
  revisions: number;
}

export interface WikiModerator {
  domain: string;
  grantedBy: string;
  permissions: string;
  createdAt: string;
}

export interface WikiBanProposal {
  id: string;
  target: string;
  proposer: string;
  reason: string;
  evidence: unknown;
  status: string;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface WikiAuditEntry {
  id: number;
  action: string;
  target: string;
  actor: string;
  details: unknown;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWikiApi() {
  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      const res = await authedFetch(`${wikiUrl}${path}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((body as Record<string, string>).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    [],
  );

  const post = useCallback(
    async <T>(path: string, body: unknown): Promise<T> => {
      const res = await authedFetch(`${wikiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    [],
  );

  const put = useCallback(
    async <T>(path: string, body: unknown): Promise<T> => {
      const res = await authedFetch(`${wikiUrl}${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    [],
  );

  const del = useCallback(
    async <T>(path: string): Promise<T> => {
      const res = await authedFetch(`${wikiUrl}${path}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    [],
  );

  // --- Public ---

  const listArticles = useCallback(
    (params?: { category?: string; tag?: string; sort?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set("category", params.category);
      if (params?.tag) qs.set("tag", params.tag);
      if (params?.sort) qs.set("sort", params.sort);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const q = qs.toString();
      return get<{ articles: WikiArticleSummary[]; total: number; limit: number; offset: number }>(
        `/articles${q ? `?${q}` : ""}`,
      );
    },
    [get],
  );

  const getArticle = useCallback(
    (slug: string) => get<WikiArticle>(`/articles/${encodeURIComponent(slug)}`),
    [get],
  );

  const getRevisions = useCallback(
    (slug: string) => get<{ revisions: WikiRevision[] }>(`/articles/${encodeURIComponent(slug)}/revisions`),
    [get],
  );

  const getRevision = useCallback(
    (slug: string, rev: number) =>
      get<WikiRevisionFull>(`/articles/${encodeURIComponent(slug)}/revisions/${rev}`),
    [get],
  );

  const listCategories = useCallback(
    () => get<{ categories: WikiCategory[] }>("/categories"),
    [get],
  );

  const listTags = useCallback(
    () => get<{ tags: WikiTag[] }>("/tags"),
    [get],
  );

  const search = useCallback(
    (q: string, limit?: number, offset?: number) => {
      const qs = new URLSearchParams({ q });
      if (limit) qs.set("limit", String(limit));
      if (offset) qs.set("offset", String(offset));
      return get<{ query: string; results: WikiSearchResult[] }>(`/search?${qs}`);
    },
    [get],
  );

  const getRecent = useCallback(
    (limit?: number) => {
      const q = limit ? `?limit=${limit}` : "";
      return get<{ articles: WikiArticleSummary[] }>(`/recent${q}`);
    },
    [get],
  );

  const getStats = useCallback(() => get<WikiStats>("/stats"), [get]);

  // --- Editor ---

  const createArticle = useCallback(
    (data: {
      title: string;
      content: string;
      markdown: string;
      summary?: string;
      categoryId?: string;
      tags?: string[];
      editSummary?: string;
    }) => post<{ slug: string; id: string }>("/articles", data),
    [post],
  );

  const updateArticle = useCallback(
    (slug: string, data: {
      title?: string;
      content?: string;
      markdown?: string;
      summary?: string;
      categoryId?: string;
      tags?: string[];
      editSummary?: string;
    }) => put<{ slug: string; revision: number }>(`/articles/${encodeURIComponent(slug)}`, data),
    [put],
  );

  const deleteArticle = useCallback(
    (slug: string) => del<{ ok: boolean }>(`/articles/${encodeURIComponent(slug)}`),
    [del],
  );

  const revertArticle = useCallback(
    (slug: string, rev: number) =>
      post<{ slug: string; revision: number }>(`/articles/${encodeURIComponent(slug)}/revert/${rev}`, {}),
    [post],
  );

  // --- Moderator ---

  const lockArticle = useCallback(
    (slug: string, reason: string, durationHours?: number) =>
      post<{ ok: boolean }>(`/articles/${encodeURIComponent(slug)}/lock`, { reason, durationHours }),
    [post],
  );

  const unlockArticle = useCallback(
    (slug: string) => post<{ ok: boolean }>(`/articles/${encodeURIComponent(slug)}/unlock`, {}),
    [post],
  );

  const archiveArticle = useCallback(
    (slug: string) => post<{ ok: boolean }>(`/articles/${encodeURIComponent(slug)}/archive`, {}),
    [post],
  );

  const restoreArticle = useCallback(
    (slug: string) => post<{ ok: boolean }>(`/articles/${encodeURIComponent(slug)}/restore`, {}),
    [post],
  );

  const softBan = useCallback(
    (domain: string, reason: string, expiresHours?: number) =>
      post<{ ok: boolean }>("/bans", { domain, reason, expiresHours }),
    [post],
  );

  const unban = useCallback(
    (domain: string) => del<{ ok: boolean }>(`/bans/${encodeURIComponent(domain)}`),
    [del],
  );

  const proposeHardBan = useCallback(
    (target: string, reason: string, evidence?: unknown) =>
      post<{ ok: boolean; proposalId: string }>("/bans/proposals", { target, reason, evidence }),
    [post],
  );

  const listProposals = useCallback(
    (status?: string) => {
      const q = status ? `?status=${status}` : "";
      return get<{ proposals: WikiBanProposal[] }>(`/bans/proposals${q}`);
    },
    [get],
  );

  const commentOnProposal = useCallback(
    (proposalId: string, content: string) =>
      post<{ ok: boolean }>(`/bans/proposals/${proposalId}/comment`, { content }),
    [post],
  );

  const getAuditLog = useCallback(
    (limit?: number) => {
      const q = limit ? `?limit=${limit}` : "";
      return get<{ entries: WikiAuditEntry[] }>(`/audit${q}`);
    },
    [get],
  );

  // --- Admin ---

  const addModerator = useCallback(
    (domain: string) => post<{ ok: boolean }>("/admin/moderators", { domain }),
    [post],
  );

  const removeModerator = useCallback(
    (domain: string) => del<{ ok: boolean }>(`/admin/moderators/${encodeURIComponent(domain)}`),
    [del],
  );

  const listModerators = useCallback(
    () => get<{ moderators: WikiModerator[] }>("/admin/moderators"),
    [get],
  );

  const decideProposal = useCallback(
    (proposalId: string, decision: "approved" | "rejected", note?: string) =>
      post<{ ok: boolean }>(`/bans/proposals/${proposalId}/decide`, { decision, note }),
    [post],
  );

  const directHardBan = useCallback(
    (domain: string, reason: string) =>
      post<{ ok: boolean }>("/admin/bans/hard", { domain, reason }),
    [post],
  );

  const upsertCategory = useCallback(
    (data: { id?: string; name: string; description?: string; parentId?: string; sortOrder?: number }) =>
      post<{ ok: boolean; id: string; slug: string }>("/admin/categories", data),
    [post],
  );

  const deleteCategory = useCallback(
    (id: string) => del<{ ok: boolean }>(`/admin/categories/${encodeURIComponent(id)}`),
    [del],
  );

  return useMemo(() => ({
    // Public
    listArticles, getArticle, getRevisions, getRevision,
    listCategories, listTags, search, getRecent, getStats,
    // Editor
    createArticle, updateArticle, deleteArticle, revertArticle,
    // Moderator
    lockArticle, unlockArticle, archiveArticle, restoreArticle,
    softBan, unban, proposeHardBan, listProposals, commentOnProposal, getAuditLog,
    // Admin
    addModerator, removeModerator, listModerators,
    decideProposal, directHardBan, upsertCategory, deleteCategory,
  }), [
    listArticles, getArticle, getRevisions, getRevision,
    listCategories, listTags, search, getRecent, getStats,
    createArticle, updateArticle, deleteArticle, revertArticle,
    lockArticle, unlockArticle, archiveArticle, restoreArticle,
    softBan, unban, proposeHardBan, listProposals, commentOnProposal, getAuditLog,
    addModerator, removeModerator, listModerators,
    decideProposal, directHardBan, upsertCategory, deleteCategory,
  ]);
}
