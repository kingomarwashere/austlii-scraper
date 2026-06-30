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

export async function loginNSWRegistry(username, password) {
  const page = await getRegistryPage();
  try {
    await page.goto(SSO_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Already logged in?
    if (!page.url().includes('sso/login') && !page.url().includes('okta')) {
      _registryLoggedIn = true;
      return { ok: true, message: 'Already logged in' };
    }

    const usernameInput = await page.$('#username');
    if (!usernameInput) throw new Error('Login form not found — page may have changed');

    await page.fill('#username', username);
    await page.fill('#password', password);

    const checked = await page.$eval('#termsAndConditions', el => el.checked).catch(() => false);
    if (!checked) await page.click('#termsAndConditions');

    await Promise.all([
      page.waitForNavigation({ timeout: 30000 }),
      page.click('#btn-login'),
    ]);
    await page.waitForTimeout(3000);

    // Check for login error message
    const errEl = await page.$('#custom-invalid-feedback, .infobox-error, [class*="error"]');
    if (errEl) {
      const errText = (await errEl.textContent() || '').trim();
      if (errText) throw new Error('Login failed: ' + errText);
    }

    const url = page.url();

    // Detect 2FA / MFA page
    const mfaDetected = await _detectMFA(page);
    if (mfaDetected) {
      return { ok: false, needs_2fa: true, mfa_type: mfaDetected, message: '2FA required' };
    }

    if (url.includes('sso/login') || url.includes('okta')) throw new Error('Login failed — check username and password');

    _registryLoggedIn = true;
    return { ok: true, message: 'Logged in', url };
  } catch (e) {
    _registryLoggedIn = false;
    return { ok: false, error: e.message };
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
  const results = [];

  try {
    // Navigate to the home page and find party/case search
    await page.goto(`${REGISTRY_BASE}/home.do`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // If we got bounced to login, session expired
    if (page.url().includes('sso/login')) {
      _registryLoggedIn = false;
      return { ok: false, error: 'Session expired — please log in again' };
    }

    // Find the search nav link — try several common patterns
    const searchLink = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      const byText = (t) => links.find(a => a.textContent.toLowerCase().includes(t));
      const match = byText('party search') || byText('search by party') || byText('case search') || byText('search cases') || byText('search');
      return match ? match.href : null;
    });

    // Also try direct known URL patterns for the registry
    const searchUrls = [
      searchLink,
      `${REGISTRY_BASE}/orwSecDisplaySearchCaseByPartyName.do`,
      `${REGISTRY_BASE}/orwSecDisplaySearchByParty.do`,
      `${REGISTRY_BASE}/orwSecDisplayCaseSearch.do`,
      `${REGISTRY_BASE}/orwSecDisplaySearchCases.do`,
    ].filter(Boolean);

    let searchPageFound = false;
    for (const url of searchUrls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (page.url().includes('sso/login')) { _registryLoggedIn = false; return { ok: false, error: 'Session expired' }; }
      const hasInput = await page.$('input[name*="party"], input[name*="Party"], input[name*="name"], input[name*="Name"], input[placeholder*="name"], input[placeholder*="party"]');
      if (hasInput) { searchPageFound = true; break; }
    }

    if (!searchPageFound) {
      // Fallback: dump all nav links from home for debugging
      await page.goto(`${REGISTRY_BASE}/home.do`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const navLinks = await page.evaluate(() =>
        [...document.querySelectorAll('a')].map(a => ({ text: a.textContent.trim().slice(0, 60), href: a.href.slice(0, 120) })).filter(a => a.href && a.text && a.href.includes('eservices'))
      );
      return { ok: false, error: 'Could not find party search page', debug: { navLinks } };
    }

    // Fill party name and search
    const nameInput = await page.$('input[name*="party"], input[name*="Party"], input[name*="surname"], input[name*="name"]:not([name*="user"])');
    if (!nameInput) return { ok: false, error: 'Party name input not found on search page' };

    await nameInput.fill(partyName);

    // Submit the form
    const submitBtn = await page.$('button[type=submit], input[type=submit], button:has-text("Search"), a:has-text("Search")');
    if (submitBtn) {
      await Promise.all([page.waitForNavigation({ timeout: 20000 }).catch(() => {}), submitBtn.click()]);
    } else {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(2000);

    // Parse search results — registry typically shows a table
    const cases = await page.evaluate((name) => {
      const rows = [...document.querySelectorAll('table tr, .case-row, .result-row, li.case')];
      const out = [];
      rows.forEach((row, i) => {
        if (i === 0) return; // skip header
        const cells = [...row.querySelectorAll('td, th')];
        if (!cells.length) return;
        const text = row.textContent.trim();
        if (!text || text.length < 10) return;
        // Extract links for case detail URLs
        const link = row.querySelector('a');
        const entry = {
          raw: cells.map(c => c.textContent.trim()),
          href: link?.href || '',
        };
        out.push(entry);
      });
      return out;
    }, partyName);

    // Parse the raw cell data into structured cases
    for (const row of cases) {
      const cells = row.raw;
      if (!cells.length) continue;
      results.push({
        matter_number: cells[0] || '',
        title:         cells[1] || cells[0] || '',
        court:         cells[2] || '',
        status:        cells[3] || '',
        next_date:     cells[4] || '',
        parties:       cells[5] || '',
        detail_url:    row.href || '',
        raw_cells:     cells,
      });
    }

    // If no table rows, try to grab any visible case-like content
    if (!results.length) {
      const pageText = await page.evaluate(() => document.body.innerText.slice(0, 5000));
      return { ok: true, cases: [], rawText: pageText, message: 'No results found or page format unrecognised' };
    }

    return { ok: true, cases: results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function scrapeRegistryCaseDetail(url) {
  if (!_registryLoggedIn || !_registryPage) return { ok: false, error: 'Not logged in' };
  const page = _registryPage;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const detail = await page.evaluate(() => {
      const get = (sel) => document.querySelector(sel)?.textContent.trim() || '';
      const getAll = (sel) => [...document.querySelectorAll(sel)].map(el => el.textContent.trim());
      // Extract all label-value pairs from the page
      const pairs = {};
      document.querySelectorAll('th, .label, dt, .field-label').forEach(th => {
        const val = th.nextElementSibling?.textContent.trim() || '';
        if (th.textContent.trim()) pairs[th.textContent.trim()] = val;
      });
      // Get hearing dates table
      const hearings = [...document.querySelectorAll('table tr')].slice(1).map(r =>
        [...r.querySelectorAll('td')].map(c => c.textContent.trim())
      ).filter(r => r.length > 0);
      return { pairs, hearings, pageText: document.body.innerText.slice(0, 8000) };
    });
    return { ok: true, ...detail };
  } catch (e) {
    return { ok: false, error: e.message };
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
