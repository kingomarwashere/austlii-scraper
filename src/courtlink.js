/**
 * NSW Caselaw + NSW Online Registry scraper.
 * - searchNSWCaselaw: searches caselaw.nsw.gov.au (public, Playwright)
 * - loginNSWRegistry / scrapeRegistryCases: NSW Online Registry (Okta SSO, requires account)
 */
import { chromium } from 'playwright';

let _browser = null;
let _registryBrowser = null;
let _registryPage   = null;
let _registryLoggedIn = false;

async function getPage() {
  if (!_browser) {
    _browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  }
  const ctx = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  return page;
}

// ── NSW Caselaw (public) ───────────────────────────────────────────────────────

export async function searchNSWCaselaw(query, limit = 10) {
  const page = await getPage();
  try {
    const url = `https://caselaw.nsw.gov.au/search/advanced?body=${encodeURIComponent(query)}&_sort=date&_order=desc&_per_page=${limit}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('.search-results__item, .judgment, article.result').forEach(el => {
        const titleEl = el.querySelector('h3 a, h2 a, .judgment__name a, .result__title a');
        const dateEl  = el.querySelector('.judgment__date, .result__date, time, .date');
        const courtEl = el.querySelector('.judgment__court, .result__court, .court');
        const snipEl  = el.querySelector('.search-results__snippet, .result__snippet, p');
        if (titleEl) items.push({ title: titleEl.textContent.trim(), url: titleEl.href || '', date: dateEl?.textContent.trim() || '', court: courtEl?.textContent.trim() || 'NSW', summary: snipEl?.textContent.trim().slice(0, 200) || '' });
      });
      if (!items.length) {
        document.querySelectorAll('a[href*="/decision/"]').forEach(a => {
          items.push({ title: a.textContent.trim(), url: a.href || '', date: '', court: 'NSW', summary: '' });
        });
      }
      return items;
    });
    return results.slice(0, limit);
  } catch (e) {
    console.warn('[courtlink] NSW Caselaw search error:', e.message);
    return [];
  } finally {
    await page.context().close();
  }
}

export async function getNSWDecision(url) {
  const page = await getPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    return await page.evaluate(() => {
      const title = document.querySelector('h1.judgment__title, h1')?.textContent.trim() || '';
      const date  = document.querySelector('.judgment__date, time')?.textContent.trim() || '';
      const court = document.querySelector('.judgment__court, .court-name')?.textContent.trim() || '';
      const body  = document.querySelector('.judgment__body, .decision-body, main')?.innerText.trim() || '';
      return { title, date, court, body: body.slice(0, 10000) };
    });
  } catch (e) { return null; }
  finally { await page.context().close(); }
}

// ── NSW Online Registry (requires login) ──────────────────────────────────────

const SSO_LOGIN_URL = 'https://onlineregistry.lawlink.nsw.gov.au/sso/login?fromURI=https%3A%2F%2Fportal.dcj.nsw.gov.au%2Fapp%2Fdcj-portal_onlineregistry_1%2Fexka3j8d2qN4wSlVL4x7%2Fsso%2Fsaml%3FRelayState%3DbnNfcG9saWN5PXNhbWxBY3Rpb25fcG9ydGFsLmRjal9vbmxpbmVyZWdpc3RyeS1wcm9kX29rdGEuY29tAGh0dHBzOi8vb25saW5lcmVnaXN0cnkubGF3bGluay5uc3cuZ292LmF1L2psaW5rLWVzZXJ2aWNlcy9lc2VydmljZXMvaG9tZS5kbw%253D%253D';
const REGISTRY_BASE = 'https://onlineregistry.lawlink.nsw.gov.au/jlink-eservices/eservices';

async function getRegistryPage() {
  if (!_registryBrowser) {
    _registryBrowser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
  }
  if (!_registryPage || _registryPage.isClosed()) {
    const ctx = await _registryBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-AU',
      viewport: { width: 1280, height: 900 },
    });
    _registryPage = await ctx.newPage();
    await _registryPage.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    _registryLoggedIn = false;
  }
  return _registryPage;
}

export async function getRegistryDebugState() {
  if (!_registryPage || _registryPage.isClosed()) return { error: 'No browser session open' };
  const page = _registryPage;
  const url   = page.url();
  const title = await page.title().catch(() => '');
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) || '').catch(() => '');
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll('input')].map(i => ({ id: i.id, name: i.name, type: i.type, visible: i.offsetParent !== null }))
  ).catch(() => []);
  const screenshot = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false }).catch(() => null);
  return {
    url, title, bodyText, inputs,
    screenshot: screenshot ? 'data:image/jpeg;base64,' + screenshot.toString('base64') : null,
    loggedIn: _registryLoggedIn,
  };
}

export async function loginNSWRegistry(username, password) {
  const page = await getRegistryPage();
  const log = [];
  const step = (msg) => { log.push(msg); console.log('[Registry]', msg); };

  try {
    step('Navigating to SSO login…');
    await page.goto(SSO_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    step('Landed on: ' + page.url());

    // Already past login?
    const url0 = page.url();
    if (!url0.includes('sso/login') && !url0.includes('okta.com') && !url0.includes('/login')) {
      _registryLoggedIn = true;
      step('Already logged in');
      return { ok: true, message: 'Already logged in', log };
    }

    // Wait for form to be ready
    await page.waitForSelector('#username', { timeout: 15000 }).catch(() => null);
    const usernameInput = await page.$('#username');
    if (!usernameInput) {
      const bodySnip = await page.evaluate(() => document.body?.innerText?.slice(0, 500)).catch(() => '');
      throw new Error(`Login form not found. Page text: ${bodySnip}`);
    }

    step('Filling username…');
    await page.fill('#username', username);

    step('Filling password…');
    await page.fill('#password', password);

    // T&C checkbox
    const cbExists = await page.$('#termsAndConditions');
    if (cbExists) {
      const checked = await page.$eval('#termsAndConditions', el => el.checked).catch(() => false);
      if (!checked) {
        step('Checking T&C box…');
        await page.click('#termsAndConditions');
        await page.waitForTimeout(300);
      }
    }

    step('Clicking Login button…');
    await page.click('#btn-login');

    // Wait for the full SAML redirect chain to settle.
    // Flow: POST /sso/login → /cgi/samlauth → portal.dcj (Okta) → home.do
    // We wait until we're no longer on any auth/redirect URL, or until an error appears.
    step('Waiting for redirect chain…');
    const isAuthUrl = (u) => u.includes('sso/login') || u.includes('/cgi/samlauth') || u.includes('okta.com') || u.includes('portal.dcj') || u.includes('/saml') || u.includes('/login');

    const settled = await page.waitForURL(u => !isAuthUrl(u.toString()), { timeout: 30000 })
      .then(() => true)
      .catch(() => false);

    await page.waitForTimeout(2000);
    const url1 = page.url();
    step('Settled URL: ' + url1);

    // If waitForURL timed out, we may still be on login — check for error text
    if (!settled || isAuthUrl(url1)) {
      const errText = await page.evaluate(() => {
        const sel = '#custom-invalid-feedback, .infobox-error, .error-message';
        return [...document.querySelectorAll(sel)].map(el => el.textContent.trim()).filter(t => t.length > 2).join(' | ');
      }).catch(() => '');
      step('Still on auth page. Error text: ' + (errText || 'none'));
      throw new Error(errText || 'Login failed — still on auth page after 30s. Check username/password.');
    }

    // Check for 2FA
    const mfaDetected = await _detectMFA(page);
    if (mfaDetected) {
      step('2FA detected: ' + mfaDetected);
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
      return {
        ok: false, needs_2fa: true, mfa_type: mfaDetected,
        message: '2FA required', log,
        screenshot: screenshot ? 'data:image/jpeg;base64,' + screenshot.toString('base64') : null,
      };
    }

    _registryLoggedIn = true;
    step('Login successful');
    return { ok: true, message: 'Logged in', url: url1, log };
  } catch (e) {
    _registryLoggedIn = false;
    step('EXCEPTION: ' + e.message);
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
    return {
      ok: false, error: e.message, log,
      screenshot: screenshot ? 'data:image/jpeg;base64,' + screenshot.toString('base64') : null,
    };
  }
}

async function _detectMFA(page) {
  const url = page.url();
  // URL-based detection
  if (url.includes('/login/factor') || url.includes('/mfa') || url.includes('/verify') || url.includes('/challenge')) return 'code';
  // Check for MFA input fields on page
  const codeInput = await page.$('input[name="answer"], input[name="passCode"], input[name="code"], input[name="mfaCode"], input[type="tel"][maxlength], input[autocomplete="one-time-code"]');
  if (codeInput) return 'code';
  // Check page text for 2FA prompts
  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  if (bodyText.includes('verification code') || bodyText.includes('authenticator') || bodyText.includes('two-factor') || bodyText.includes('2fa') || bodyText.includes('one-time') || bodyText.includes('sms code') || bodyText.includes('enter code')) return 'code';
  return null;
}

export async function submitNSW2FA(code) {
  if (!_registryPage) return { ok: false, error: 'No active browser session' };
  const page = _registryPage;
  try {
    // Find code input and fill it
    const codeInput = await page.$('input[name="answer"], input[name="passCode"], input[name="code"], input[name="mfaCode"], input[type="tel"][maxlength], input[autocomplete="one-time-code"]');
    if (!codeInput) {
      // Try any visible single-line text input
      const fallback = await page.$('input[type="text"]:visible, input[type="number"]:visible');
      if (!fallback) return { ok: false, error: 'Could not find 2FA code input on page' };
      await fallback.fill(code.trim());
    } else {
      await codeInput.fill(code.trim());
    }

    // Find and click verify/submit button
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Verify"), button:has-text("Submit"), button:has-text("Continue")');
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
        submitBtn.click(),
      ]);
    } else {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(3000);

    const url = page.url();

    // Check if still on MFA page
    const stillMFA = await _detectMFA(page);
    if (stillMFA) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.toLowerCase().includes('incorrect') || bodyText.toLowerCase().includes('invalid') || bodyText.toLowerCase().includes('wrong')) {
        return { ok: false, error: 'Incorrect 2FA code — please try again' };
      }
      return { ok: false, needs_2fa: true, message: 'Still on 2FA page — try again' };
    }

    if (url.includes('sso/login') || url.includes('okta')) return { ok: false, error: '2FA failed — check the code and try again' };

    _registryLoggedIn = true;
    return { ok: true, message: 'Logged in with 2FA', url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function scrapeRegistryCases(partyName) {
  if (!_registryLoggedIn) return { ok: false, error: 'Not logged in to NSW Registry' };
  const page = _registryPage;

  try {
    // Navigate to the "Search cases" page on the content site
    // The logged-in portal is at /content/landing — case search is under /content/case-search
    // or accessible via the "Search cases" nav link
    const SEARCH_URLS = [
      'https://onlineregistry.lawlink.nsw.gov.au/content/case-search',
      'https://onlineregistry.lawlink.nsw.gov.au/content/search-cases',
      'https://onlineregistry.lawlink.nsw.gov.au/content/my-cases',
    ];

    // First: navigate to landing and find the "Search cases" link
    await page.goto('https://onlineregistry.lawlink.nsw.gov.au/content/landing', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    if (page.url().includes('sso/login')) { _registryLoggedIn = false; return { ok: false, error: 'Session expired' }; }

    // Find "Search cases" nav link
    const searchCasesHref = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      const m = links.find(a => /^search\s*cases?$/i.test(a.textContent.trim()) || a.textContent.trim().toLowerCase() === 'search cases');
      return m?.href || null;
    });

    const targetUrl = searchCasesHref || `${REGISTRY_BASE}/caseListSubmenu.do`;
    console.log('[Registry] Search cases URL:', targetUrl);

    await page.goto(targetUrl, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('sso/login')) { _registryLoggedIn = false; return { ok: false, error: 'Session expired' }; }

    const pageUrl = page.url();
    console.log('[Registry] On search page:', pageUrl);

    // Dump all form inputs for debugging
    const formInfo = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll('input,select')].map(i => ({ tag: i.tagName, name: i.name, id: i.id, type: i.type, placeholder: i.placeholder, value: i.value })),
      buttons: [...document.querySelectorAll('button,input[type=submit]')].map(b => ({ text: b.textContent?.trim(), type: b.type, id: b.id })),
      pageText: document.body.innerText.slice(0, 500),
    }));
    console.log('[Registry] Form info:', JSON.stringify(formInfo, null, 2));

    // Submit the search with empty fields to list all user's cases
    const submitBtn = await page.$('button[type=submit], input[type=submit], button:has-text("Search")');
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
        submitBtn.click(),
      ]);
      await page.waitForTimeout(2000);
    } else {
      // Try pressing Enter in any input
      const anyInput = await page.$('input[type=text], input[type=search]');
      if (anyInput) { await anyInput.press('Enter'); await page.waitForTimeout(3000); }
    }

    console.log('[Registry] After search submit:', page.url());

    // Grab full page text and extract cases
    const rawText = await page.evaluate(() => document.body.innerText);

    // Try to parse structured case data from tables or cards
    const rawCases = await page.evaluate(() => {
      // Strategy 1: table rows
      const tableRows = [...document.querySelectorAll('table tbody tr, table tr:not(:first-child)')];
      if (tableRows.length) {
        return tableRows.map(row => {
          const cells = [...row.querySelectorAll('td')];
          const link = row.querySelector('a');
          return { cells: cells.map(c => c.textContent.trim()), href: link?.href || '' };
        }).filter(r => r.cells.length > 1);
      }

      // Strategy 2: card/list items that look like cases
      const cards = [...document.querySelectorAll('[class*="case"], [class*="matter"], [class*="result"], li.item, .card')];
      if (cards.length) {
        return cards.map(card => ({
          cells: [card.textContent.trim().slice(0, 200)],
          href: card.querySelector('a')?.href || '',
        }));
      }

      // Strategy 3: look for links with case numbers (pattern: 4 digits / number)
      const caseLinks = [...document.querySelectorAll('a')].filter(a => /\d{4}\s*\/\s*\d+/.test(a.textContent) || /\d{4}\s*\/\s*\d+/.test(a.href));
      if (caseLinks.length) {
        return caseLinks.map(a => ({
          cells: [a.textContent.trim(), a.closest('tr,li,div')?.textContent.trim().slice(0, 200) || ''],
          href: a.href,
        }));
      }

      return [];
    });

    console.log('[Registry] Raw cases found:', rawCases.length);

    if (!rawCases.length) {
      return { ok: true, cases: [], rawText: rawText.slice(0, 5000), message: 'Logged in and searched but no cases found (empty list or unrecognised format)', pageUrl: page.url() };
    }

    // Map to structured format
    // Observed column order: [matter_number, title, next_hearing (date+time+type), filed_date, ...]
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const cases = rawCases.map(row => {
      const cells = row.cells;
      const matter_number = (cells[0] || '').trim();
      const title         = clean(cells[1]) || matter_number;
      // cells[2] = next hearing: e.g. "18 Sep. 2026 09:30 AM - Hearing"
      const hearingRaw    = clean(cells[2] || '');
      const hearingDateM  = hearingRaw.match(/(\d{1,2}\s+\w+\.?\s+\d{4})/);
      const hearingTime   = hearingRaw.match(/(\d{1,2}:\d{2}\s*[AP]M)/i)?.[1] || '';
      const hearingType   = hearingRaw.match(/[-–]\s*(.+)$/)?.[1]?.trim() || '';
      const next_date_str = hearingDateM ? hearingDateM[1].trim() : '';
      // cells[3] = filed/added date
      const filed_date    = clean(cells[3] || '');
      return {
        matter_number,
        title,
        court:      '',  // not in table; can be fetched from detail URL
        status:     hearingType || 'active',
        next_date:  next_date_str,
        next_time:  hearingTime,
        filed_date,
        detail_url: row.href || '',
        raw:        cells,
      };
    });

    return { ok: true, cases };
  } catch (e) {
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
    return {
      ok: false, error: e.message,
      screenshot: screenshot ? 'data:image/jpeg;base64,' + screenshot.toString('base64') : null,
    };
  }
}

async function _clickTab(page, name) {
  try {
    const tab = await page.$(`button:has-text("${name}"), a:has-text("${name}"), [role="tab"]:has-text("${name}")`);
    if (!tab) return false;
    await tab.click();
    await page.waitForTimeout(1800);
    return true;
  } catch { return false; }
}

export async function scrapeRegistryCaseDetail(url) {
  if (!_registryLoggedIn || !_registryPage) return { ok: false, error: 'Not logged in' };
  const page = _registryPage;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    // ── Header ──────────────────────────────────────────────────────────────
    const header = await page.evaluate(() => {
      const cl = s => (s||'').replace(/\s+/g,' ').trim();
      const title  = cl(document.querySelector('h1,h2,.case-title,[class*="caseTitle"],[class*="case-name"]')?.textContent || document.title);
      const status = cl(document.querySelector('[class*="status"],[class*="badge"],[class*="Status"]')?.textContent || '');
      const matter = (title.match(/\((\d{4}\/\d+)\)/) || title.match(/(\d{4}\/\d+)/))?.[1] || '';
      return { title, status, matter_number: matter };
    });

    // ── Proceedings / charges ────────────────────────────────────────────────
    await _clickTab(page, 'Proceedings');
    const proceedings = await page.evaluate(() => {
      const cl = s => (s||'').replace(/\s+/g,' ').trim();
      // Table rows
      const rows = [...document.querySelectorAll('table tbody tr')];
      if (rows.length) return rows.map(r => cl(r.textContent)).filter(Boolean);
      // Fallback: list items or divs with charge numbers
      return [...document.querySelectorAll('[class*="proceed"],[class*="charge"],li')]
        .map(el => cl(el.textContent)).filter(t => /\d{4}\/\d+/.test(t) || t.length > 15).slice(0,20);
    });

    // ── Court dates ──────────────────────────────────────────────────────────
    await _clickTab(page, 'Court dates');
    const courtDates = await page.evaluate(() => {
      const cl = s => (s||'').replace(/\s+/g,' ').trim();
      const rows = [...document.querySelectorAll('table tbody tr')];
      return rows.map(row => {
        const cells = [...row.querySelectorAll('td,th')].map(c => cl(c.textContent));
        // Also grab any "heard at" detail below the row
        const detail = cl(row.nextElementSibling?.textContent || '');
        return {
          date:              cells[0] || '',
          listing_for:       cells[1] || '',
          presiding_officer: cells[2] || '',
          heard_at:          cells[3] || detail || '',
        };
      }).filter(r => r.date && r.date !== 'Date');
    });

    // ── Judgments & orders ───────────────────────────────────────────────────
    await _clickTab(page, 'Judgments & orders');
    const orders = await page.evaluate(() => {
      const cl = s => (s||'').replace(/\s+/g,' ').trim();
      // Try dedicated order blocks first
      const blocks = [...document.querySelectorAll('[class*="order"],[class*="judgment"],[class*="Order"]')];
      if (blocks.length) return blocks.map(b => cl(b.textContent)).filter(t => t.length > 15);
      // Fallback: paragraphs containing "Order" or "order"
      const paras = [...document.querySelectorAll('p,div,li,td')]
        .map(el => cl(el.textContent))
        .filter(t => t.length > 20 && t.length < 2000 && /order|adjourne|hearing|plea|verdict|sentence|judgment/i.test(t));
      // Deduplicate
      const seen = new Set(); return paras.filter(t => { if(seen.has(t)) return false; seen.add(t); return true; });
    });

    // ── Filed documents ──────────────────────────────────────────────────────
    await _clickTab(page, 'Filed documents');
    const filedDocs = await page.evaluate(() => {
      const cl = s => (s||'').replace(/\s+/g,' ').trim();
      return [...document.querySelectorAll('table tbody tr')]
        .map(r => cl(r.textContent)).filter(Boolean).slice(0, 20);
    });

    // ── Derive key fields ────────────────────────────────────────────────────
    // Latest presiding officer
    const lastHearing    = courtDates.filter(h => h.presiding_officer).slice(-1)[0];
    const presiding      = lastHearing?.presiding_officer || '';
    // Next/upcoming hearing
    const upcoming = courtDates.find(h => {
      if (!h.date) return false;
      const d = new Date(h.date.replace(/(\d{1,2})\s(\w+)\s(\d{2})$/, '$1 $2 20$3'));
      return d > new Date();
    });
    // Charges summary
    const chargesSummary = proceedings.filter(p => /\d{4}\/\d+-\d+/.test(p)).join(' | ') || proceedings.slice(0,3).join(' | ');

    return {
      ok: true,
      header,
      proceedings,
      courtDates,
      orders,
      filedDocs,
      presiding_officer: presiding,
      next_hearing: upcoming || null,
      charges_summary: chargesSummary,
    };
  } catch (e) {
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 50 }).catch(() => null);
    return {
      ok: false, error: e.message,
      screenshot: screenshot ? 'data:image/jpeg;base64,' + screenshot.toString('base64') : null,
    };
  }
}

export async function closeRegistryBrowser() {
  if (_registryBrowser) {
    await _registryBrowser.close().catch(() => {});
    _registryBrowser = null;
    _registryPage = null;
    _registryLoggedIn = false;
  }
}

export async function closeCourtlinkBrowser() {
  if (_browser) { await _browser.close(); _browser = null; }
}

export async function searchAustliiForParty(partyName, jurisdiction = 'nsw') {
  return { query: partyName, source: 'austlii', note: 'Search corpus for party name' };
}

export const COURT_RESOURCES = {
  nsw: [
    { name: 'NSW Caselaw',          url: 'https://caselaw.nsw.gov.au',                              desc: 'Full text of NSW court decisions' },
    { name: 'NSW Online Registry',  url: 'https://onlineregistry.lawlink.nsw.gov.au/content/',      desc: 'File documents, view your case online' },
    { name: 'NCAT eCatalyst',       url: 'https://ncat.nsw.gov.au/ecatalyst',                       desc: 'NCAT applications and hearings' },
    { name: 'Federal Court eLodge', url: 'https://www.fedcourt.gov.au/online-services/elodgment',   desc: 'Federal Court document lodgment' },
  ],
  vic: [
    { name: 'Victorian Caselaw',    url: 'https://www.austlii.edu.au/au/cases/vic',                 desc: 'VIC court decisions on AustLII' },
    { name: 'VCAT Online',          url: 'https://www.vcat.vic.gov.au/online-services',             desc: 'VCAT applications and case management' },
  ],
  cth: [
    { name: 'FWC Decisions',        url: 'https://www.fwc.gov.au/resources/decisions',              desc: 'Fair Work Commission decisions' },
    { name: 'AAT eSystems',         url: 'https://www.aat.gov.au/lodging-and-fees/elodgment',       desc: 'Administrative Appeals Tribunal' },
    { name: 'Federal Court',        url: 'https://www.fedcourt.gov.au',                             desc: 'Federal Court of Australia' },
  ],
};
