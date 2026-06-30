/**
 * Legislation indexer — scrapes AustLII legislation database index pages
 * since the RSS feeds for legislation are "recent additions only" (usually empty).
 *
 * Crawls each legislation database page and ingests the full act/regulation list.
 *
 * Run: node src/legis-indexer.js [--jurisdiction cth|nsw|vic|...]
 */
import { chromium } from 'playwright';
import { upsertDocument, logFeedRun } from './db.js';
import { AUSTLII_BASE, FEEDS } from './feeds.js';

const args     = process.argv.slice(2);
const jurisArg = args.find(a => a.startsWith('--jurisdiction='))?.split('=')[1];

const LEGIS_FEEDS = FEEDS.filter(f =>
  f.type === 'legislation' && (!jurisArg || f.jurisdiction === jurisArg)
);

// AustLII legislation index pages — list all acts alphabetically
function indexUrl(code) {
  return `${AUSTLII_BASE}/cgi-bin/browse/au/legis/${code.replace('au/legis/', '')}/`;
}

async function indexLegisDb(page, feed) {
  const url = `${AUSTLII_BASE}/${feed.code}/`;
  console.log(`  Indexing: ${feed.name}`);

  try {
    const result = await page.evaluate(async (dbUrl, feedCode, type, jurisdiction) => {
      const r = await fetch(dbUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();

      // Parse list items — AustLII legislation pages list acts as <a href="...">Title</a>
      const links = [];
      const matches = html.matchAll(/<a\s+href="(\/cgi-bin\/viewdb\/[^"]+|\/au\/legis\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi);
      for (const m of matches) {
        const href  = m[1];
        const title = m[2].trim();
        if (!title || title.length < 5) continue;
        const url = href.startsWith('http') ? href : 'https://www.austlii.edu.au' + href;
        links.push({ url, title });
      }
      return links;
    }, url, feed.code, feed.type, feed.jurisdiction);

    let itemsNew = 0;
    for (const { url: docUrl, title } of result) {
      const { inserted } = upsertDocument({
        guid:         docUrl,
        feed_code:    feed.code,
        type:         feed.type,
        jurisdiction: feed.jurisdiction,
        title,
        url:          docUrl,
        pub_date:     null,
        description:  '',
      });
      if (inserted) itemsNew++;
    }

    logFeedRun(feed.code, result.length, itemsNew);
    console.log(`  → ${result.length} found, ${itemsNew} new`);
    return { found: result.length, new: itemsNew };
  } catch (e) {
    console.error(`  [error] ${feed.code}: ${e.message}`);
    logFeedRun(feed.code, 0, 0, e.message);
    return { found: 0, new: 0, error: e.message };
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'en-AU',
});
const page = await context.newPage();
await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

// Warmup — navigate to AustLII home
await page.goto(`${AUSTLII_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

console.log(`\nIndexing ${LEGIS_FEEDS.length} legislation databases...\n`);

let totalFound = 0, totalNew = 0;
for (const feed of LEGIS_FEEDS) {
  const r = await indexLegisDb(page, feed);
  totalFound += r.found || 0;
  totalNew   += r.new   || 0;
  await new Promise(r => setTimeout(r, 2000)); // polite delay
}

console.log(`\nDone. Total: ${totalFound} indexed, ${totalNew} new`);
await browser.close();
