#!/usr/bin/env -S node --no-warnings
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { parseFrontmatter, slugify, ALLOWED_CATEGORIES } from './schema.js';

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const sql = neon(DATABASE_URL);

type Args = { files: string[]; all: boolean; dry: boolean; del?: string };
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { files: [], all: false, dry: false };
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t === '--all') out.all = true;
    else if (t === '--dry-run' || t === '--dry') out.dry = true;
    else if (t === '--delete' || t === '--del') { out.del = a[++i]; }
    else out.files.push(t);
  }
  return out;
}

async function ensureCategory(slug: string, name?: string) {
  const rows = await sql`SELECT id FROM wiki_categories WHERE slug=${slug}` as unknown as Array<{id:string}>;
  if (rows.length) return rows[0].id;
  const id = `cat-${slug}`;
  await sql`INSERT INTO wiki_categories (id,slug,name,description,sort_order) VALUES (${id},${slug},${name ?? slug},${null},${0}) ON CONFLICT DO NOTHING`;
  return id;
}

async function ensureTag(slug: string, name: string) {
  await sql`INSERT INTO wiki_tags (id,slug,name) VALUES (${`tag-${slug}`}, ${slug}, ${name}) ON CONFLICT (slug) DO NOTHING`;
}

async function deleteArticle(slug: string, dry: boolean) {
  const rows = await sql`SELECT id FROM wiki_articles WHERE slug=${slug}` as unknown as Array<{id:string}>;
  if (!rows.length) { console.log(`Not found: ${slug}`); return; }
  if (dry) { console.log(`[dry-run] Would delete: ${slug}`); return; }
  await sql`DELETE FROM wiki_articles WHERE id=${rows[0].id}`;
  console.log(`Deleted: ${slug}`);
}

async function importFile(filePath: string, dry: boolean) {
  const raw = await fs.readFile(filePath, 'utf8');
  const { fm, markdown } = parseFrontmatter(raw);
  const slug = fm.slug ? slugify(fm.slug) : slugify(fm.title);
  if (!ALLOWED_CATEGORIES.includes(fm.category)) throw new Error(`Invalid category: ${fm.category}`);

  const catName = fm.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const catId = await ensureCategory(fm.category, catName);
  const tags = (fm.tags ?? []).slice(0, 10);

  const found = await sql`SELECT id, revision FROM wiki_articles WHERE slug=${slug}` as unknown as Array<{id:string;revision:number}>;
  if (!found.length) {
    if (dry) {
      console.log(`[dry-run] Would create: ${slug} (category=${fm.category}, tags=${tags.join(',')})`);
      return;
    }
    const id = `art-${slug}`;
    await sql`INSERT INTO wiki_articles (id,slug,title,content,markdown,summary,category_id,author,last_editor) VALUES (${id},${slug},${fm.title},${markdown},${markdown},${fm.summary ?? null},${catId},${fm.author ?? 'admin.hack.tez'},${fm.author ?? 'admin.hack.tez'})`;
    await sql`INSERT INTO wiki_revisions (id,article_id,revision,title,content,markdown,summary,editor,edit_summary) VALUES (${`rev-${slug}-1`},${id},${1},${fm.title},${markdown},${markdown},${fm.summary ?? null},${fm.author ?? 'admin.hack.tez'},${'Initial creation'})`;
    for (const t of tags) {
      const tslug = slugify(t); await ensureTag(tslug, t);
      await sql`INSERT INTO wiki_article_tags (article_id,tag_id) SELECT ${id}, id FROM wiki_tags WHERE slug=${tslug} ON CONFLICT DO NOTHING`;
    }
    console.log(`Created: ${slug}`);
  } else {
    const id = found[0].id; const newRev = Number(found[0].revision || 1) + 1;
    if (dry) {
      console.log(`[dry-run] Would update: ${slug} → rev ${newRev}`);
      return;
    }
    await sql`UPDATE wiki_articles SET title=${fm.title},content=${markdown},markdown=${markdown},summary=${fm.summary ?? null},category_id=${catId},last_editor=${fm.author ?? 'admin.hack.tez'},revision=${newRev},updated_at=NOW() WHERE id=${id}`;
    await sql`INSERT INTO wiki_revisions (id,article_id,revision,title,content,markdown,summary,editor,edit_summary) VALUES (${`rev-${slug}-${newRev}`},${id},${newRev},${fm.title},${markdown},${markdown},${fm.summary ?? null},${fm.author ?? 'admin.hack.tez'},${'Content update'}) ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM wiki_article_tags WHERE article_id=${id}`;
    for (const t of tags) {
      const tslug = slugify(t); await ensureTag(tslug, t);
      await sql`INSERT INTO wiki_article_tags (article_id,tag_id) SELECT ${id}, id FROM wiki_tags WHERE slug=${tslug} ON CONFLICT DO NOTHING`;
    }
    console.log(`Updated: ${slug} (rev ${newRev})`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.del) {
    await deleteArticle(slugify(args.del), args.dry);
    return;
  }
  let files: string[] = [];
  if (args.all || args.files.length === 0) {
    const dir = path.join(process.cwd(), 'wiki-staging');
    const ents = await fs.readdir(dir).catch(() => [] as string[]);
    files = ents.filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
  } else {
    files = args.files;
  }
  if (files.length === 0) {
    console.log('No files to import. Usage: tsx scripts/wiki/loader.mts wiki-staging/file.md [--dry-run]');
    return;
  }
  for (const f of files) {
    try {
      await importFile(f, args.dry);
    } catch (e) {
      console.error(`${args.dry ? '[dry-run] ' : ''}Failed: ${f}:`, (e as Error).message);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

