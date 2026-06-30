import pLimit from 'p-limit';
import { FEEDS, CONCURRENT_FEEDS, REQUEST_DELAY_MS } from './feeds.js';
import { scrapeFeed, closeBrowser, delay } from './scraper.js';
import { getDb, stats } from './db.js';

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-poll all feeds every 6 hours

async function runOnce() {
  console.log(`\n=== AustLII Scraper run started at ${new Date().toISOString()} ===`);
  console.log(`Feeds to scrape: ${FEEDS.length}\n`);

  const limit = pLimit(CONCURRENT_FEEDS);
  const results = [];

  // Feed tasks with rate limiting
  const tasks = FEEDS.map(feed =>
    limit(async () => {
      const result = await scrapeFeed(feed);
      await delay(REQUEST_DELAY_MS);
      return result;
    })
  );

  for (const result of await Promise.all(tasks)) {
    results.push(result);
  }

  const succeeded = results.filter(r => !r.error);
  const failed    = results.filter(r => r.error);
  const totalNew  = results.reduce((s, r) => s + r.new, 0);
  const totalFound = results.reduce((s, r) => s + r.found, 0);

  console.log(`\n=== Run complete ===`);
  console.log(`Feeds: ${succeeded.length} ok, ${failed.length} failed`);
  console.log(`Items: ${totalFound} found, ${totalNew} new`);

  const s = stats();
  console.log(`\nDatabase totals:`);
  console.log(`  Total documents: ${s.total}`);
  console.log(`  Case law:        ${s.case_law}`);
  console.log(`  Legislation:     ${s.legislation}`);
  console.log(`  With full text:  ${s.with_fulltext}`);
  console.log(`\n  By jurisdiction:`);
  for (const j of s.by_jurisdiction) {
    console.log(`    ${j.jurisdiction.padEnd(6)} ${j.n}`);
  }

  if (failed.length > 0) {
    console.log(`\nFailed feeds:`);
    for (const f of failed) console.log(`  ${f.feed}: ${f.error}`);
  }

  await closeBrowser();
  return { totalNew, totalFound };
}

async function runContinuous() {
  while (true) {
    await runOnce();
    console.log(`\nNext poll in ${POLL_INTERVAL_MS / 3600000}h — ${new Date(Date.now() + POLL_INTERVAL_MS).toISOString()}`);
    await delay(POLL_INTERVAL_MS);
  }
}

// Ensure DB is initialised
getDb();

const once = process.argv.includes('--once');
if (once) {
  runOnce().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
} else {
  runContinuous().catch(e => { console.error(e); process.exit(1); });
}
