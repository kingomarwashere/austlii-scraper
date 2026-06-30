import { chromium } from 'playwright';
import { XMLParser } from 'fast-xml-parser';
import { upsertDocument, logFeedRun, updateFullText } from './db.js';
import { AUSTLII_BASE, REQUEST_DELAY_MS } from './feeds.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', cdataPropName: '__cdata' });

let _browser = null;
let _page    = null;
let _warmedUp = false;

async function getPage() {
  if (_page && _warmedUp) return _page;

  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }

  const context = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-AU',
    viewport: { width: 1280, height: 720 },
  });

  _page = await context.newPage();
  await _page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Navigate to the first feed URL — this passes the Cloudflare managed challenge
  // and sets cf_clearance cookie for the entire /cgi-bin/feed/ path.
  // All subsequent feeds can be fetched with in-page fetch() using the same cookie.
  console.log('  [browser] Establishing Cloudflare session for /cgi-bin/feed/...');
  await _page.goto(`${AUSTLII_BASE}/cgi-bin/feed/au/cases/cth/HCA/`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await _page.waitForTimeout(3000);
  _warmedUp = true;
  console.log('  [browser] Session ready');

  return _page;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser  = null;
    _page     = null;
    _warmedUp = false;
  }
}

async function fetchXml(url, retries = 2) {
  const page = await getPage();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const xml = await page.evaluate(async (u) => {
        const r = await fetch(u, { headers: { Accept: 'application/rss+xml, text/xml' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      }, url);
      return xml;
    } catch (e) {
      if (attempt === retries) throw e;
      console.warn(`  [retry ${attempt + 1}] ${url}: ${e.message}`);
      // Re-navigate to the URL to refresh CF cookie for this path
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000);
    }
  }
}

function parseCdata(val) {
  if (val == null) return '';
  if (typeof val === 'object' && val.__cdata) return String(val.__cdata);
  return String(val);
}

function parseRssItems(xml, feed) {
  try {
    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel;
    if (!channel) return [];

    const rawItems = channel.item
      ? (Array.isArray(channel.item) ? channel.item : [channel.item])
      : [];

    return rawItems.map((item, i) => {
      const guid = parseCdata(item.guid) || parseCdata(item.link) || `${feed.code}::${i}`;
      return {
        guid,
        feed_code:    feed.code,
        type:         feed.type,
        jurisdiction: feed.jurisdiction,
        title:        parseCdata(item.title),
        url:          parseCdata(item.link) || parseCdata(item.guid) || '',
        pub_date:     parseCdata(item.pubDate) || null,
        description:  parseCdata(item.description),
      };
    });
  } catch (e) {
    console.error(`  [parse error] ${feed.code}: ${e.message}`);
    return [];
  }
}

export async function scrapeFeed(feed) {
  const url = `${AUSTLII_BASE}/cgi-bin/feed/${feed.code}/`;
  console.log(`  Fetching: ${feed.name} (${feed.code})`);

  let items = [];
  let itemsNew = 0;
  let error = null;

  try {
    const xml = await fetchXml(url);
    items = parseRssItems(xml, feed);
    for (const item of items) {
      const { inserted } = upsertDocument(item);
      if (inserted) itemsNew++;
    }
  } catch (e) {
    error = e.message;
    console.error(`  [error] ${feed.code}: ${e.message}`);
  }

  logFeedRun(feed.code, items.length, itemsNew, error);
  return { feed: feed.code, found: items.length, new: itemsNew, error };
}

export async function fetchFullText(docId, url) {
  if (!url) return null;
  try {
    const page = await getPage();
    const text = await page.evaluate(async (docUrl) => {
      const r = await fetch(docUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s{3,}/g, '\n\n').trim();
    }, url);
    updateFullText(docId, text);
    return text;
  } catch (e) {
    console.warn(`  [fulltext error] doc ${docId}: ${e.message}`);
    return null;
  }
}

export function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export { REQUEST_DELAY_MS };
