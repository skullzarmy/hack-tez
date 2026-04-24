#!/usr/bin/env -S node --no-warnings
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
const sql = neon(DATABASE_URL);

async function main() {
  const srcSlug = 'contracts';
  const dstSlug = 'smart-contracts';
  const dstName = 'Smart Contracts';

  const cats = await sql`SELECT id, slug, name FROM wiki_categories WHERE slug IN (${srcSlug}, ${dstSlug})` as unknown as Array<{id:string;slug:string;name:string}>;
  const src = cats.find(c=>c.slug===srcSlug) || null;
  const dst = cats.find(c=>c.slug===dstSlug) || null;

  if (!src && dst) {
    console.log('Nothing to do: no "contracts" category; "smart-contracts" exists as', dst.id);
    return;
  }

  if (src && dst) {
    // Point articles at dst, then delete src
    await sql`UPDATE wiki_articles SET category_id=${dst.id} WHERE category_id=${src.id}`;
    await sql`DELETE FROM wiki_categories WHERE id=${src.id}`;
    console.log('Repointed articles to', dst.slug, 'and removed', src.slug);
    return;
  }

  if (src && !dst) {
    // Rename src to dst
    await sql`UPDATE wiki_categories SET slug=${dstSlug}, name=${dstName} WHERE id=${src.id}`;
    console.log('Renamed category', srcSlug, '→', dstSlug);
    return;
  }

  console.log('No matching categories found; nothing changed');
}

main().catch(e=>{console.error(e);process.exit(1)});

