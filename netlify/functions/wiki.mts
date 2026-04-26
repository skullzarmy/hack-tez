import type { Config, Context } from "@netlify/functions";
import { sql, verifyJwt, getDomain, isAdmin, isModerator, isBanned, slugify, auditLog } from "./wiki-db.mts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function err(msg: string, code: string, status: number) { return json({ error: msg, code }, status); }

function nanoid(n = 21) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = ""; for (let i = 0; i < n; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function listArticles(url: URL) {
  const cat = url.searchParams.get("category");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  let rows;
  if (cat) {
    rows = await sql`SELECT a.slug,a.title,a.summary,a.author,a.last_editor,a.updated_at,a.revision,c.slug AS cat_slug,c.name AS cat_name FROM wiki_articles a LEFT JOIN wiki_categories c ON a.category_id=c.id WHERE a.status='published' AND c.slug=${cat} ORDER BY a.updated_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else {
    rows = await sql`SELECT a.slug,a.title,a.summary,a.author,a.last_editor,a.updated_at,a.revision,c.slug AS cat_slug,c.name AS cat_name FROM wiki_articles a LEFT JOIN wiki_categories c ON a.category_id=c.id WHERE a.status='published' ORDER BY a.updated_at DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  const articles = rows.map((r: any) => ({ slug: r.slug, title: r.title, summary: r.summary, author: r.author, lastEditor: r.last_editor, category: r.cat_slug ? { slug: r.cat_slug, name: r.cat_name } : null, updatedAt: r.updated_at, revision: r.revision }));
  return json({ articles, total: articles.length, limit, offset });
}

async function getArticle(req: Request, slug: string) {
  const rows = await sql`SELECT a.*,c.slug AS cat_slug,c.name AS cat_name FROM wiki_articles a LEFT JOIN wiki_categories c ON a.category_id=c.id WHERE a.slug=${slug}`;
  if (!rows.length) return err("Article not found", "NOT_FOUND", 404);
  const r: any = rows[0];

  if (r.status === "archived") {
    // Only author, mod, or admin can view archived articles
    const user = await verifyJwt(req);
    if (!user) return err("Article not found", "NOT_FOUND", 404);
    const domain = getDomain(user);
    const isMod = await isModerator(domain);
    if (r.author !== domain && !isAdmin(user) && !isMod) {
      return err("Article not found", "NOT_FOUND", 404);
    }
  }

  let currentUserIsMod = false;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const user = await verifyJwt(req).catch(() => null);
    if (user && user.activeDomain) {
      currentUserIsMod = (await isModerator(getDomain(user))) || isAdmin(user);
    }
  }

  const tags = await sql`SELECT t.slug,t.name FROM wiki_article_tags at2 JOIN wiki_tags t ON at2.tag_id=t.id WHERE at2.article_id=${r.id}`;
  return json({ slug: r.slug, title: r.title, content: r.content, markdown: r.markdown, summary: r.summary, category: r.cat_slug ? { slug: r.cat_slug, name: r.cat_name } : null, tags, author: r.author, lastEditor: r.last_editor, status: r.status, lockedBy: r.locked_by, lockReason: r.lock_reason, lockExpires: r.lock_expires, createdAt: r.created_at, updatedAt: r.updated_at, revision: r.revision, currentUserIsMod });
}

async function getRevisions(slug: string) {
  const art = await sql`SELECT id FROM wiki_articles WHERE slug=${slug}`;
  if (!art.length) return err("Article not found", "NOT_FOUND", 404);
  const rows = await sql`SELECT id,revision,title,editor,edit_summary,created_at FROM wiki_revisions WHERE article_id=${art[0].id} ORDER BY revision DESC LIMIT 100`;
  return json({ revisions: rows.map((r: any) => ({ id: r.id, revision: r.revision, title: r.title, editor: r.editor, editSummary: r.edit_summary, createdAt: r.created_at })) });
}

async function getRevision(slug: string, revNum: string) {
  const art = await sql`SELECT id, slug, status FROM wiki_articles WHERE slug=${slug}`;
  if (!art.length) return err("Article not found", "NOT_FOUND", 404);
  const rows = await sql`SELECT revision,title,content,markdown,summary,editor,edit_summary,created_at FROM wiki_revisions WHERE article_id=${art[0].id} AND revision=${Number(revNum)}`;
  if (!rows.length) return err("Revision not found", "NOT_FOUND", 404);
  const r: any = rows[0];
  return json({ slug: art[0].slug, title: r.title, content: r.content, markdown: r.markdown, summary: r.summary, author: r.editor, editSummary: r.edit_summary, createdAt: r.created_at, revision: r.revision });
}

async function searchArticles(url: URL) {
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return err("Query too short", "INVALID_INPUT", 400);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const tsquery = q.split(/\s+/).map(t => `${t.replace(/[^a-zA-Z0-9]/g, "")}:*`).join(" & ");
  const rows = await sql`SELECT a.slug,a.title,a.summary,a.author,a.updated_at, ts_headline('english',a.markdown,to_tsquery('english',${tsquery}),'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=40') AS excerpt FROM wiki_articles a WHERE a.status='published' AND a.search_vector @@ to_tsquery('english',${tsquery}) ORDER BY ts_rank(a.search_vector,to_tsquery('english',${tsquery})) DESC LIMIT ${limit}`;
  return json({ query: q, results: rows.map((r: any) => ({ slug: r.slug, title: r.title, summary: r.summary, excerpt: r.excerpt, author: r.author, updatedAt: r.updated_at })) });
}

async function getRecent(url: URL) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const rows = await sql`SELECT a.slug,a.title,a.summary,a.author,a.last_editor,a.updated_at,a.revision,c.slug AS cat_slug,c.name AS cat_name FROM wiki_articles a LEFT JOIN wiki_categories c ON a.category_id=c.id WHERE a.status='published' ORDER BY a.updated_at DESC LIMIT ${limit}`;
  return json({ articles: rows.map((r: any) => ({ slug: r.slug, title: r.title, summary: r.summary, author: r.author, lastEditor: r.last_editor, category: r.cat_slug ? { slug: r.cat_slug, name: r.cat_name } : null, updatedAt: r.updated_at, revision: r.revision })) });
}

async function getStats() {
  const [a, c, r] = await Promise.all([
    sql`SELECT COUNT(*) AS count FROM wiki_articles WHERE status='published'`,
    sql`SELECT COUNT(DISTINCT author) AS count FROM wiki_articles WHERE status='published'`,
    sql`SELECT COUNT(*) AS count FROM wiki_revisions`,
  ]);
  return json({ articles: Number(a[0].count), contributors: Number(c[0].count), revisions: Number(r[0].count) });
}

async function listCategories() {
  const rows = await sql`
    SELECT c.id, c.slug, c.name, c.description, c.parent_id,
           (SELECT COUNT(*) FROM wiki_articles a WHERE a.category_id = c.id AND a.status = 'published') as count
    FROM wiki_categories c
    ORDER BY c.sort_order ASC
  `;
  return json({ 
    categories: rows.map((r: any) => ({ 
      id: r.id, 
      slug: r.slug, 
      name: r.name, 
      description: r.description, 
      parentId: r.parent_id,
      articleCount: Number(r.count)
    })) 
  });
}

async function listTags() {
  const rows = await sql`SELECT t.slug,t.name,COUNT(at2.article_id) AS count FROM wiki_tags t LEFT JOIN wiki_article_tags at2 ON t.id=at2.tag_id GROUP BY t.id ORDER BY count DESC`;
  return json({ tags: rows.map((r: any) => ({ slug: r.slug, name: r.name, count: Number(r.count) })) });
}

async function getLlmsTxt() {
  const cats = await sql`SELECT name,slug FROM wiki_categories ORDER BY sort_order`;
  const recent = await sql`SELECT title,slug,summary FROM wiki_articles WHERE status='published' ORDER BY updated_at DESC LIMIT 20`;
  let txt = "# hack.tez Wiki — Tezos Knowledge Base\n\n> Community-maintained wiki covering all Tezos ecosystem projects,\n> protocols, tools, and tutorials. Contributions by hack.tez domain holders.\n\n## Categories\n";
  for (const c of cats) txt += `- [${c.name}](https://hacktez.com/wiki/categories/${c.slug})\n`;
  txt += "\n## Recent Articles\n";
  for (const a of recent) txt += `- [${a.title}](https://hacktez.com/wiki/${a.slug})${a.summary ? ` — ${a.summary}` : ""}\n`;
  txt += "\n## API\n- Articles: /api/v1/wiki/articles\n- Search: /api/v1/wiki/search?q=\n- Categories: /api/v1/wiki/categories\n";
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function getLlmsFullTxt() {
  const articles = await sql`SELECT title, slug, summary, markdown, updated_at FROM wiki_articles WHERE status='published' ORDER BY updated_at ASC`;
  let txt = "# hack.tez Wiki — Complete Knowledge Base\n\n> This document contains the full text of all published wiki articles.\n\n";
  
  for (const a of articles) {
    txt += `\n---\n\n`;
    txt += `# ${a.title}\n\n`;
    txt += `*Slug: ${a.slug} | Updated: ${new Date(a.updated_at).toISOString()}*\n\n`;
    if (a.summary) {
      txt += `> ${a.summary}\n\n`;
    }
    txt += `${a.markdown}\n`;
  }
  
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// --- Auth-gated handlers ---

async function handleTagAssignment(articleId: string, tags: string[]) {
  for (const tagName of tags.slice(0, 20)) {
    const slug = slugify(tagName);
    if (!slug) continue;
    const existing = await sql`SELECT id FROM wiki_tags WHERE slug=${slug}`;
    let tagId: string;
    if (existing.length) { tagId = existing[0].id as string; }
    else { tagId = nanoid(); await sql`INSERT INTO wiki_tags (id,slug,name) VALUES (${tagId},${slug},${tagName})`; }
    await sql`INSERT INTO wiki_article_tags (article_id,tag_id) VALUES (${articleId},${tagId}) ON CONFLICT DO NOTHING`;
  }
}

async function createArticle(req: Request) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("A hack.tez domain is required", "NO_DOMAIN", 403);
  if (await isBanned(getDomain(user))) return err("You are banned from editing", "BANNED", 403);
  const body: any = await req.json();
  const title = body.title?.trim();
  const content = body.content;
  const markdown = body.markdown ?? "";
  const summary = body.summary?.trim()?.slice(0, 300) ?? null;
  const categoryId = body.categoryId ?? null;
  const tags = body.tags ?? [];
  if (!title || title.length < 3) return err("Title must be at least 3 characters", "INVALID_INPUT", 400);
  if (!content) return err("Content is required", "INVALID_INPUT", 400);
  let slug = slugify(title);
  const existing = await sql`SELECT 1 FROM wiki_articles WHERE slug=${slug}`;
  if (existing.length) slug = `${slug}-${nanoid(6)}`;
  const id = nanoid(); const revId = nanoid(); const domain = getDomain(user);
  await sql`INSERT INTO wiki_articles (id,slug,title,content,markdown,summary,category_id,author,last_editor) VALUES (${id},${slug},${title},${content},${markdown},${summary},${categoryId},${domain},${domain})`;
  await sql`INSERT INTO wiki_revisions (id,article_id,revision,title,content,markdown,summary,editor,edit_summary) VALUES (${revId},${id},1,${title},${content},${markdown},${summary},${domain},'Initial creation')`;
  if (tags.length) await handleTagAssignment(id, tags);
  await auditLog("article_create", slug, domain, { title });
  return json({ slug, id }, 201);
}

async function updateArticle(req: Request, slug: string) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("A hack.tez domain is required", "NO_DOMAIN", 403);
  if (await isBanned(getDomain(user))) return err("You are banned from editing", "BANNED", 403);
  const rows = await sql`SELECT * FROM wiki_articles WHERE slug=${slug}`;
  if (!rows.length) return err("Article not found", "NOT_FOUND", 404);
  const article: any = rows[0];
  if (article.status === "locked") {
    if (article.lock_expires && new Date(article.lock_expires) < new Date()) {
      await sql`UPDATE wiki_articles SET status='published',locked_by=NULL,locked_at=NULL,lock_reason=NULL,lock_expires=NULL WHERE id=${article.id}`;
    } else { return err("Article is locked: " + (article.lock_reason ?? ""), "ARTICLE_LOCKED", 423); }
  }
  if (article.status === "archived") return err("Cannot edit archived article", "ARTICLE_ARCHIVED", 403);
  const body: any = await req.json();
  const title = body.title?.trim() ?? article.title;
  const content = body.content ?? article.content;
  const markdown = body.markdown ?? article.markdown;
  const summary = body.summary !== undefined ? body.summary?.trim()?.slice(0, 300) ?? null : article.summary;
  const categoryId = body.categoryId !== undefined ? body.categoryId : article.category_id;
  const editSummary = body.editSummary?.trim() ?? "";
  const newRev = article.revision + 1; const revId = nanoid(); const domain = getDomain(user);
  await sql`UPDATE wiki_articles SET title=${title},content=${content},markdown=${markdown},summary=${summary},category_id=${categoryId},last_editor=${domain},revision=${newRev},updated_at=NOW() WHERE id=${article.id}`;
  await sql`INSERT INTO wiki_revisions (id,article_id,revision,title,content,markdown,summary,editor,edit_summary) VALUES (${revId},${article.id},${newRev},${title},${content},${markdown},${summary},${domain},${editSummary})`;
  if (body.tags !== undefined) {
    await sql`DELETE FROM wiki_article_tags WHERE article_id=${article.id}`;
    if (body.tags.length) await handleTagAssignment(article.id, body.tags);
  }
  await auditLog("article_edit", slug, domain, { revision: newRev, editSummary });
  return json({ slug, revision: newRev });
}

async function deleteArticle(req: Request, slug: string) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("A hack.tez domain is required", "NO_DOMAIN", 403);
  const domain = getDomain(user);
  
  if (!isAdmin(user)) {
    return err("Admin only", "FORBIDDEN", 403);
  }

  const rows = await sql`SELECT id FROM wiki_articles WHERE slug=${slug}`;
  if (!rows.length) return err("Article not found", "NOT_FOUND", 404);
  const article: any = rows[0];

  await sql`DELETE FROM wiki_articles WHERE id=${article.id}`;
  await auditLog("article_delete", slug, domain);
  
  return json({ ok: true });
}

async function archiveArticle(req: Request, slug: string) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("A hack.tez domain is required", "NO_DOMAIN", 403);
  const domain = getDomain(user);
  
  const rows = await sql`SELECT id, author FROM wiki_articles WHERE slug=${slug}`;
  if (!rows.length) return err("Article not found", "NOT_FOUND", 404);
  const article: any = rows[0];

  const isMod = await isModerator(domain);
  if (article.author !== domain && !isAdmin(user) && !isMod) {
    return err("You can only archive your own articles", "FORBIDDEN", 403);
  }

  await sql`UPDATE wiki_articles SET status='archived' WHERE id=${article.id}`;
  await auditLog("article_archive", slug, domain);
  
  return json({ ok: true });
}

// --- Mod handlers ---

async function lockArticle(req: Request, slug: string) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("No domain", "NO_DOMAIN", 403);
  const domain = getDomain(user);
  if (!isAdmin(user) && !(await isModerator(domain))) return err("Moderator access required", "FORBIDDEN", 403);
  const body: any = await req.json();
  const reason = body.reason?.trim();
  if (!reason) return err("Reason is required", "INVALID_INPUT", 400);
  const expires = body.durationHours ? new Date(Date.now() + body.durationHours * 3600000).toISOString() : null;
  const result = await sql`UPDATE wiki_articles SET status='locked',locked_by=${domain},locked_at=NOW(),lock_reason=${reason},lock_expires=${expires} WHERE slug=${slug} AND status='published' RETURNING slug`;
  if (!result.length) return err("Article not found or already locked", "NOT_FOUND", 404);
  await auditLog("article_lock", slug, domain, { reason, expires });
  return json({ ok: true, slug, lockExpires: expires });
}

async function unlockArticle(req: Request, slug: string) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("No domain", "NO_DOMAIN", 403);
  const domain = getDomain(user);
  if (!isAdmin(user) && !(await isModerator(domain))) return err("Moderator access required", "FORBIDDEN", 403);
  const result = await sql`UPDATE wiki_articles SET status='published',locked_by=NULL,locked_at=NULL,lock_reason=NULL,lock_expires=NULL WHERE slug=${slug} AND status='locked' RETURNING slug`;
  if (!result.length) return err("Not found or not locked", "NOT_FOUND", 404);
  await auditLog("article_unlock", slug, domain);
  return json({ ok: true, slug });
}

async function softBan(req: Request) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("No domain", "NO_DOMAIN", 403);
  const domain = getDomain(user);
  if (!isAdmin(user) && !(await isModerator(domain))) return err("Moderator access required", "FORBIDDEN", 403);
  const body: any = await req.json();
  const target = body.domain?.trim(); const reason = body.reason?.trim();
  if (!target || !reason) return err("domain and reason required", "INVALID_INPUT", 400);
  const expires = body.expiresHours ? new Date(Date.now() + body.expiresHours * 3600000).toISOString() : null;
  await sql`INSERT INTO wiki_bans (domain,reason,banned_by,ban_type,expires_at) VALUES (${target},${reason},${domain},'soft',${expires})`;
  await auditLog("soft_ban", target, domain, { reason, expires });
  return json({ ok: true });
}

async function proposeHardBan(req: Request) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!user.activeDomain) return err("No domain", "NO_DOMAIN", 403);
  const domain = getDomain(user);
  if (!isAdmin(user) && !(await isModerator(domain))) return err("Moderator access required", "FORBIDDEN", 403);
  const body: any = await req.json();
  const target = body.target?.trim(); const reason = body.reason?.trim();
  if (!target || !reason) return err("target and reason required", "INVALID_INPUT", 400);
  const id = nanoid();
  await sql`INSERT INTO wiki_ban_proposals (id,target,proposer,reason,evidence) VALUES (${id},${target},${domain},${reason},${body.evidence ? JSON.stringify(body.evidence) : null})`;
  await auditLog("ban_proposal_create", target, domain, { reason });
  return json({ ok: true, proposalId: id });
}

async function listProposals(url: URL) {
  const status = url.searchParams.get("status") ?? "open";
  const rows = await sql`SELECT * FROM wiki_ban_proposals WHERE status=${status} ORDER BY created_at DESC`;
  return json({ proposals: rows.map((r: any) => ({ id: r.id, target: r.target, proposer: r.proposer, reason: r.reason, evidence: r.evidence, status: r.status, decidedBy: r.decided_by, decisionNote: r.decision_note, createdAt: r.created_at, decidedAt: r.decided_at })) });
}

async function getAuditLog(url: URL) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const rows = await sql`SELECT * FROM wiki_audit_log ORDER BY created_at DESC LIMIT ${limit}`;
  return json({ entries: rows.map((r: any) => ({ id: r.id, action: r.action, target: r.target, actor: r.actor, details: r.details, createdAt: r.created_at })) });
}

// --- Admin handlers ---

async function addModerator(req: Request) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!isAdmin(user)) return err("Admin only", "FORBIDDEN", 403);
  const body: any = await req.json();
  const domain = body.domain?.trim();
  if (!domain) return err("domain required", "INVALID_INPUT", 400);
  await sql`INSERT INTO wiki_moderators (domain,granted_by) VALUES (${domain},${getDomain(user)}) ON CONFLICT (domain) DO NOTHING`;
  await auditLog("moderator_add", domain, getDomain(user));
  return json({ ok: true });
}

async function removeModerator(req: Request, domain: string) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!isAdmin(user)) return err("Admin only", "FORBIDDEN", 403);
  await sql`DELETE FROM wiki_moderators WHERE domain=${domain}`;
  await auditLog("moderator_remove", domain, getDomain(user));
  return json({ ok: true });
}

async function listModerators(req: Request) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!isAdmin(user)) return err("Admin only", "FORBIDDEN", 403);
  const rows = await sql`SELECT domain,granted_by,permissions,created_at FROM wiki_moderators ORDER BY created_at`;
  return json({ moderators: rows.map((r: any) => ({ domain: r.domain, grantedBy: r.granted_by, permissions: r.permissions, createdAt: r.created_at })) });
}

async function upsertCategory(req: Request) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!isAdmin(user)) return err("Admin only", "FORBIDDEN", 403);
  const body: any = await req.json();
  const name = body.name?.trim();
  if (!name) return err("name required", "INVALID_INPUT", 400);
  const slug = slugify(name);
  const id = body.id ?? `cat-${slug}`;
  await sql`INSERT INTO wiki_categories (id,slug,name,description,sort_order) VALUES (${id},${slug},${name},${body.description ?? null},${body.sortOrder ?? 0}) ON CONFLICT (id) DO UPDATE SET name=${name},description=${body.description ?? null}`;
  await auditLog("category_upsert", slug, getDomain(user));
  return json({ ok: true, id, slug });
}

async function deleteCategory(req: Request, id: string) {
  const user = await verifyJwt(req);
  if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
  if (!isAdmin(user)) return err("Admin only", "FORBIDDEN", 403);
  await sql`DELETE FROM wiki_categories WHERE id=${id}`;
  await auditLog("category_delete", id, getDomain(user));
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default async function handler(req: Request, _context: Context) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1\/wiki/, "") || "/";
  const method = req.method;
  const segments = path.split("/").filter(Boolean);

  try {
    // Public
    if (method === "GET" && path === "/articles") return await listArticles(url);
    if (method === "GET" && segments[0] === "articles" && segments.length === 2 && segments[1] !== "search")
      return await getArticle(req, decodeURIComponent(segments[1]));
    if (method === "GET" && segments[0] === "articles" && segments[2] === "revisions" && segments.length === 3)
      return await getRevisions(decodeURIComponent(segments[1]));
    if (method === "GET" && segments[0] === "articles" && segments[2] === "revisions" && segments.length === 4)
      return await getRevision(decodeURIComponent(segments[1]), decodeURIComponent(segments[3]));
    if (method === "GET" && path === "/search") return await searchArticles(url);
    if (method === "GET" && path === "/recent") return await getRecent(url);
    if (method === "GET" && path === "/stats") return await getStats();
    if (method === "GET" && path === "/categories") return await listCategories();
    if (method === "GET" && path === "/tags") return await listTags();
    if (method === "GET" && path === "/llms.txt") return await getLlmsTxt();
    if (method === "GET" && path === "/llms-full.txt") return await getLlmsFullTxt();

    // Editor
    if (method === "POST" && path === "/articles") return await createArticle(req);
    if (method === "PUT" && segments[0] === "articles" && segments.length === 2)
      return await updateArticle(req, decodeURIComponent(segments[1]));
    if (method === "DELETE" && segments[0] === "articles" && segments.length === 2)
      return await deleteArticle(req, decodeURIComponent(segments[1]));
    if (method === "POST" && segments[0] === "articles" && segments[2] === "archive")
      return await archiveArticle(req, decodeURIComponent(segments[1]));

    // Mod
    if (method === "POST" && segments[0] === "articles" && segments[2] === "lock")
      return await lockArticle(req, decodeURIComponent(segments[1]));
    if (method === "POST" && segments[0] === "articles" && segments[2] === "unlock")
      return await unlockArticle(req, decodeURIComponent(segments[1]));
    if (method === "POST" && path === "/bans") return await softBan(req);
    if (method === "POST" && path === "/bans/proposals") return await proposeHardBan(req);
    if (method === "GET" && path.startsWith("/bans/proposals")) return await listProposals(url);
    if (method === "GET" && path.startsWith("/audit")) return await getAuditLog(url);

    // Admin
    if (method === "POST" && path === "/admin/moderators") return await addModerator(req);
    if (method === "DELETE" && segments[0] === "admin" && segments[1] === "moderators" && segments[2])
      return await removeModerator(req, decodeURIComponent(segments[2]));
    if (method === "GET" && path === "/admin/moderators") return await listModerators(req);
    if (method === "POST" && path === "/admin/categories") return await upsertCategory(req);
    if (method === "DELETE" && segments[0] === "admin" && segments[1] === "categories" && segments[2])
      return await deleteCategory(req, decodeURIComponent(segments[2]));

    return err("Not found", "NOT_FOUND", 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Wiki API error:", message);
    return err(message, "SERVER_ERROR", 500);
  }
}

export const config: Config = { path: "/api/v1/wiki/*" };
