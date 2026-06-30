/**
 * Backfill full text for documents that were ingested via RSS
 * but don't yet have their full HTML fetched.
 *
 * Run: node src/backfill.js [--limit N] [--jurisdiction act|nsw|vic|...]
 */
import pLimit from 'p-limit';
import { getDb } from './db.js';
import { fetchFullText, delay, REQUEST_DELAY_MS } from './scraper.js';

const args = process.argv.slice(2);
const limitArg  = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const jurisArg  = args.find(a => a.startsWith('--jurisdiction='))?.split('=')[1];

const BATCH = parseInt(limitArg || '500', 10);
const CONCURRENCY = 2; // very conservative for full-text fetching

const db = getDb();

let query = 'SELECT id, url FROM documents WHERE full_text IS NULL AND url != ""';
const params = [];
if (jurisArg) { query += ' AND jurisdiction = ?'; params.push(jurisArg); }
query += ` LIMIT ${BATCH}`;

const rows = db.prepare(query).all(...params);
console.log(`Backfilling full text for ${rows.length} documents (batch limit: ${BATCH})`);

const limit = pLimit(CONCURRENCY);
let done = 0, failed = 0;

const tasks = rows.map(row =>
  limit(async () => {
    const text = await fetchFullText(row.id, row.url);
    if (text) done++; else failed++;
    if ((done + failed) % 50 === 0) {
      console.log(`  Progress: ${done} fetched, ${failed} failed / ${rows.length} total`);
    }
    await delay(REQUEST_DELAY_MS * 2); // extra delay for HTML pages
  })
);

await Promise.all(tasks);
console.log(`\nDone. Fetched: ${done}, Failed: ${failed}`);
