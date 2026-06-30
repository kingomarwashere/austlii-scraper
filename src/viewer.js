/**
 * AustLII Viewer — legal corpus search and browse UI
 * Run: node src/viewer.js  →  http://localhost:4242
 */
import { createServer } from 'http';
import { getDb, stats } from './db.js';
import { readStatus } from './status.js';

const PORT          = process.env.PORT || 4242;
const ADMIN_PASSWORD = 'boob';

// ── Court / feed display names ─────────────────────────────────────────────────
const COURT = {
  'au/cases/cth/HCA':    { name:'High Court',          abbr:'HCA',    tier:1 },
  'au/cases/cth/FCAFC':  { name:'Full Federal Court',  abbr:'FCAFC',  tier:2 },
  'au/cases/cth/FCA':    { name:'Federal Court',        abbr:'FCA',    tier:2 },
  'au/cases/cth/FCCA':   { name:'Federal Circuit Court',abbr:'FCCA',  tier:3 },
  'au/cases/cth/FCCM':   { name:'Fed Circuit & Family', abbr:'FCCM',  tier:3 },
  'au/cases/cth/FamCA':  { name:'Family Court',         abbr:'FamCA', tier:2 },
  'au/cases/cth/FamCAFC':{ name:'Family Court Full Court','abbr':'FamCAFC',tier:2},
  'au/cases/cth/AATA':   { name:'Admin Appeals Tribunal','abbr':'AATA',tier:3 },
  'au/cases/cth/FWC':    { name:'Fair Work Commission', abbr:'FWC',    tier:3 },
  'au/cases/cth/FWCFB':  { name:'Fair Work Full Bench', abbr:'FWCFB', tier:3 },
  'au/cases/cth/MRD':    { name:'Migration Review',     abbr:'MRD',    tier:3 },
  'au/cases/cth/RRT':    { name:'Refugee Review',       abbr:'RRT',    tier:3 },
  'au/cases/nsw/NSWSC':  { name:'NSW Supreme Court',    abbr:'NSWSC',  tier:1 },
  'au/cases/nsw/NSWCA':  { name:'NSW Court of Appeal',  abbr:'NSWCA',  tier:1 },
  'au/cases/nsw/NSWCCA': { name:'NSW Court Criminal Appeal','abbr':'NSWCCA',tier:1},
  'au/cases/nsw/NSWDC':  { name:'NSW District Court',   abbr:'NSWDC',  tier:2 },
  'au/cases/nsw/NSWLC':  { name:'NSW Land & Environment','abbr':'NSWLC',tier:2},
  'au/cases/vic/VSC':    { name:'VIC Supreme Court',    abbr:'VSC',    tier:1 },
  'au/cases/vic/VSCA':   { name:'VIC Court of Appeal',  abbr:'VSCA',   tier:1 },
  'au/cases/vic/VCC':    { name:'VIC County Court',     abbr:'VCC',    tier:2 },
  'au/cases/vic/VCAT':   { name:'VCAT',                 abbr:'VCAT',   tier:3 },
  'au/cases/qld/QSC':    { name:'QLD Supreme Court',    abbr:'QSC',    tier:1 },
  'au/cases/qld/QCA':    { name:'QLD Court of Appeal',  abbr:'QCA',    tier:1 },
  'au/cases/sa/SASC':    { name:'SA Supreme Court',     abbr:'SASC',   tier:1 },
  'au/cases/wa/WASC':    { name:'WA Supreme Court',     abbr:'WASC',   tier:1 },
  'au/cases/wa/WASCA':   { name:'WA Court of Appeal',   abbr:'WASCA',  tier:1 },
  'au/cases/tas/TASSC':  { name:'TAS Supreme Court',    abbr:'TASSC',  tier:1 },
  'au/cases/act/ACTSC':  { name:'ACT Supreme Court',    abbr:'ACTSC',  tier:1 },
  'au/cases/act/ACAT':   { name:'ACT Civil & Admin Tribunal','abbr':'ACAT',tier:3},
  'au/cases/nt/NTSC':    { name:'NT Supreme Court',     abbr:'NTSC',   tier:1 },
  'gov.au/legis/cth/act':{ name:'Commonwealth Act',     abbr:'Cth Act',tier:0 },
  'gov.au/legis/cth/legislativeinstrument':{ name:'Legislative Instrument','abbr':'Leg. Inst.',tier:0},
  'gov.au/legis/cth/notifiableinstrument': { name:'Notifiable Instrument','abbr':'Not. Inst.',tier:0},
  'gov.au/legis/cth/constitution':{ name:'Constitution','abbr':'Constitution',tier:0},
  'gov.au/legis/cth/gazette':{ name:'Commonwealth Gazette','abbr':'Gazette',tier:0},
  'gov.vic/legis':        { name:'Victorian Legislation', abbr:'VIC Legis',tier:0},
  'au/legis/cth/consol_act':{ name:'Cth Consolidated Acts','abbr':'Cth Act',tier:0},
};

function courtInfo(feedCode) {
  return COURT[feedCode] || { name: feedCode.split('/').pop().toUpperCase(), abbr: feedCode.split('/').pop().toUpperCase(), tier: 9 };
}

// ── HTML ──────────────────────────────────────────────────────────────────────
const HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LexAU — Australian Legal Corpus</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0c0e14;--surface:#13151f;--surface2:#1a1d28;--border:#252836;--border2:#2f3347;
  --accent:#5b8dee;--accent-dim:#1e2d4a;--purple:#8b5cf6;--purple-dim:#2d1f4a;
  --text:#e8eaf2;--text2:#9ca3b8;--text3:#5c6280;
  --green:#22c55e;--green-dim:#0f2a1a;--amber:#f59e0b;--red:#ef4444;--red-dim:#2a1010;
  --tier1:#ffd700;--tier2:#c0c0c0;--tier3:#cd7f32;
  --radius:10px;--radius-sm:7px;
}
html{font-size:14px}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;overflow:hidden;height:100vh;display:flex;flex-direction:column}

/* ── Scrollbars ── */
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}

/* ── Status bar ── */
#statusbar{background:var(--surface);border-bottom:1px solid var(--border);padding:5px 18px;display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text3);flex-shrink:0}
.dot{width:7px;height:7px;border-radius:50%;background:var(--text3);flex-shrink:0;transition:background .3s}
.dot.scraping{background:var(--green);animation:pulse 1.2s ease-in-out infinite}
.dot.waiting{background:var(--accent)}
.dot.crashed{background:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
#statusbar b{color:var(--text)}
.sb-sep{color:var(--border2)}
#total-pill{background:var(--accent-dim);color:var(--accent);border-radius:20px;padding:1px 8px;font-weight:600;font-size:11px;transition:color .3s,background .3s}
#total-pill.flash{background:var(--green-dim);color:var(--green)}

/* ── Header ── */
header{background:var(--surface);border-bottom:1px solid var(--border);padding:10px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0}
.logo{font-size:16px;font-weight:800;white-space:nowrap;letter-spacing:-.5px}
.logo em{color:var(--accent);font-style:normal}
.search-wrap{flex:1;position:relative;max-width:700px}
.search-wrap input{width:100%;background:var(--bg);border:1.5px solid var(--border2);color:var(--text);padding:8px 40px 8px 36px;border-radius:8px;font-size:14px;outline:none;transition:border-color .15s}
.search-wrap input:focus{border-color:var(--accent)}
.search-wrap input::placeholder{color:var(--text3)}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none;font-size:15px}
.search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--text3);cursor:pointer;padding:2px;border:none;background:none;font-size:14px;display:none}
.search-clear.vis{display:block}
.hdr-btns{display:flex;gap:6px;margin-left:auto}
button{cursor:pointer;border:none;font-family:inherit;font-size:13px;font-weight:600;border-radius:var(--radius-sm);padding:7px 13px;transition:all .12s}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{opacity:.85}
.btn-ghost{background:var(--surface2);color:var(--text2);border:1px solid var(--border2)}.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
.btn-danger{background:var(--red-dim);color:var(--red);border:1px solid #3a1515}.btn-danger:hover{background:var(--red);color:#fff}
.btn-danger:disabled{opacity:.4;cursor:default}
.btn-icon{padding:7px 10px;font-size:15px}

/* ── Layout ── */
.app-body{display:grid;grid-template-columns:220px 1fr;flex:1;overflow:hidden}
aside{background:var(--surface);border-right:1px solid var(--border);overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:16px}
.main{overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:14px}

/* ── Sidebar ── */
.side-section h4{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--text3);margin-bottom:8px;font-weight:700}
.stat-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:2px}
.stat-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:9px 10px}
.stat-card .n{font-size:18px;font-weight:800;color:var(--accent);line-height:1}
.stat-card .l{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-top:3px}

.filter-group{display:flex;flex-direction:column;gap:3px}
.pill{display:flex;align-items:center;justify-content:space-between;width:100%;background:transparent;border:1px solid transparent;color:var(--text2);padding:5px 9px;border-radius:6px;cursor:pointer;font-size:12px;text-align:left;transition:all .12s}
.pill:hover{background:var(--surface2);color:var(--text);border-color:var(--border2)}
.pill.active{background:var(--accent-dim);color:var(--accent);border-color:var(--accent);font-weight:600}
.pill .pn{font-size:11px;opacity:.6;font-weight:400}
.pill.active .pn{opacity:.8}

.year-inputs{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.year-inputs input{background:var(--bg);border:1px solid var(--border2);color:var(--text);padding:5px 8px;border-radius:6px;font-size:12px;width:100%;outline:none}
.year-inputs input:focus{border-color:var(--accent)}

.sort-row{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.sort-btn{background:var(--bg);border:1px solid var(--border);color:var(--text2);padding:5px 6px;border-radius:6px;font-size:11px;font-weight:500;text-align:center;cursor:pointer;transition:all .12s}
.sort-btn:hover{border-color:var(--border2);color:var(--text)}
.sort-btn.active{background:var(--accent-dim);border-color:var(--accent);color:var(--accent);font-weight:700}

.bookmarks-list{display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto}
.bm-item{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:6px;cursor:pointer;font-size:11px;color:var(--text2);background:var(--bg);border:1px solid var(--border)}
.bm-item:hover{border-color:var(--border2);color:var(--text)}
.bm-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bm-del{color:var(--text3);font-size:13px;flex-shrink:0;background:none;border:none;cursor:pointer;padding:0 2px}
.bm-del:hover{color:var(--red)}
.no-bookmarks{font-size:11px;color:var(--text3);padding:4px 2px}

/* ── Results header ── */
.results-meta{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--text2)}
.results-meta b{color:var(--text)}

/* ── Result cards ── */
.results-grid{display:flex;flex-direction:column;gap:8px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;cursor:pointer;transition:border-color .12s,background .12s}
.card:hover{border-color:var(--border2);background:var(--surface2)}
.card.active{border-color:var(--accent);background:var(--accent-dim)}
.card-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
.tier-bar{width:3px;border-radius:2px;flex-shrink:0;margin-top:3px;align-self:stretch}
.tier-0{background:var(--accent)} .tier-1{background:var(--tier1)} .tier-2{background:var(--tier2)} .tier-3{background:var(--tier3)} .tier-9{background:var(--text3)}
.card-title{font-size:13px;font-weight:600;line-height:1.4;flex:1}
.card-snippet{font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:9px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-snippet b{color:var(--amber);font-weight:700}
.card-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.badge-court{background:#1e2d4a;color:var(--accent)}
.badge-type-case{background:#1a2e3a;color:#60c0fa}
.badge-type-legis{background:var(--green-dim);color:var(--green)}
.badge-juris{background:var(--surface2);color:var(--text2);border:1px solid var(--border2)}
.badge-year{background:transparent;color:var(--text3);padding:2px 4px}
.badge-tier1{background:#2a2210;color:var(--tier1)}
.load-more{background:var(--surface2);border:1px solid var(--border2);color:var(--text2);width:100%;padding:10px;border-radius:var(--radius-sm);font-size:13px;transition:all .12s}
.load-more:hover{border-color:var(--accent);color:var(--accent)}

/* ── Empty / loading ── */
.empty{text-align:center;padding:60px 20px;color:var(--text3)}
.empty .icon{font-size:40px;margin-bottom:12px;opacity:.4}
.empty p{font-size:15px}
.empty small{font-size:12px;margin-top:6px;display:block;opacity:.7}

/* ── Document modal ── */
#modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
#modal-backdrop.open{display:flex}
#modal{background:var(--surface);border:1px solid var(--border2);border-radius:14px;width:100%;max-width:820px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,.6)}
.modal-header{padding:20px 22px 16px;border-bottom:1px solid var(--border);flex-shrink:0}
.modal-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.modal-title{font-size:17px;font-weight:700;line-height:1.4;color:var(--text)}
.modal-body{padding:18px 22px;overflow-y:auto;flex:1}
.modal-desc{color:var(--text2);font-size:13px;line-height:1.7;background:var(--bg);border-radius:var(--radius-sm);padding:14px;font-family:ui-monospace,monospace;white-space:pre-wrap;word-break:break-word}
.modal-footer{padding:14px 22px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap}
.modal-url{font-size:11px;color:var(--text3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-link{background:var(--accent-dim);color:var(--accent);border:1px solid var(--accent);padding:7px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:5px;transition:all .12s}
.btn-link:hover{background:var(--accent);color:#fff}
.btn-copy{background:var(--surface2);color:var(--text2);border:1px solid var(--border2)}
.btn-copy:hover{border-color:var(--green);color:var(--green)}
.btn-copy.copied{background:var(--green-dim);border-color:var(--green);color:var(--green)}
.btn-bookmark{background:var(--purple-dim);color:var(--purple);border:1px solid var(--purple)}
.btn-bookmark:hover{background:var(--purple);color:#fff}
.btn-bookmark.saved{background:var(--purple);color:#fff}
.modal-close{background:var(--surface2);color:var(--text2);border:1px solid var(--border2);padding:6px 10px;font-size:16px;border-radius:var(--radius-sm)}
.modal-close:hover{border-color:var(--red);color:var(--red)}
.no-fulltext{color:var(--text3);font-size:12px;text-align:center;padding:30px;background:var(--bg);border-radius:var(--radius-sm)}

/* ── Keyboard hint ── */
.kbd{display:inline-block;background:var(--bg);border:1px solid var(--border2);border-radius:4px;padding:1px 6px;font-size:10px;font-family:ui-monospace,monospace;color:var(--text3)}
</style>
</head>
<body>

<!-- Status bar -->
<div id="statusbar">
  <div class="dot" id="dot"></div>
  <span id="sb-msg">Loading…</span>
  <span class="sb-sep">·</span>
  <span id="total-pill">—</span>
  <span class="sb-sep" id="sb-feed-sep" style="display:none">·</span>
  <span id="sb-feed" style="display:none"></span>
  <span class="sb-sep" id="sb-new-sep" style="display:none">·</span>
  <span id="sb-new" style="display:none"></span>
  <span class="sb-sep" id="sb-next-sep" style="display:none">·</span>
  <span id="sb-next" style="display:none"></span>
</div>

<!-- Header -->
<header>
  <div class="logo">Lex<em>AU</em></div>
  <div class="search-wrap">
    <span class="search-icon">⌕</span>
    <input id="q" type="search" placeholder="Search case law and legislation… (press / to focus)" autocomplete="off" spellcheck="false">
    <button class="search-clear" id="q-clear" onclick="clearQ()">✕</button>
  </div>
  <div class="hdr-btns">
    <button class="btn-ghost btn-icon" onclick="doSearch()" title="Search">↵</button>
    <button class="btn-danger" id="restart-btn" onclick="restartScraper()" title="Restart scraper now">⟳ Restart</button>
  </div>
</header>

<!-- App body -->
<div class="app-body">
  <!-- Sidebar -->
  <aside id="sidebar">
    <!-- Stats -->
    <div class="side-section">
      <h4>Corpus</h4>
      <div class="stat-row" id="stats-cards"></div>
    </div>

    <!-- Type -->
    <div class="side-section">
      <h4>Type</h4>
      <div class="filter-group" id="type-filters"></div>
    </div>

    <!-- Jurisdiction -->
    <div class="side-section">
      <h4>Jurisdiction</h4>
      <div class="filter-group" id="juris-filters"></div>
    </div>

    <!-- Year -->
    <div class="side-section">
      <h4>Year range</h4>
      <div class="year-inputs">
        <input id="year-from" type="number" placeholder="From" min="1900" max="2026">
        <input id="year-to"   type="number" placeholder="To"   min="1900" max="2026">
      </div>
    </div>

    <!-- Sort -->
    <div class="side-section">
      <h4>Sort</h4>
      <div class="sort-row">
        <div class="sort-btn active" data-sort="relevance" onclick="setSort('relevance')">Relevance</div>
        <div class="sort-btn" data-sort="newest" onclick="setSort('newest')">Newest</div>
        <div class="sort-btn" data-sort="oldest" onclick="setSort('oldest')">Oldest</div>
        <div class="sort-btn" data-sort="alpha" onclick="setSort('alpha')">A–Z</div>
      </div>
    </div>

    <!-- Bookmarks -->
    <div class="side-section" style="flex:1">
      <h4>Bookmarks <span id="bm-count" style="color:var(--text3);font-weight:400"></span></h4>
      <div class="bookmarks-list" id="bm-list"></div>
    </div>
  </aside>

  <!-- Main -->
  <div class="main" id="main">
    <div class="empty">
      <div class="icon">⚖️</div>
      <p>Search Australian case law and legislation</p>
      <small>143,000+ documents · press <span class="kbd">/</span> to search · <span class="kbd">Esc</span> to close</small>
    </div>
  </div>
</div>

<!-- Admin login modal -->
<div id="admin-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:200;display:none;align-items:center;justify-content:center;backdrop-filter:blur(6px)" onclick="if(event.target===this)closeAdmin()">
  <div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;width:340px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.7)">
    <div style="font-size:20px;margin-bottom:4px">🔐</div>
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">Admin required</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:20px">Enter the admin password to restart the scraper.</div>
    <input id="admin-pw" type="password" placeholder="Password" autocomplete="current-password"
      style="width:100%;background:var(--bg);border:1.5px solid var(--border2);color:var(--text);padding:9px 12px;border-radius:8px;font-size:14px;outline:none;margin-bottom:12px"
      onkeydown="if(event.key==='Enter')submitAdmin()">
    <div id="admin-err" style="font-size:12px;color:var(--red);min-height:16px;margin-bottom:12px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" style="flex:1" onclick="submitAdmin()">Confirm</button>
      <button class="btn-ghost" onclick="closeAdmin()">Cancel</button>
    </div>
  </div>
</div>

<!-- Document modal -->
<div id="modal-backdrop" onclick="closeModal(event)">
  <div id="modal">
    <div class="modal-header">
      <div class="modal-badges" id="modal-badges"></div>
      <div class="modal-title" id="modal-title"></div>
    </div>
    <div class="modal-body">
      <div id="modal-content"></div>
    </div>
    <div class="modal-footer">
      <span class="modal-url" id="modal-url"></span>
      <button class="btn-copy" id="btn-copy" onclick="copyCitation()">📋 Copy citation</button>
      <button class="btn-bookmark" id="btn-bookmark" onclick="toggleBookmark()">🔖 Save</button>
      <a class="btn-link" id="modal-link" href="#" target="_blank" rel="noopener">↗ Open source</a>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
  </div>
</div>

<script>
// ── State ──────────────────────────────────────────────────────────────────────
const S = {
  q: '', type: '', juris: '', sort: 'relevance',
  yearFrom: '', yearTo: '', offset: 0, limit: 30,
  activeDocId: null,
};
let lastTotal = null;
let bookmarks = JSON.parse(localStorage.getItem('lex-bookmarks') || '{}');
let activeDocData = null;

const JURIS = {cth:'Commonwealth',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia',wa:'Western Australia',tas:'Tasmania',nt:'Northern Territory',act:'ACT'};
const COURT = ${JSON.stringify(Object.fromEntries(
  Object.entries({
    'au/cases/cth/HCA':'HCA','au/cases/cth/FCAFC':'FCAFC','au/cases/cth/FCA':'FCA',
    'au/cases/cth/FCCA':'FCCA','au/cases/cth/FamCA':'FamCA','au/cases/cth/FamCAFC':'FamCAFC',
    'au/cases/cth/AATA':'AATA','au/cases/cth/FWC':'FWC','au/cases/cth/FWCFB':'FWCFB',
    'au/cases/cth/MRD':'MRD','au/cases/cth/RRT':'RRT',
    'au/cases/nsw/NSWSC':'NSWSC','au/cases/nsw/NSWCA':'NSWCA','au/cases/nsw/NSWCCA':'NSWCCA',
    'au/cases/nsw/NSWDC':'NSWDC','au/cases/nsw/NSWLC':'NSWLC',
    'au/cases/vic/VSC':'VSC','au/cases/vic/VSCA':'VSCA','au/cases/vic/VCC':'VCC','au/cases/vic/VCAT':'VCAT',
    'au/cases/qld/QSC':'QSC','au/cases/qld/QCA':'QCA',
    'au/cases/sa/SASC':'SASC','au/cases/wa/WASC':'WASC','au/cases/wa/WASCA':'WASCA',
    'au/cases/tas/TASSC':'TASSC','au/cases/act/ACTSC':'ACTSC','au/cases/act/ACAT':'ACAT',
    'au/cases/nt/NTSC':'NTSC',
    'gov.au/legis/cth/act':'Cth Act','gov.au/legis/cth/legislativeinstrument':'Leg. Inst.',
    'gov.au/legis/cth/notifiableinstrument':'Not. Inst.','gov.au/legis/cth/gazette':'Gazette',
    'gov.au/legis/cth/constitution':'Constitution','gov.vic/legis':'VIC Legis',
    'au/legis/cth/consol_act':'Cth Consol.',
  }).map(([k,v]) => [k, v])
))};
const TIER1_COURTS = new Set(['au/cases/cth/HCA','au/cases/nsw/NSWCA','au/cases/nsw/NSWCCA','au/cases/nsw/NSWSC','au/cases/vic/VSCA','au/cases/vic/VSC','au/cases/qld/QCA','au/cases/qld/QSC','au/cases/sa/SASC','au/cases/wa/WASCA','au/cases/wa/WASC','au/cases/tas/TASSC','au/cases/act/ACTSC','au/cases/nt/NTSC','au/cases/cth/FCAFC','au/cases/cth/FamCAFC']);

function $(id){return document.getElementById(id)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmt(n){return(n??0).toLocaleString()}
function yr(d){if(!d)return'';const y=new Date(d).getFullYear();return isNaN(y)?'':y}

// ── URL state ─────────────────────────────────────────────────────────────────
function pushState(){
  const p=new URLSearchParams();
  if(S.q)        p.set('q',S.q);
  if(S.type)     p.set('type',S.type);
  if(S.juris)    p.set('juris',S.juris);
  if(S.sort!=='relevance') p.set('sort',S.sort);
  if(S.yearFrom) p.set('from',S.yearFrom);
  if(S.yearTo)   p.set('to',S.yearTo);
  history.replaceState(null,'','?'+p.toString());
}
function loadState(){
  const p=new URLSearchParams(location.search);
  S.q=p.get('q')||''; S.type=p.get('type')||''; S.juris=p.get('juris')||'';
  S.sort=p.get('sort')||'relevance'; S.yearFrom=p.get('from')||''; S.yearTo=p.get('to')||'';
  if(S.q) $('q').value=S.q;
  if(S.yearFrom) $('year-from').value=S.yearFrom;
  if(S.yearTo)   $('year-to').value=S.yearTo;
  document.querySelectorAll('.sort-btn').forEach(b=>{b.classList.toggle('active',b.dataset.sort===S.sort)});
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(path){const r=await fetch(path);return r.json()}

// ── Poll status & stats ───────────────────────────────────────────────────────
async function pollStatus(){
  try{
    const s=await api('/api/status');
    const dot=$('dot');
    dot.className='dot '+(s.running?'scraping':s.phase==='waiting'?'waiting':s.phase==='crashed'?'crashed':'');
    $('sb-msg').innerHTML=s.running?'<b>Scraping</b>':s.phase==='waiting'?'Idle':s.phase==='crashed'?'<span style="color:var(--red)">Crashed</span>':s.lastCompletedAt?'Last run: '+fmtAgo(s.lastCompletedAt):'Not started';
    const showFeed=s.running&&s.feedsTotal>0;
    $('sb-feed-sep').style.display=showFeed?'':'none';
    $('sb-feed').style.display=showFeed?'':'none';
    if(showFeed) $('sb-feed').textContent=\`Feed \${s.feedsDone}/\${s.feedsTotal} — \${s.currentFeed||'…'}\`;
    const showNew=s.newThisRun>0;
    $('sb-new-sep').style.display=showNew?'':'none';
    $('sb-new').style.display=showNew?'':'none';
    if(showNew) $('sb-new').innerHTML=\`<span style="color:var(--green);font-weight:700">+\${fmt(s.newThisRun)}</span> new\`;
    const showNext=!s.running&&s.nextRunAt;
    $('sb-next-sep').style.display=showNext?'':'none';
    $('sb-next').style.display=showNext?'':'none';
    if(showNext) $('sb-next').textContent='Next: '+fmtCountdown(s.nextRunAt);
  }catch{}
}

async function pollStats(){
  try{
    const s=await api('/api/stats');
    const pill=$('total-pill');
    if(lastTotal!==null&&s.total>lastTotal){
      pill.classList.add('flash');
      setTimeout(()=>pill.classList.remove('flash'),2000);
    }
    pill.textContent=fmt(s.total)+' docs';
    lastTotal=s.total;
    renderSidebar(s);
  }catch{}
}

function fmtAgo(iso){const d=Date.now()-new Date(iso);const m=Math.floor(d/60000);return m<1?'just now':m<60?m+'m ago':Math.floor(m/60)+'h ago'}
function fmtCountdown(iso){const d=new Date(iso)-Date.now();if(d<=0)return'soon';const h=Math.floor(d/3600000),m=Math.floor((d%3600000)/60000);return h>0?\`\${h}h \${m}m\`:\`\${m}m\`}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar(s){
  $('stats-cards').innerHTML=\`
    <div class="stat-card"><div class="n">\${fmt(s.case_law)}</div><div class="l">Cases</div></div>
    <div class="stat-card"><div class="n">\${fmt(s.legislation)}</div><div class="l">Legislation</div></div>
  \`;

  $('type-filters').innerHTML=\`
    <button class="pill \${!S.type?'active':''}" onclick="setFilter('type','')">All types</button>
    <button class="pill \${S.type==='case_law'?'active':''}" onclick="setFilter('type','case_law')">⚖️ Case law <span class="pn">\${fmt(s.case_law)}</span></button>
    <button class="pill \${S.type==='legislation'?'active':''}" onclick="setFilter('type','legislation')">📜 Legislation <span class="pn">\${fmt(s.legislation)}</span></button>
  \`;

  $('juris-filters').innerHTML=\`
    <button class="pill \${!S.juris?'active':''}" onclick="setFilter('juris','')">All</button>
    \${s.by_jurisdiction.map(j=>\`
      <button class="pill \${S.juris===j.jurisdiction?'active':''}" onclick="setFilter('juris','\${j.jurisdiction}')">
        \${JURIS[j.jurisdiction]||j.jurisdiction} <span class="pn">\${fmt(j.n)}</span>
      </button>
    \`).join('')}
  \`;
}

// ── Filters & sort ────────────────────────────────────────────────────────────
function setFilter(key,val){
  S.offset=0;
  if(key==='type') S.type=val;
  else S.juris=val;
  doSearch();
}
function setSort(val){
  S.sort=val; S.offset=0;
  document.querySelectorAll('.sort-btn').forEach(b=>b.classList.toggle('active',b.dataset.sort===val));
  if(S.q||S.type||S.juris) doSearch();
}

// ── Search ────────────────────────────────────────────────────────────────────
let _searchDebounce;
function queueSearch(){clearTimeout(_searchDebounce);_searchDebounce=setTimeout(()=>{S.offset=0;doSearch()},350)}

async function doSearch(append=false){
  S.q=$('q').value.trim();
  S.yearFrom=$('year-from').value.trim();
  S.yearTo=$('year-to').value.trim();
  if(!append) S.offset=0;
  $('q-clear').classList.toggle('vis',!!S.q);

  if(!S.q&&!S.type&&!S.juris&&!S.yearFrom&&!S.yearTo){
    $('main').innerHTML='<div class="empty"><div class="icon">⚖️</div><p>Search Australian case law and legislation</p><small>143,000+ documents · press <span class="kbd">/</span> to focus · <span class="kbd">Esc</span> to close document</small></div>';
    pushState(); return;
  }

  if(!append) $('main').innerHTML='<div class="empty"><p style="font-size:13px">Searching…</p></div>';

  let url='/api/search?limit='+S.limit+'&offset='+S.offset;
  if(S.q)       url+='&q='+encodeURIComponent(S.q);
  if(S.type)    url+='&type='+S.type;
  if(S.juris)   url+='&jurisdiction='+S.juris;
  if(S.sort)    url+='&sort='+S.sort;
  if(S.yearFrom)url+='&year_from='+S.yearFrom;
  if(S.yearTo)  url+='&year_to='+S.yearTo;

  pushState();

  try{
    const data=await api(url);
    renderResults(data,append);
  }catch(e){
    $('main').innerHTML=\`<div class="empty"><p style="color:var(--red)">\${esc(e.message)}</p></div>\`;
  }
}

function clearQ(){
  $('q').value=''; S.q=''; S.offset=0;
  $('q-clear').classList.remove('vis');
  if(!S.type&&!S.juris) $('main').innerHTML='<div class="empty"><div class="icon">⚖️</div><p>Search Australian case law and legislation</p><small>143,000+ documents · press <span class="kbd">/</span> to focus</small></div>';
  else doSearch();
}

// ── Results ───────────────────────────────────────────────────────────────────
function renderResults(data,append=false){
  const results=data.results||[];
  const total=data.count??results.length;
  const hasMore=results.length===S.limit&&(S.offset+results.length)<total;

  if(!append){
    if(!results.length){
      $('main').innerHTML='<div class="empty"><div class="icon">🔍</div><p>No results'+(S.q?' for <b>'+esc(S.q)+'</b>':'')+'</p><small>Try broader terms or remove filters</small></div>';
      return;
    }
    const meta=\`<div class="results-meta"><span>Showing <b>\${fmt(results.length)}</b> of <b>\${fmt(total)}</b>\${S.q?' for <b>'+esc(S.q)+'</b>':''}</span></div>\`;
    $('main').innerHTML=meta+'<div class="results-grid" id="results-grid"></div>';
  }

  const grid=$('results-grid');
  results.forEach(r=>{
    const court=COURT[r.feed_code]||r.feed_code?.split('/').pop()?.toUpperCase()||'';
    const tier=TIER1_COURTS.has(r.feed_code)?1:r.type==='legislation'?0:r.feed_code?.includes('/cas')?2:9;
    const year=yr(r.pub_date)||yr(r.fetched_at)||'';
    const typeLabel=r.type==='case_law'?'Case Law':'Legislation';
    const typeClass=r.type==='case_law'?'badge-type-case':'badge-type-legis';
    const div=document.createElement('div');
    div.className='card'; div.dataset.id=r.id;
    div.innerHTML=\`
      <div class="card-top">
        <div class="tier-bar tier-\${tier}"></div>
        <div class="card-title">\${esc(r.title||'(untitled)')}</div>
      </div>
      \${r.snippet?\`<div class="card-snippet">\${r.snippet}</div>\`:''}
      <div class="card-meta">
        \${court?\`<span class="badge badge-court">\${esc(court)}</span>\`:''}
        <span class="badge \${typeClass}">\${typeLabel}</span>
        <span class="badge badge-juris">\${(JURIS[r.jurisdiction]||r.jurisdiction||'').split(' ')[0]}</span>
        \${year?\`<span class="badge badge-year">\${year}</span>\`:''}
        \${tier===1?\`<span class="badge badge-tier1">★ Superior</span>\`:''}
      </div>
    \`;
    div.onclick=()=>openDoc(r.id,div);
    grid.appendChild(div);
  });

  // Remove old load-more if any
  const oldMore=document.getElementById('load-more-btn');
  if(oldMore) oldMore.remove();

  if(hasMore){
    const btn=document.createElement('button');
    btn.id='load-more-btn'; btn.className='load-more';
    btn.textContent=\`Load more (\${fmt(total-S.offset-results.length)} remaining)\`;
    btn.onclick=()=>{S.offset+=S.limit;doSearch(true)};
    $('main').appendChild(btn);
  }
}

// ── Document modal ────────────────────────────────────────────────────────────
async function openDoc(id,el){
  document.querySelectorAll('.card.active').forEach(c=>c.classList.remove('active'));
  el?.classList.add('active');
  S.activeDocId=id;

  // Show modal with loading state
  $('modal-badges').innerHTML='';
  $('modal-title').textContent='Loading…';
  $('modal-content').innerHTML='<div class="no-fulltext">Loading document…</div>';
  $('modal-link').href='#';
  $('modal-url').textContent='';
  $('modal-backdrop').classList.add('open');
  document.body.style.overflow='hidden';

  const doc=await api('/api/document/'+id);
  activeDocData=doc;
  if(!doc||doc.error){$('modal-title').textContent='Error loading document';return}

  const court=COURT[doc.feed_code]||doc.feed_code?.split('/').pop()?.toUpperCase()||'';
  const year=yr(doc.pub_date)||yr(doc.fetched_at)||'';
  const tier=TIER1_COURTS.has(doc.feed_code);

  $('modal-badges').innerHTML=\`
    \${court?\`<span class="badge badge-court">\${esc(court)}</span>\`:''}
    <span class="badge \${doc.type==='case_law'?'badge-type-case':'badge-type-legis'}">\${doc.type==='case_law'?'Case Law':'Legislation'}</span>
    <span class="badge badge-juris">\${JURIS[doc.jurisdiction]||doc.jurisdiction||''}</span>
    \${year?\`<span class="badge badge-year">\${year}</span>\`:''}
    \${tier?\`<span class="badge badge-tier1">★ Superior Court</span>\`:''}
  \`;
  $('modal-title').textContent=doc.title||'(untitled)';

  const body=doc.full_text||doc.description||'';
  if(body){
    $('modal-content').innerHTML=\`<div class="modal-desc">\${esc(body.slice(0,5000))}\${body.length>5000?'\\n\\n[document continues on source…]':''}</div>\`;
  } else {
    $('modal-content').innerHTML='<div class="no-fulltext">📄 Full text not yet fetched.<br>Click "Open source" to read on AustLII or legislation.gov.au.</div>';
  }

  $('modal-link').href=doc.url||'#';
  $('modal-url').textContent=doc.url||'';

  const saved=!!bookmarks[id];
  $('btn-bookmark').textContent=saved?'🔖 Saved':'🔖 Save';
  $('btn-bookmark').classList.toggle('saved',saved);
  $('btn-copy').textContent='📋 Copy citation';
  $('btn-copy').classList.remove('copied');
}

function closeModal(e){
  if(e&&e.target!=$('modal-backdrop')&&e.target!==$('modal-backdrop')) return;
  if(e&&e.target.closest('#modal')) return;
  $('modal-backdrop').classList.remove('open');
  document.body.style.overflow='';
  document.querySelectorAll('.card.active').forEach(c=>c.classList.remove('active'));
  S.activeDocId=null; activeDocData=null;
}

function copyCitation(){
  if(!activeDocData) return;
  navigator.clipboard.writeText(activeDocData.title||activeDocData.url||'').then(()=>{
    $('btn-copy').textContent='✓ Copied!';
    $('btn-copy').classList.add('copied');
    setTimeout(()=>{$('btn-copy').textContent='📋 Copy citation';$('btn-copy').classList.remove('copied')},2000);
  });
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────
function saveBookmarks(){localStorage.setItem('lex-bookmarks',JSON.stringify(bookmarks));renderBookmarks()}

function toggleBookmark(){
  if(!activeDocData) return;
  const id=String(S.activeDocId);
  if(bookmarks[id]){delete bookmarks[id];$('btn-bookmark').textContent='🔖 Save';$('btn-bookmark').classList.remove('saved')}
  else{bookmarks[id]={id,title:activeDocData.title,type:activeDocData.type,jurisdiction:activeDocData.jurisdiction,feed_code:activeDocData.feed_code};$('btn-bookmark').textContent='🔖 Saved';$('btn-bookmark').classList.add('saved')}
  saveBookmarks();
}

function renderBookmarks(){
  const list=$('bm-list');
  const items=Object.values(bookmarks);
  $('bm-count').textContent=items.length?'('+items.length+')':'';
  if(!items.length){list.innerHTML='<div class="no-bookmarks">No saved items yet</div>';return}
  list.innerHTML=items.map(b=>\`
    <div class="bm-item" onclick="openDocById(\${b.id})">
      <span class="bm-title" title="\${esc(b.title)}">\${esc(b.title)}</span>
      <button class="bm-del" onclick="event.stopPropagation();delBookmark('\${b.id}')" title="Remove">✕</button>
    </div>
  \`).join('');
}

function delBookmark(id){delete bookmarks[id];saveBookmarks()}

async function openDocById(id){
  S.activeDocId=id;
  $('modal-badges').innerHTML='';
  $('modal-title').textContent='Loading…';
  $('modal-content').innerHTML='';
  $('modal-backdrop').classList.add('open');
  document.body.style.overflow='hidden';
  const doc=await api('/api/document/'+id);
  activeDocData=doc;
  $('modal-title').textContent=doc.title||'(untitled)';
  $('modal-content').innerHTML=doc.full_text||doc.description?
    \`<div class="modal-desc">\${esc((doc.full_text||doc.description||'').slice(0,5000))}</div>\`:
    '<div class="no-fulltext">📄 No full text. Click "Open source" to read the document.</div>';
  $('modal-link').href=doc.url||'#';
  $('modal-url').textContent=doc.url||'';
  const saved=!!bookmarks[String(id)];
  $('btn-bookmark').textContent=saved?'🔖 Saved':'🔖 Save';
  $('btn-bookmark').classList.toggle('saved',saved);
}

// ── Admin auth ────────────────────────────────────────────────────────────────
function restartScraper(){
  // Already authenticated this session — go straight to restart
  if(sessionStorage.getItem('admin-pw')){ doRestart(); return; }
  $('admin-pw').value=''; $('admin-err').textContent='';
  $('admin-backdrop').style.display='flex';
  setTimeout(()=>$('admin-pw').focus(), 80);
}

function closeAdmin(){ $('admin-backdrop').style.display='none'; }

async function submitAdmin(){
  const pw = $('admin-pw').value;
  if(!pw) return;
  const r = await fetch('/api/restart', { method:'POST', headers:{'x-admin-password': pw} });
  if(r.status===401){
    $('admin-err').textContent='Wrong password.';
    $('admin-pw').select();
    return;
  }
  // Success — cache pw for this session and show result
  sessionStorage.setItem('admin-pw', pw);
  closeAdmin();
  showRestartResult((await r.json()).ok);
}

async function doRestart(){
  const pw = sessionStorage.getItem('admin-pw') || '';
  const r  = await fetch('/api/restart', { method:'POST', headers:{'x-admin-password': pw} });
  if(r.status===401){
    // Session pw stale — clear and re-prompt
    sessionStorage.removeItem('admin-pw');
    restartScraper();
    return;
  }
  showRestartResult((await r.json()).ok);
}

function showRestartResult(ok){
  const btn=$('restart-btn'); btn.disabled=true;
  if(ok){
    btn.textContent='✓ Restarted'; btn.style.background='var(--green)'; btn.style.color='#000';
    setTimeout(()=>{ btn.disabled=false; btn.textContent='⟳ Restart'; btn.style.background=''; btn.style.color=''; }, 3000);
  } else {
    btn.textContent='✗ Failed';
    setTimeout(()=>{ btn.disabled=false; btn.textContent='⟳ Restart'; }, 3000);
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.key==='/' && document.activeElement!==$('q')){
    e.preventDefault(); $('q').focus(); $('q').select();
  }
  if(e.key==='Escape'){
    if($('modal-backdrop').classList.contains('open')){closeModal();return}
    if(S.q){clearQ();return}
  }
  if(e.key==='Enter' && document.activeElement===$('q')){ e.preventDefault(); S.offset=0; doSearch(); }
});
$('q').addEventListener('input',queueSearch);
$('year-from').addEventListener('change',()=>{S.offset=0;doSearch()});
$('year-to').addEventListener('change',()=>{S.offset=0;doSearch()});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadState();
renderBookmarks();
pollStats();
pollStatus();
if(S.q||S.type||S.juris||S.yearFrom||S.yearTo) doSearch();

setInterval(pollStatus, 4000);
setInterval(pollStats,  8000);
</script>
</body>
</html>`;

// ── Server ────────────────────────────────────────────────────────────────────
function jres(res, data, status=200){ res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }
function hres(res, body){ res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'}); res.end(body); }

const db = getDb();

const server = createServer((req, res) => {
  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path==='/'||path==='/index.html') return hres(res, HTML);
  if (path==='/api/stats')  return jres(res, stats());
  if (path==='/api/status') return jres(res, readStatus());

  if (path==='/api/restart' && req.method==='POST') {
    if (req.headers['x-admin-password'] !== ADMIN_PASSWORD)
      return jres(res, { ok:false, error:'Unauthorised' }, 401);
    const pid = readStatus().daemonPid;
    if (!pid) return jres(res, { ok:false, error:'Daemon not running' }, 503);
    try { process.kill(pid,'SIGUSR1'); return jres(res, { ok:true }); }
    catch(e) { return jres(res, { ok:false, error:e.message }, 500); }
  }

  if (path==='/api/search') {
    const q        = url.searchParams.get('q')||'';
    const type     = url.searchParams.get('type')||'';
    const juris    = url.searchParams.get('jurisdiction')||'';
    const sort     = url.searchParams.get('sort')||'relevance';
    const yearFrom = url.searchParams.get('year_from')||'';
    const yearTo   = url.searchParams.get('year_to')||'';
    const limit    = Math.min(parseInt(url.searchParams.get('limit')||'30',10), 200);
    const offset   = parseInt(url.searchParams.get('offset')||'0',10);

    // Build ORDER BY — fts version uses d. alias, browse version uses bare column names
    const orderByFts   = sort==='newest' ? 'ORDER BY d.pub_date DESC NULLS LAST, d.fetched_at DESC'
                       : sort==='oldest' ? 'ORDER BY d.pub_date ASC NULLS LAST'
                       : sort==='alpha'  ? 'ORDER BY d.title ASC'
                       : 'ORDER BY rank';
    const orderByBrowse = sort==='newest' ? 'ORDER BY pub_date DESC, fetched_at DESC'
                        : sort==='oldest' ? 'ORDER BY pub_date ASC'
                        : sort==='alpha'  ? 'ORDER BY title ASC'
                        : 'ORDER BY fetched_at DESC';

    const buildFilters = (alias='d') => {
      const p = alias ? alias+'.' : '';
      const clauses=[]; const params=[];
      if (type)    { clauses.push(`${p}type=?`);         params.push(type); }
      if (juris)   { clauses.push(`${p}jurisdiction=?`); params.push(juris); }
      if (yearFrom){ clauses.push(`substr(${p}pub_date,1,4) >= ?`); params.push(yearFrom); }
      if (yearTo)  { clauses.push(`substr(${p}pub_date,1,4) <= ?`); params.push(yearTo); }
      return { where: clauses.length ? 'AND '+clauses.join(' AND ') : '', params };
    };

    try {
      if (q) {
        const { where, params } = buildFilters();
        const rows = db.prepare(`
          SELECT d.id,d.title,d.url,d.pub_date,d.type,d.jurisdiction,d.feed_code,d.fetched_at,
                 snippet(documents_fts,1,'<b>','</b>','…',28) AS snippet
          FROM documents_fts f JOIN documents d ON d.id=f.rowid
          WHERE documents_fts MATCH ? ${where}
          ${orderByFts} LIMIT ? OFFSET ?
        `).all(q, ...params, limit, offset);
        const cnt = db.prepare(`
          SELECT COUNT(*) n FROM documents_fts f JOIN documents d ON d.id=f.rowid
          WHERE documents_fts MATCH ? ${where}
        `).get(q, ...params).n;
        return jres(res, { count:cnt, results:rows });
      } else {
        const { where, params } = buildFilters('');
        const rows = db.prepare(`
          SELECT id,title,url,pub_date,type,jurisdiction,feed_code,fetched_at FROM documents
          WHERE 1=1 ${where} ${orderByBrowse} LIMIT ? OFFSET ?
        `).all(...params, limit, offset);
        const cnt = db.prepare(`SELECT COUNT(*) n FROM documents WHERE 1=1 ${where}`).get(...params).n;
        return jres(res, { count:cnt, results:rows });
      }
    } catch(e) { return jres(res, { error:e.message }, 500); }
  }

  const m = path.match(/^\/api\/document\/(\d+)$/);
  if (m) {
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(parseInt(m[1],10));
    if (!doc){ res.writeHead(404); res.end(); return; }
    return jres(res, doc);
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  const u = `http://localhost:${PORT}`;
  console.log(`LexAU Viewer → ${u}`);
  import('child_process').then(({exec})=>exec(`open -a "Brave Browser" "${u}"`));
});
