/**
 * AustLII Viewer — search, browse, and live scraper status.
 * Run: node src/viewer.js   →  http://localhost:4242
 */
import { createServer } from 'http';
import { getDb, search, stats } from './db.js';
import { readStatus } from './status.js';

const PORT = process.env.PORT || 4242;

// ─── HTML ─────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AustLII Legal Corpus</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#0f1117; --surface:#1a1d27; --border:#2a2d3a;
    --accent:#4f8ef7; --accent2:#7c5cfc;
    --text:#e2e4ec; --muted:#6b7280;
    --green:#34d399; --amber:#fbbf24; --red:#f87171; --orange:#fb923c;
  }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; }

  /* ── Status bar ── */
  #status-bar {
    background:var(--surface); border-bottom:1px solid var(--border);
    padding:8px 20px; display:flex; align-items:center; gap:12px;
    font-size:12px; color:var(--muted); flex-wrap:wrap;
  }
  #status-bar .dot {
    width:8px; height:8px; border-radius:50%; background:var(--muted); flex-shrink:0;
    transition: background .3s;
  }
  #status-bar .dot.scraping { background:var(--green); animation:pulse 1.2s ease-in-out infinite; }
  #status-bar .dot.waiting  { background:var(--accent); }
  #status-bar .dot.crashed  { background:var(--red); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  #status-bar .status-msg { color:var(--text); font-weight:600; }
  #status-bar .sep { color:var(--border); }
  #total-counter { color:var(--amber); font-weight:700; font-size:13px; }
  #counter-delta { color:var(--green); font-weight:600; }

  /* ── Header ── */
  header {
    background:var(--surface); border-bottom:1px solid var(--border);
    padding:14px 20px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  }
  header h1 { font-size:17px; font-weight:700; white-space:nowrap; }
  header h1 span { color:var(--accent); }
  .search-row { display:flex; gap:8px; flex:1; min-width:220px; }
  .search-row input {
    flex:1; background:var(--bg); border:1px solid var(--border); color:var(--text);
    padding:7px 12px; border-radius:7px; font-size:13px; outline:none; transition:border-color .15s;
  }
  .search-row input:focus { border-color:var(--accent); }
  .search-row input::placeholder { color:var(--muted); }
  button {
    background:var(--accent); color:#fff; border:none; padding:7px 14px;
    border-radius:7px; cursor:pointer; font-size:13px; font-weight:600;
    transition:opacity .15s; white-space:nowrap;
  }
  button:hover { opacity:.82; }
  button.ghost    { background:var(--border); color:var(--text); }
  button.restart  { background:#7c2d2d; color:#fca5a5; }
  button.restart:hover { background:#991b1b; color:#fff; }
  button.restart:disabled { opacity:.4; cursor:default; }

  /* ── Layout ── */
  .main { display:grid; grid-template-columns:240px 1fr; height:calc(100vh - 105px); }
  aside { background:var(--surface); border-right:1px solid var(--border); padding:16px 14px; overflow-y:auto; display:flex; flex-direction:column; gap:18px; }
  .content { overflow-y:auto; padding:18px 20px; display:flex; flex-direction:column; gap:12px; }

  /* ── Sidebar ── */
  .filter-section h3 { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:7px; }
  .pill {
    display:flex; justify-content:space-between; align-items:center;
    width:100%; background:transparent; border:1px solid var(--border); color:var(--text);
    padding:6px 10px; border-radius:6px; cursor:pointer; font-size:12px;
    transition:all .12s; margin-bottom:3px; text-align:left;
  }
  .pill:hover { border-color:var(--accent); color:var(--accent); }
  .pill.active { background:var(--accent); border-color:var(--accent); color:#fff; }
  .pill .n { font-size:11px; opacity:.7; }

  .stats-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
  .stat-card { background:var(--bg); border:1px solid var(--border); border-radius:9px; padding:10px 12px; }
  .stat-card .num { font-size:20px; font-weight:700; color:var(--accent); }
  .stat-card .lbl { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin-top:2px; }

  /* ── Results ── */
  .meta { color:var(--muted); font-size:12px; }
  .meta b { color:var(--text); }

  .card {
    background:var(--surface); border:1px solid var(--border);
    border-radius:9px; padding:13px 15px; cursor:pointer; transition:border-color .12s;
  }
  .card:hover { border-color:var(--accent); }
  .card.open  { border-color:var(--accent2); background:#1e1b2e; }
  .card .title { font-size:13px; font-weight:600; margin-bottom:5px; line-height:1.4; }
  .card .snippet { font-size:12px; color:var(--muted); line-height:1.5; margin-bottom:7px; }
  .tags { display:flex; gap:5px; flex-wrap:wrap; }
  .tag { font-size:11px; padding:2px 7px; border-radius:4px; font-weight:500; }
  .tag.case_law    { background:#1e3a5f; color:#60a5fa; }
  .tag.legislation { background:#1a2e1a; color:var(--green); }
  .tag.juris { background:var(--border); color:var(--text); }
  .tag.yr   { background:transparent; color:var(--muted); }

  /* ── Detail ── */
  .detail { background:var(--bg); border:1px solid var(--border); border-radius:9px; padding:15px; margin-top:2px; }
  .detail h2 { font-size:14px; font-weight:700; margin-bottom:10px; line-height:1.4; }
  .detail .body {
    color:var(--muted); font-size:12px; line-height:1.6; white-space:pre-wrap;
    font-family:ui-monospace,monospace; background:var(--surface);
    border-radius:7px; padding:10px; max-height:240px; overflow-y:auto; margin-top:10px;
  }
  .detail a {
    display:inline-flex; align-items:center; gap:5px; color:var(--accent);
    font-size:12px; text-decoration:none; padding:5px 10px;
    border:1px solid var(--accent); border-radius:6px; margin-top:10px;
  }
  .detail a:hover { background:var(--accent); color:#fff; }

  .empty { color:var(--muted); text-align:center; padding:48px 0; font-size:14px; }
  b { color:var(--amber); font-weight:700; }
  ::-webkit-scrollbar { width:5px; } ::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
</style>
</head>
<body>

<!-- Status bar -->
<div id="status-bar">
  <div class="dot" id="dot"></div>
  <span id="status-msg" class="status-msg">Loading…</span>
  <span class="sep">|</span>
  <span>Total: <span id="total-counter">—</span></span>
  <span class="sep">|</span>
  <span id="feed-progress" style="display:none">Feed <span id="feeds-done">0</span>/<span id="feeds-total">111</span> — <span id="current-feed">—</span></span>
  <span id="new-count" style="display:none">+<span id="counter-delta">0</span> new this run</span>
  <span class="sep" id="sep-next" style="display:none">|</span>
  <span id="next-run" style="display:none">Next run <span id="next-run-time">—</span></span>
</div>

<!-- Header -->
<header>
  <h1>AustLII <span>Legal Corpus</span></h1>
  <div class="search-row">
    <input id="q" type="search" placeholder="Search case law and legislation…" autocomplete="off">
    <button onclick="doSearch()">Search</button>
    <button class="ghost" onclick="clearSearch()">Clear</button>
    <button class="restart" id="restart-btn" onclick="restartScraper()" title="Kill current run and restart immediately">⟳ Restart</button>
  </div>
</header>

<div class="main">
  <aside id="sidebar"><div class="empty" style="padding:20px 0">Loading…</div></aside>
  <div class="content" id="content">
    <div class="empty">Search the corpus above, or pick a filter on the left.</div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
let state = { q:'', type:'', juris:'', limit:50, selected:null };
let lastTotal = null;

// ── Polling ───────────────────────────────────────────────────────────────────

async function api(path) {
  const r = await fetch(path);
  return r.json();
}

async function pollStatus() {
  try {
    const s = await api('/api/status');
    const dot = $('dot');
    const msg = $('status-msg');

    // Dot + label
    dot.className = 'dot ' + (s.running ? 'scraping' : s.phase === 'waiting' ? 'waiting' : s.phase === 'crashed' ? 'crashed' : '');
    if (s.running) {
      msg.textContent = 'Scraping…';
    } else if (s.phase === 'waiting') {
      msg.textContent = 'Idle';
    } else if (s.phase === 'crashed') {
      msg.textContent = 'Crashed — retrying soon';
    } else {
      msg.textContent = s.lastCompletedAt ? 'Last run: ' + fmtAgo(s.lastCompletedAt) : 'Not started';
    }

    // Feed progress
    if (s.running && s.feedsTotal > 0) {
      $('feed-progress').style.display = '';
      $('feeds-done').textContent = s.feedsDone;
      $('feeds-total').textContent = s.feedsTotal;
      $('current-feed').textContent = s.currentFeed || '—';
    } else {
      $('feed-progress').style.display = 'none';
    }

    // New counter
    if (s.newThisRun > 0) {
      $('new-count').style.display = '';
      $('counter-delta').textContent = s.newThisRun.toLocaleString();
    } else {
      $('new-count').style.display = 'none';
    }

    // Next run
    if (!s.running && s.nextRunAt) {
      $('sep-next').style.display = '';
      $('next-run').style.display = '';
      $('next-run-time').textContent = fmtCountdown(s.nextRunAt);
    } else {
      $('sep-next').style.display = 'none';
      $('next-run').style.display = 'none';
    }
  } catch {}
}

async function pollStats() {
  try {
    const s = await api('/api/stats');
    const counter = $('total-counter');
    const newTotal = s.total;
    if (lastTotal !== null && newTotal > lastTotal) {
      counter.style.color = 'var(--green)';
      setTimeout(() => { counter.style.color = 'var(--amber)'; }, 1500);
    }
    counter.textContent = newTotal.toLocaleString();
    lastTotal = newTotal;

    // Re-render sidebar counts without losing active filter state
    renderSidebar(s);
  } catch {}
}

function fmtAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  return Math.floor(m / 60) + 'h ago';
}

function fmtCountdown(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? \`in \${h}h \${m}m\` : \`in \${m}m\`;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const JURIS_LABELS = {
  cth:'Commonwealth', nsw:'New South Wales', vic:'Victoria',
  qld:'Queensland', sa:'South Australia', wa:'Western Australia',
  tas:'Tasmania', nt:'Northern Territory', act:'ACT'
};

function renderSidebar(s) {
  $('sidebar').innerHTML = \`
    <div class="stats-grid">
      <div class="stat-card"><div class="num">\${fmt(s.total)}</div><div class="lbl">Total</div></div>
      <div class="stat-card"><div class="num">\${fmt(s.case_law)}</div><div class="lbl">Case law</div></div>
      <div class="stat-card"><div class="num">\${fmt(s.legislation)}</div><div class="lbl">Legislation</div></div>
      <div class="stat-card"><div class="num">\${fmt(s.with_fulltext)}</div><div class="lbl">Full text</div></div>
    </div>

    <div class="filter-section">
      <h3>Type</h3>
      <button class="pill \${!state.type?'active':''}" onclick="setFilter('type','')">All types</button>
      <button class="pill \${state.type==='case_law'?'active':''}" onclick="setFilter('type','case_law')">
        Case law <span class="n">\${fmt(s.case_law)}</span>
      </button>
      <button class="pill \${state.type==='legislation'?'active':''}" onclick="setFilter('type','legislation')">
        Legislation <span class="n">\${fmt(s.legislation)}</span>
      </button>
    </div>

    <div class="filter-section">
      <h3>Jurisdiction</h3>
      <button class="pill \${!state.juris?'active':''}" onclick="setFilter('juris','')">All</button>
      \${s.by_jurisdiction.map(j => \`
        <button class="pill \${state.juris===j.jurisdiction?'active':''}" onclick="setFilter('juris','\${j.jurisdiction}')">
          \${JURIS_LABELS[j.jurisdiction]||j.jurisdiction} <span class="n">\${fmt(j.n)}</span>
        </button>
      \`).join('')}
    </div>
  \`;
}

// ── Search ────────────────────────────────────────────────────────────────────

function setFilter(key, val) {
  state[key==='juris'?'juris':'type'] = val;
  doSearch();
}

function clearSearch() {
  state = { q:'', type:'', juris:'', limit:50, selected:null };
  $('q').value = '';
  $('content').innerHTML = '<div class="empty">Search the corpus above, or pick a filter on the left.</div>';
}

async function doSearch() {
  state.q = $('q').value.trim();
  state.selected = null;
  if (!state.q && !state.type && !state.juris) {
    $('content').innerHTML = '<div class="empty">Enter a search term or pick a filter.</div>';
    return;
  }
  $('content').innerHTML = '<div class="empty">Searching…</div>';

  let url = '/api/search?limit=' + state.limit;
  if (state.q)     url += '&q='            + encodeURIComponent(state.q);
  if (state.type)  url += '&type='         + state.type;
  if (state.juris) url += '&jurisdiction=' + state.juris;

  try {
    const data = await api(url);
    renderResults(data);
  } catch(e) {
    $('content').innerHTML = '<div class="empty" style="color:var(--red)">Error: ' + esc(e.message) + '</div>';
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

const J = {cth:'CTH',nsw:'NSW',vic:'VIC',qld:'QLD',sa:'SA',wa:'WA',tas:'TAS',nt:'NT',act:'ACT'};

function renderResults(data) {
  if (!data.results?.length) {
    $('content').innerHTML = '<div class="empty">No results' + (state.q ? ' for &ldquo;'+esc(state.q)+'&rdquo;' : '') + '.</div>';
    return;
  }
  const yr = d => { const y = d && new Date(d).getFullYear(); return isNaN(y) ? '' : y; };
  const cards = data.results.map(r => \`
    <div class="card" id="card-\${r.id}" onclick="toggleDoc(\${r.id}, this)">
      <div class="title">\${esc(r.title||'(untitled)')}</div>
      \${r.snippet ? '<div class="snippet">'+r.snippet+'</div>' : ''}
      <div class="tags">
        <span class="tag \${r.type}">\${r.type==='case_law'?'Case Law':'Legislation'}</span>
        <span class="tag juris">\${J[r.jurisdiction]||r.jurisdiction}</span>
        \${yr(r.pub_date) ? '<span class="tag yr">'+yr(r.pub_date)+'</span>' : ''}
      </div>
    </div>
  \`).join('');

  const meta = \`<div class="meta">Showing <b>\${data.results.length}</b>\${state.q?' for <b>'+esc(state.q)+'</b>':''}</div>\`;
  $('content').innerHTML = meta + cards;
}

// ── Detail ────────────────────────────────────────────────────────────────────

async function toggleDoc(id, el) {
  const existingDetail = document.getElementById('detail-' + id);
  if (existingDetail) {
    existingDetail.remove();
    el.classList.remove('open');
    return;
  }
  document.querySelectorAll('.card.open').forEach(c => {
    c.classList.remove('open');
    document.getElementById('detail-' + c.id.replace('card-',''))?.remove();
  });
  el.classList.add('open');

  const doc = await api('/api/document/' + id);
  const detail = document.createElement('div');
  detail.id = 'detail-' + id;
  detail.className = 'detail';
  detail.innerHTML = \`
    <div class="tags" style="margin-bottom:10px">
      <span class="tag \${doc.type}">\${doc.type==='case_law'?'Case Law':'Legislation'}</span>
      <span class="tag juris">\${J[doc.jurisdiction]||doc.jurisdiction}</span>
    </div>
    <h2>\${esc(doc.title||'(untitled)')}</h2>
    \${doc.description ? '<div class="body">'+esc(doc.description)+'</div>' : ''}
    \${doc.full_text   ? '<div class="body">'+esc(doc.full_text.slice(0,2000))+(doc.full_text.length>2000?'\\n\\n[truncated…]':'')+'</div>' : ''}
    \${doc.url ? '<a href="'+esc(doc.url)+'" target="_blank" rel="noopener">↗ Open on AustLII / legislation.gov.au</a>' : ''}
  \`;
  el.insertAdjacentElement('afterend', detail);
  detail.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) { return (n??0).toLocaleString(); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Restart ───────────────────────────────────────────────────────────────────

async function restartScraper() {
  const btn = $('restart-btn');
  btn.disabled = true;
  btn.textContent = '⟳ Restarting…';
  try {
    const r = await fetch('/api/restart', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      btn.textContent = '✓ Restarted';
      btn.style.background = 'var(--green)';
      btn.style.color = '#000';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '⟳ Restart';
        btn.style.background = '';
        btn.style.color = '';
      }, 3000);
    } else {
      btn.textContent = '✗ ' + (d.error || 'failed');
      setTimeout(() => { btn.disabled = false; btn.textContent = '⟳ Restart'; }, 3000);
    }
  } catch(e) {
    btn.textContent = '✗ Error';
    setTimeout(() => { btn.disabled = false; btn.textContent = '⟳ Restart'; }, 3000);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

$('q').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });

// Initial load
pollStats();
pollStatus();

// Poll every 4 seconds
setInterval(pollStatus, 4000);
setInterval(pollStats,  6000);
</script>
</body>
</html>`;

// ─── HTTP server ──────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

const db = getDb();

const server = createServer((req, res) => {
  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === '/' || path === '/index.html') return html(res, HTML);

  if (path === '/api/stats') return json(res, stats());

  if (path === '/api/status') return json(res, readStatus());

  if (path === '/api/restart' && req.method === 'POST') {
    const status = readStatus();
    const pid    = status.daemonPid;
    if (!pid) return json(res, { ok: false, error: 'Daemon not running (no PID in status file)' }, 503);
    try {
      process.kill(pid, 'SIGUSR1');
      return json(res, { ok: true, message: `Sent SIGUSR1 to daemon PID ${pid}` });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  if (path === '/api/search') {
    const q     = url.searchParams.get('q') || '';
    const type  = url.searchParams.get('type') || '';
    const juris = url.searchParams.get('jurisdiction') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    if (!q && (type || juris)) {
      let sql = 'SELECT id,title,url,pub_date,type,jurisdiction,feed_code FROM documents WHERE 1=1';
      const p = [];
      if (type)  { sql += ' AND type=?';         p.push(type); }
      if (juris) { sql += ' AND jurisdiction=?';  p.push(juris); }
      sql += ' ORDER BY title LIMIT ?'; p.push(limit);
      const results = db.prepare(sql).all(...p);
      return json(res, { count: results.length, results });
    }

    if (!q) return json(res, { error: 'q required' }, 400);

    try {
      let sql = `
        SELECT d.id,d.title,d.url,d.pub_date,d.type,d.jurisdiction,d.feed_code,
               snippet(documents_fts,1,'<b>','</b>','…',24) AS snippet
        FROM documents_fts f JOIN documents d ON d.id=f.rowid
        WHERE documents_fts MATCH ?`;
      const p = [q];
      if (type)  { sql += ' AND d.type=?';         p.push(type); }
      if (juris) { sql += ' AND d.jurisdiction=?';  p.push(juris); }
      sql += ' ORDER BY rank LIMIT ?'; p.push(limit);
      const results = db.prepare(sql).all(...p);
      return json(res, { count: results.length, results });
    } catch(e) {
      return json(res, { error: e.message }, 500);
    }
  }

  const m = path.match(/^\/api\/document\/(\d+)$/);
  if (m) {
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(parseInt(m[1],10));
    if (!doc) { res.writeHead(404); res.end(); return; }
    return json(res, doc);
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`AustLII Viewer → ${url}`);
  import('child_process').then(({ exec }) => exec(`open -a "Brave Browser" "${url}"`));
});
