/**
 * LexAU — Australian Legal Research Platform for Self-Represented Litigants
 * Run: node src/viewer.js  →  http://localhost:4242
 */
import 'dotenv/config';
import { createServer } from 'http';
import { getDb, stats } from './db.js';
import { readStatus } from './status.js';
import { AREAS, getArea, corpusSearch, situationIntake, buildArgument, summariseCase } from './research.js';
import { modelStatus, setKey, getKeys as gk, MODELS, DEFAULT_MODEL } from './ai.js';

const PORT          = process.env.PORT || 4242;
const ADMIN_PASSWORD = 'boob';

// ─── Court labels ─────────────────────────────────────────────────────────────
const COURT_ABBR = {
  'au/cases/cth/HCA':'HCA','au/cases/cth/FCAFC':'FCAFC','au/cases/cth/FCA':'FCA',
  'au/cases/cth/FCCA':'FCCA','au/cases/cth/FamCA':'FamCA','au/cases/cth/FamCAFC':'FamCAFC',
  'au/cases/cth/AATA':'AATA','au/cases/cth/FWC':'FWC','au/cases/cth/FWCFB':'FWCFB',
  'au/cases/cth/MRD':'MRD','au/cases/cth/RRT':'RRT','au/cases/nsw/NSWSC':'NSWSC',
  'au/cases/nsw/NSWCA':'NSWCA','au/cases/nsw/NSWCCA':'NSWCCA','au/cases/nsw/NSWDC':'NSWDC',
  'au/cases/nsw/NSWLC':'NSWLC','au/cases/vic/VSC':'VSC','au/cases/vic/VSCA':'VSCA',
  'au/cases/vic/VCC':'VCC','au/cases/vic/VCAT':'VCAT','au/cases/qld/QSC':'QSC',
  'au/cases/qld/QCA':'QCA','au/cases/sa/SASC':'SASC','au/cases/wa/WASC':'WASC',
  'au/cases/wa/WASCA':'WASCA','au/cases/tas/TASSC':'TASSC','au/cases/act/ACTSC':'ACTSC',
  'au/cases/act/ACAT':'ACAT','au/cases/nt/NTSC':'NTSC',
  'gov.au/legis/cth/act':'Cth Act','gov.au/legis/cth/legislativeinstrument':'Leg. Inst.',
  'gov.au/legis/cth/notifiableinstrument':'Not. Inst.','gov.au/legis/cth/gazette':'Gazette',
  'gov.au/legis/cth/constitution':'Constitution','gov.vic/legis':'VIC Legis',
  'au/legis/cth/consol_act':'Cth Consol.',
};
const SUPERIOR = new Set(['au/cases/cth/HCA','au/cases/nsw/NSWCA','au/cases/nsw/NSWCCA','au/cases/nsw/NSWSC','au/cases/vic/VSCA','au/cases/vic/VSC','au/cases/qld/QCA','au/cases/qld/QSC','au/cases/sa/SASC','au/cases/wa/WASCA','au/cases/wa/WASC','au/cases/tas/TASSC','au/cases/act/ACTSC','au/cases/nt/NTSC','au/cases/cth/FCAFC','au/cases/cth/FamCAFC']);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function jres(res,data,s=200){res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
function hres(res,b){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache'});res.end(b)}
function stream(res){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'})}
function sse(res,data){res.write(`data: ${JSON.stringify(data)}\n\n`)}
function body(req){return new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>r(b))})}

// ─── HTML ─────────────────────────────────────────────────────────────────────
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0b0d14;--s1:#111520;--s2:#171b27;--s3:#1d2133;--bd:#252a3a;--bd2:#303650;
  --accent:#5b8dee;--adim:#162040;--purple:#9b6dff;--pdim:#1f1340;
  --text:#e6e9f4;--t2:#8d95b4;--t3:#4e566e;
  --green:#22c55e;--gdim:#0b1f12;--amber:#f59e0b;--red:#ef4444;--rdim:#1f0d0d;
  --gold:#fbbf24;--silver:#9ca3b8;--bronze:#c97c3a;
  --r:10px;--r2:7px;
}
html{font-size:14px;height:100%}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;height:100%;display:flex;flex-direction:column;overflow:hidden}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px}

/* status */
#sb{background:var(--s1);border-bottom:1px solid var(--bd);padding:5px 16px;display:flex;align-items:center;gap:10px;font-size:11px;color:var(--t3);flex-shrink:0;min-height:30px}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:var(--t3);transition:background .3s}
.dot.on{background:var(--green);animation:blink 1.2s ease-in-out infinite}
.dot.wait{background:var(--accent)}.dot.err{background:var(--red)}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
#sb b{color:var(--text)}
#totalpill{background:var(--adim);color:var(--accent);border-radius:20px;padding:1px 9px;font-weight:700;font-size:11px;transition:all .3s}
#totalpill.flash{background:var(--gdim);color:var(--green)}
.sep{color:var(--bd2)}

/* header */
header{background:var(--s1);border-bottom:1px solid var(--bd);padding:9px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.logo{font-size:17px;font-weight:900;letter-spacing:-.5px;white-space:nowrap}
.logo em{color:var(--accent);font-style:normal}
.logo sub{font-size:9px;color:var(--t3);font-weight:400;letter-spacing:.1em;text-transform:uppercase;vertical-align:baseline}
/* tabs */
.tabs{display:flex;gap:2px;background:var(--bg);border-radius:8px;padding:3px;border:1px solid var(--bd);flex-shrink:0}
.tab{padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:var(--t2);background:none;border:none;transition:all .12s;white-space:nowrap}
.tab.active{background:var(--s2);color:var(--text)}
.tab:hover:not(.active){color:var(--text)}
/* search bar */
.sbar{flex:1;position:relative;max-width:640px}
.sbar input{width:100%;background:var(--bg);border:1.5px solid var(--bd2);color:var(--text);padding:7px 36px 7px 34px;border-radius:8px;font-size:13px;outline:none;transition:border-color .12s}
.sbar input:focus{border-color:var(--accent)}
.sbar input::placeholder{color:var(--t3)}
.si{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--t3);font-size:15px;pointer-events:none}
.sx{position:absolute;right:8px;top:50%;transform:translateY(-50%);color:var(--t3);background:none;border:none;cursor:pointer;font-size:13px;display:none}
.sx.v{display:block}
/* buttons */
button{cursor:pointer;border:none;font-family:inherit;font-size:13px;font-weight:600;border-radius:var(--r2);padding:7px 12px;transition:all .12s}
.bp{background:var(--accent);color:#fff}.bp:hover{opacity:.85}
.bg{background:var(--s2);color:var(--t2);border:1px solid var(--bd)}.bg:hover{border-color:var(--accent);color:var(--accent)}
.br{background:var(--rdim);color:var(--red);border:1px solid #3a1515}.br:hover{background:var(--red);color:#fff}
.br:disabled{opacity:.4;cursor:default}
.blink{background:var(--adim);color:var(--accent);border:1px solid var(--accent)}.blink:hover{background:var(--accent);color:#fff}

/* layout */
.body{display:grid;grid-template-columns:230px 1fr;flex:1;overflow:hidden}

/* sidebar */
aside{background:var(--s1);border-right:1px solid var(--bd);overflow-y:auto;padding:12px 10px;display:flex;flex-direction:column;gap:14px;flex-shrink:0}
.sh{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--t3);font-weight:700;margin-bottom:7px}
.scards{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.sc{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r2);padding:8px 10px}
.sc .n{font-size:17px;font-weight:800;color:var(--accent);line-height:1}
.sc .l{font-size:9px;color:var(--t3);text-transform:uppercase;margin-top:2px}
.fg{display:flex;flex-direction:column;gap:2px}
.pill{display:flex;align-items:center;justify-content:space-between;width:100%;background:transparent;border:1px solid transparent;color:var(--t2);padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;text-align:left}
.pill:hover{background:var(--s2);color:var(--text);border-color:var(--bd)}
.pill.on{background:var(--adim);color:var(--accent);border-color:var(--accent);font-weight:600}
.pn{font-size:10px;opacity:.6;font-weight:400}
.pill.on .pn{opacity:.8}
.yi{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.yi input{background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:5px 7px;border-radius:6px;font-size:12px;width:100%;outline:none}
.yi input:focus{border-color:var(--accent)}
.srt{display:grid;grid-template-columns:1fr 1fr;gap:3px}
.sb2{background:var(--bg);border:1px solid var(--bd);color:var(--t2);padding:4px 5px;border-radius:5px;font-size:11px;font-weight:500;text-align:center;cursor:pointer}
.sb2:hover{border-color:var(--bd2);color:var(--text)}
.sb2.on{background:var(--adim);border-color:var(--accent);color:var(--accent);font-weight:700}
.bmlist{display:flex;flex-direction:column;gap:2px;max-height:160px;overflow-y:auto}
.bm{display:flex;align-items:center;gap:5px;padding:5px 7px;border-radius:5px;cursor:pointer;font-size:11px;color:var(--t2);background:var(--bg);border:1px solid var(--bd)}
.bm:hover{color:var(--text);border-color:var(--bd2)}
.bmt{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bmd{color:var(--t3);font-size:12px;background:none;border:none;cursor:pointer;padding:0 1px}.bmd:hover{color:var(--red)}
.area-grid{display:flex;flex-direction:column;gap:3px}
.area-pill{display:flex;align-items:center;gap:7px;width:100%;background:var(--bg);border:1px solid var(--bd);color:var(--t2);padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;text-align:left}
.area-pill:hover{border-color:var(--bd2);color:var(--text)}
.area-pill.on{background:var(--pdim);border-color:var(--purple);color:var(--purple)}
.area-icon{font-size:14px;flex-shrink:0}

/* main */
.main{overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.rmeta{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--t2)}
.rmeta b{color:var(--text)}
.rgrid{display:flex;flex-direction:column;gap:7px}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:13px 14px;cursor:pointer;transition:border-color .12s,background .12s;position:relative}
.card:hover{border-color:var(--bd2);background:var(--s2)}
.card.sel{border-color:var(--accent);background:var(--adim)}
.card.pinned{border-color:var(--purple);background:var(--pdim)}
.tier{width:3px;border-radius:2px;position:absolute;left:0;top:10px;bottom:10px}
.t0{background:var(--accent)}.t1{background:var(--gold)}.t2{background:var(--silver)}.t3{background:var(--bronze)}.t9{background:var(--t3)}
.ctitle{font-size:13px;font-weight:600;line-height:1.4;padding-left:10px;margin-bottom:7px}
.csnip{font-size:12px;color:var(--t2);line-height:1.5;padding-left:10px;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.csnip b{color:var(--amber);font-weight:700}
.cmeta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding-left:10px}
.badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.02em;white-space:nowrap}
.bc{background:var(--adim);color:var(--accent)}
.bcase{background:#102030;color:#60c0fa}
.bleg{background:var(--gdim);color:var(--green)}
.bjur{background:var(--s2);color:var(--t2);border:1px solid var(--bd2)}
.byr{background:transparent;color:var(--t3)}
.bsup{background:#1f1800;color:var(--gold)}
.card-actions{display:flex;gap:5px;margin-top:8px;padding-left:10px}
.ca{font-size:11px;font-weight:600;padding:3px 10px;border-radius:5px;background:var(--s2);color:var(--t2);border:1px solid var(--bd);cursor:pointer}
.ca:hover{border-color:var(--accent);color:var(--accent)}
.ca.pined{background:var(--pdim);border-color:var(--purple);color:var(--purple)}
.loadmore{background:var(--s2);border:1px solid var(--bd2);color:var(--t2);width:100%;padding:9px;border-radius:var(--r2);font-size:13px}
.loadmore:hover{border-color:var(--accent);color:var(--accent)}
.empty{text-align:center;padding:50px 20px;color:var(--t3)}
.empty .ei{font-size:36px;margin-bottom:10px;opacity:.4}
.empty p{font-size:14px}.empty small{font-size:12px;margin-top:5px;display:block;opacity:.7}
.kbd{background:var(--bg);border:1px solid var(--bd2);border-radius:4px;padding:1px 6px;font-size:10px;font-family:monospace;color:var(--t3)}

/* tray */
#tray{background:var(--s1);border-top:1px solid var(--bd);padding:8px 16px;display:none;align-items:center;gap:10px;font-size:12px;flex-shrink:0}
#tray.open{display:flex}
.tray-cases{display:flex;gap:6px;flex:1;overflow-x:auto;padding:2px 0}
.tc{background:var(--s2);border:1px solid var(--bd2);border-radius:5px;padding:3px 10px;font-size:11px;white-space:nowrap;display:flex;align-items:center;gap:5px}
.tc .tr{color:var(--t3);cursor:pointer}.tc .tr:hover{color:var(--red)}

/* Research panel */
#rpanel{background:var(--s1);border-left:1px solid var(--bd);width:460px;flex-shrink:0;display:none;flex-direction:column;overflow:hidden}
#rpanel.open{display:flex}
.rph{padding:12px 14px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}
.rph h3{font-size:14px;font-weight:700}
.rpbody{flex:1;overflow-y:auto;padding:14px}
.rpform label{display:block;font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.rpform textarea{width:100%;background:var(--bg);border:1.5px solid var(--bd2);color:var(--text);padding:10px;border-radius:8px;font-size:13px;line-height:1.5;outline:none;resize:vertical;min-height:100px}
.rpform textarea:focus{border-color:var(--accent)}
.rpform select{width:100%;background:var(--bg);border:1.5px solid var(--bd2);color:var(--text);padding:7px 10px;border-radius:8px;font-size:13px;outline:none;margin-bottom:10px;appearance:none}
.rpform select:focus{border-color:var(--accent)}
.ai-out{background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:14px;font-size:13px;line-height:1.7;color:var(--t2);white-space:pre-wrap;word-break:break-word;min-height:80px}
.ai-out strong,.ai-out b{color:var(--text);font-weight:700}
.ai-out em,.ai-out i{color:var(--amber)}
.ai-out h1,.ai-out h2,.ai-out h3,.ai-out h4{color:var(--text);margin:12px 0 5px;font-size:13px}
.ai-out ul,.ai-out ol{margin-left:18px;margin-top:5px}
.ai-out li{margin-bottom:3px}
.ai-out hr{border:none;border-top:1px solid var(--bd);margin:10px 0}
.ai-out code{background:var(--s2);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:12px}
.cursor{display:inline-block;width:2px;height:14px;background:var(--accent);animation:blink 1s step-end infinite;vertical-align:text-bottom;margin-left:2px}
.model-sel{display:flex;align-items:center;gap:7px;margin-bottom:12px}
.model-sel select{flex:1}
.model-dot{width:8px;height:8px;border-radius:50%;background:var(--t3);flex-shrink:0;transition:background .2s}
.model-dot.ok{background:var(--green)}
.rp-cases{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.rpc{background:var(--s2);border:1px solid var(--bd2);border-radius:7px;padding:8px 10px;font-size:11px}
.rpc .rt{font-weight:600;color:var(--text);margin-bottom:3px}
.rpc .rb{color:var(--t2);line-height:1.4}
.rpc-actions{display:flex;gap:5px;margin-top:5px}

/* modal */
#mbk{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
#mbk.open{display:flex}
#mdl{background:var(--s1);border:1px solid var(--bd2);border-radius:14px;width:100%;max-width:780px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,.7)}
.mh{padding:18px 20px 14px;border-bottom:1px solid var(--bd);flex-shrink:0}
.mb2{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
.mt{font-size:16px;font-weight:700;line-height:1.4}
.mbody{padding:16px 20px;overflow-y:auto;flex:1}
.msum{background:var(--gdim);border:1px solid #1a3d20;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;line-height:1.6;color:var(--t2)}
.msum::before{content:'✨ Plain English Summary';display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-bottom:6px}
.mtext{color:var(--t2);font-size:12px;line-height:1.7;background:var(--bg);border-radius:8px;padding:12px;font-family:ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto}
.mfooter{padding:12px 20px;border-top:1px solid var(--bd);display:flex;align-items:center;gap:7px;flex-shrink:0;flex-wrap:wrap}
.murl{font-size:11px;color:var(--t3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.al{background:var(--adim);color:var(--accent);border:1px solid var(--accent);padding:6px 12px;border-radius:var(--r2);font-size:12px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.al:hover{background:var(--accent);color:#fff}
.xb{background:var(--s2);color:var(--t2);border:1px solid var(--bd);padding:5px 9px;font-size:14px}
.xb:hover{border-color:var(--red);color:var(--red)}
.bm2{background:var(--pdim);color:var(--purple);border:1px solid var(--purple)}
.bm2:hover{background:var(--purple);color:#fff}
.bm2.sv{background:var(--purple);color:#fff}
.cp{background:var(--s2);color:var(--t2);border:1px solid var(--bd)}
.cp:hover{border-color:var(--green);color:var(--green)}
.cp.ok{background:var(--gdim);border-color:var(--green);color:var(--green)}
.nosym{color:var(--t3);font-size:12px;text-align:center;padding:24px;background:var(--bg);border-radius:8px}

/* admin modal */
#admbk{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;display:none;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
#admbk.open{display:flex}
.admbox{background:var(--s1);border:1px solid var(--bd2);border-radius:14px;width:340px;padding:28px}
.admbox h3{font-size:16px;font-weight:700;margin:6px 0 3px}
.admbox p{font-size:12px;color:var(--t3);margin-bottom:18px}
.admbox input{width:100%;background:var(--bg);border:1.5px solid var(--bd2);color:var(--text);padding:8px 12px;border-radius:8px;font-size:14px;outline:none;margin-bottom:8px}
.admbox input:focus{border-color:var(--accent)}
.admerr{font-size:12px;color:var(--red);min-height:16px;margin-bottom:10px}
.admbtns{display:flex;gap:8px}

/* settings panel */
#setpanel{position:fixed;right:0;top:0;bottom:0;width:380px;background:var(--s1);border-left:1px solid var(--bd);z-index:150;display:none;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.5)}
#setpanel.open{display:flex}
.seth{padding:16px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}
.setbody{padding:18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:18px}
.setrow label{display:block;font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.setrow input{width:100%;background:var(--bg);border:1.5px solid var(--bd2);color:var(--text);padding:7px 10px;border-radius:7px;font-size:13px;outline:none;font-family:monospace}
.setrow input:focus{border-color:var(--accent)}
.setrow .hint{font-size:11px;color:var(--t3);margin-top:4px}
.stbadge{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;margin-top:5px}
.stbadge.ok{background:var(--gdim);color:var(--green)}
.stbadge.no{background:var(--rdim);color:var(--red)}
`;

const JS_AREAS = JSON.stringify(AREAS.map(a => ({
  id:a.id, label:a.label, icon:a.icon, desc:a.desc,
  courts:a.courts, legislation:a.legislation
})));

const JS_COURT_ABBR = JSON.stringify(COURT_ABBR);
const JS_SUPERIOR   = JSON.stringify([...SUPERIOR]);
const JS_MODELS     = JSON.stringify(Object.entries(MODELS).map(([id,m])=>({id,label:m.label,provider:m.provider})));

const HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LexAU — Australian Legal Research</title>
<style>${CSS}</style>
<!-- marked.js for markdown rendering -->
<script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"><\/script>
</head><body>

<!-- Status bar -->
<div id="sb">
  <div class="dot" id="dot"></div>
  <span id="sbmsg">Loading…</span>
  <span class="sep">·</span>
  <span id="totalpill">—</span>
  <span class="sep" id="sep2" style="display:none">·</span>
  <span id="sbfeed" style="display:none"></span>
  <span class="sep" id="sep3" style="display:none">·</span>
  <span id="sbnew" style="display:none"></span>
  <span class="sep" id="sep4" style="display:none">·</span>
  <span id="sbnxt" style="display:none"></span>
  <span style="margin-left:auto;display:flex;gap:6px">
    <button class="bg" style="padding:3px 10px;font-size:11px" onclick="openSettings()">⚙ Settings</button>
    <button class="br" id="rbtn" style="padding:3px 10px;font-size:11px" onclick="doRestart()">⟳ Restart</button>
  </span>
</div>

<!-- Header -->
<header>
  <div class="logo">Lex<em>AU</em> <sub>beta</sub></div>
  <div class="tabs" id="tabs">
    <button class="tab active" data-tab="search" onclick="switchTab('search')">🔍 Search</button>
    <button class="tab" data-tab="research" onclick="switchTab('research')">🤖 AI Research</button>
    <button class="tab" data-tab="areas" onclick="switchTab('areas')">📚 Browse by Topic</button>
  </div>
  <!-- Search bar (shown in search tab) -->
  <div class="sbar" id="searchbar">
    <span class="si">⌕</span>
    <input id="q" type="search" placeholder="Search 143,000+ cases and legislation… (press /)" autocomplete="off" spellcheck="false">
    <button class="sx" id="qx" onclick="clearQ()">✕</button>
  </div>
</header>

<!-- Body -->
<div class="body" id="appbody">
  <!-- Sidebar -->
  <aside id="sidebar">
    <div id="side-search-filters">
      <div class="sh">Corpus</div>
      <div class="scards" id="scards"></div>

      <div class="sh" style="margin-top:12px">Type</div>
      <div class="fg" id="typef"></div>

      <div class="sh" style="margin-top:12px">Jurisdiction</div>
      <div class="fg" id="jurisf"></div>

      <div class="sh" style="margin-top:12px">Year range</div>
      <div class="yi">
        <input id="yfr" type="number" placeholder="From" min="1900" max="2026">
        <input id="yto" type="number" placeholder="To"   min="1900" max="2026">
      </div>

      <div class="sh" style="margin-top:12px">Sort</div>
      <div class="srt" id="sortbtns">
        <div class="sb2 on" data-s="relevance" onclick="setSrt('relevance')">Relevance</div>
        <div class="sb2" data-s="newest" onclick="setSrt('newest')">Newest</div>
        <div class="sb2" data-s="oldest" onclick="setSrt('oldest')">Oldest</div>
        <div class="sb2" data-s="alpha" onclick="setSrt('alpha')">A–Z</div>
      </div>
    </div>

    <div id="side-bookmarks" style="margin-top:12px;flex:1">
      <div class="sh">Bookmarks <span id="bmct" style="color:var(--t3);font-weight:400"></span></div>
      <div class="bmlist" id="bmlist"></div>
    </div>
  </aside>

  <!-- Main content area -->
  <div class="main" id="main">
    <div class="empty">
      <div class="ei">⚖️</div>
      <p>Search Australian case law and legislation</p>
      <small>143,000+ documents · <span class="kbd">/</span> to search · <span class="kbd">Esc</span> to close</small>
    </div>
  </div>

  <!-- Research panel (right side, appears in research tab) -->
  <div id="rpanel">
    <div class="rph">
      <h3>🤖 AI Legal Research</h3>
      <button class="bg" style="padding:3px 8px;font-size:11px" onclick="closeRP()">✕</button>
    </div>
    <div class="rpbody" id="rpbody">
      <div class="rpform" id="rpform">
        <label>Your situation <span style="color:var(--t3);font-weight:400;text-transform:none">(plain English)</span></label>
        <textarea id="rpdesc" rows="4" placeholder="e.g. My landlord is refusing to return my $2,000 bond even though I left the place clean. It's been 6 weeks. What are my rights?"></textarea>

        <label style="margin-top:10px">Jurisdiction</label>
        <select id="rpjur">
          <option value="">All Australia</option>
          <option value="cth">Commonwealth</option>
          <option value="nsw">New South Wales</option>
          <option value="vic">Victoria</option>
          <option value="qld">Queensland</option>
          <option value="sa">South Australia</option>
          <option value="wa">Western Australia</option>
          <option value="tas">Tasmania</option>
          <option value="nt">Northern Territory</option>
          <option value="act">ACT</option>
        </select>

        <label>Area of law</label>
        <select id="rparea">
          <option value="">Auto-detect</option>
          ${AREAS.map(a=>`<option value="${a.id}">${a.icon} ${a.label}</option>`).join('')}
        </select>

        <div class="model-sel">
          <div class="model-dot" id="moddot"></div>
          <select id="rpmodel" style="margin-bottom:0">
            ${Object.entries(MODELS).map(([id,m])=>`<option value="${id}">${m.label} (${m.provider})</option>`).join('')}
          </select>
        </div>

        <button class="bp" style="width:100%;padding:9px" onclick="runResearch()">▶ Research my situation</button>

        <div id="rp-arg-section" style="display:none;margin-top:14px">
          <div class="sh">Selected cases for argument</div>
          <div id="rp-selcases"></div>
          <div style="margin-top:4px">
            <label>Your position / what you're arguing</label>
            <textarea id="rp-position" rows="2" placeholder="e.g. I am entitled to full return of my bond because the premises were left in satisfactory condition"></textarea>
          </div>
          <button class="blink" style="width:100%;padding:8px;margin-top:6px" onclick="runArgument()">⚡ Build legal argument</button>
        </div>
      </div>

      <div id="rp-out" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:12px;color:var(--t3)" id="rp-status">Researching…</span>
          <button class="bg" style="padding:3px 8px;font-size:11px" onclick="resetRP()">↩ New search</button>
        </div>
        <div class="ai-out" id="rp-aiout"></div>
        <div id="rp-cases-found" style="margin-top:12px"></div>
      </div>
    </div>
  </div>
</div>

<!-- Case tray (pinned cases for argument building) -->
<div id="tray">
  <span style="color:var(--t3);font-size:11px;white-space:nowrap">📌 Pinned (<span id="tray-ct">0</span>):</span>
  <div class="tray-cases" id="tray-cases"></div>
  <button class="blink" style="padding:5px 10px;font-size:11px;white-space:nowrap" onclick="switchTab('research');openRP();buildArgFromTray()">⚡ Build argument</button>
  <button class="bg" style="padding:5px 8px;font-size:11px" onclick="clearTray()">Clear</button>
</div>

<!-- Document modal -->
<div id="mbk" onclick="if(event.target===this)closeMdl()">
  <div id="mdl">
    <div class="mh">
      <div class="mb2" id="mdbadges"></div>
      <div class="mt" id="mdtitle"></div>
    </div>
    <div class="mbody">
      <div id="mdsum"></div>
      <div id="mdcontent"></div>
    </div>
    <div class="mfooter">
      <span class="murl" id="mdurl"></span>
      <button class="cp" id="cpcite" onclick="copyCite()">📋 Copy citation</button>
      <button class="ca" id="pinbtn" onclick="togglePin()">📌 Pin to argument</button>
      <button class="bm2" id="bmbtn" onclick="toggleBM()">🔖 Save</button>
      <a class="al" id="mdlink" href="#" target="_blank" rel="noopener">↗ Source</a>
      <button class="xb" onclick="closeMdl()">✕</button>
    </div>
  </div>
</div>

<!-- Admin modal -->
<div id="admbk" onclick="if(event.target===this)closeAdm()">
  <div class="admbox">
    <div style="font-size:22px">🔐</div>
    <h3>Admin access</h3>
    <p>Enter password to restart the scraper daemon.</p>
    <input id="admpw" type="password" placeholder="Password" onkeydown="if(event.key==='Enter')submitAdm()">
    <div class="admerr" id="admerr"></div>
    <div class="admbtns">
      <button class="bp" style="flex:1" onclick="submitAdm()">Confirm</button>
      <button class="bg" onclick="closeAdm()">Cancel</button>
    </div>
  </div>
</div>

<!-- Settings panel -->
<div id="setpanel">
  <div class="seth">
    <strong>⚙ Settings — API Keys</strong>
    <button class="bg" style="padding:3px 8px;font-size:12px" onclick="closeSettings()">✕</button>
  </div>
  <div class="setbody" id="setbody"></div>
</div>

<script>
// ── Constants injected server-side ────────────────────────────────────────────
const AREAS    = ${JS_AREAS};
const CAABBR   = ${JS_COURT_ABBR};
const SUPERIOR = new Set(${JS_SUPERIOR});
const ALLMODELS= ${JS_MODELS};
const JURIS    = {cth:'Commonwealth',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia',wa:'Western Australia',tas:'Tasmania',nt:'Northern Territory',act:'ACT'};

// ── State ─────────────────────────────────────────────────────────────────────
const S = { q:'',type:'',juris:'',sort:'relevance',yf:'',yt:'',offset:0,limit:30,tab:'search' };
let lastTotal=null, curDoc=null, pinned={}, bookmarks=JSON.parse(localStorage.getItem('lex-bm')||'{}');
let rpOpen=false;

const $=id=>document.getElementById(id);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt=n=>(n??0).toLocaleString();
const yr=d=>{const y=new Date(d||'').getFullYear();return isNaN(y)?'':y};
const ago=iso=>{const m=Math.floor((Date.now()-new Date(iso))/60000);return m<1?'just now':m<60?m+'m ago':Math.floor(m/60)+'h ago'};
const cdwn=iso=>{const d=new Date(iso)-Date.now();if(d<=0)return'soon';const h=Math.floor(d/3600000),m=Math.floor((d%3600000)/60000);return h>0?\`\${h}h \${m}m\`:\`\${m}m\`};

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(t) {
  S.tab=t;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  $('searchbar').style.display = t==='search' ? 'block' : 'none';
  $('side-search-filters').style.display = t==='search' ? 'block' : 'none';

  if (t==='search') {
    $('rpanel').classList.remove('open'); rpOpen=false;
    if (!S.q&&!S.type&&!S.juris) showEmpty();
  }
  if (t==='research') {
    $('rpanel').classList.add('open'); rpOpen=true;
    showEmpty('Pick an area below or describe your situation in the panel →');
  }
  if (t==='areas') {
    $('rpanel').classList.remove('open'); rpOpen=false;
    renderAreaBrowser();
  }
}

function showEmpty(msg='Search Australian case law and legislation') {
  $('main').innerHTML=\`<div class="empty"><div class="ei">⚖️</div><p>\${esc(msg)}</p><small>143,000+ documents · <span class="kbd">/</span> to focus · <span class="kbd">Esc</span> to close</small></div>\`;
}

// ── Status polling ────────────────────────────────────────────────────────────
async function pollStatus() {
  try {
    const s=await (await fetch('/api/status')).json();
    const dot=$('dot');
    dot.className='dot '+(s.running?'on':s.phase==='waiting'?'wait':s.phase==='crashed'?'err':'');
    $('sbmsg').innerHTML=s.running?'<b>Scraping</b>':s.phase==='waiting'?'Idle':s.phase==='crashed'?'<span style="color:var(--red)">Crashed</span>':s.lastCompletedAt?'Last: '+ago(s.lastCompletedAt):'Ready';
    const sf=s.running&&s.feedsTotal>0;
    $('sep2').style.display=sf?'':'none';$('sbfeed').style.display=sf?'':'none';
    if(sf)$('sbfeed').textContent=\`\${s.feedsDone}/\${s.feedsTotal} — \${s.currentFeed||'…'}\`;
    const sn=s.newThisRun>0;
    $('sep3').style.display=sn?'':'none';$('sbnew').style.display=sn?'':'none';
    if(sn)$('sbnew').innerHTML=\`<span style="color:var(--green);font-weight:700">+\${fmt(s.newThisRun)}</span> new\`;
    const sx=!s.running&&s.nextRunAt;
    $('sep4').style.display=sx?'':'none';$('sbnxt').style.display=sx?'':'none';
    if(sx)$('sbnxt').textContent='Next: '+cdwn(s.nextRunAt);
  } catch {}
}

async function pollStats() {
  try {
    const s=await (await fetch('/api/stats')).json();
    const pill=$('totalpill');
    if(lastTotal!==null&&s.total>lastTotal){pill.classList.add('flash');setTimeout(()=>pill.classList.remove('flash'),2000)}
    pill.textContent=fmt(s.total)+' docs'; lastTotal=s.total;
    renderSidebar(s);
  } catch {}
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar(s) {
  $('scards').innerHTML=\`
    <div class="sc"><div class="n">\${fmt(s.case_law)}</div><div class="l">Cases</div></div>
    <div class="sc"><div class="n">\${fmt(s.legislation)}</div><div class="l">Legislation</div></div>
  \`;
  $('typef').innerHTML=\`
    <button class="pill \${!S.type?'on':''}" onclick="setF('type','')">All types</button>
    <button class="pill \${S.type==='case_law'?'on':''}" onclick="setF('type','case_law')">⚖️ Case law <span class="pn">\${fmt(s.case_law)}</span></button>
    <button class="pill \${S.type==='legislation'?'on':''}" onclick="setF('type','legislation')">📜 Legislation <span class="pn">\${fmt(s.legislation)}</span></button>
  \`;
  $('jurisf').innerHTML=\`
    <button class="pill \${!S.juris?'on':''}" onclick="setF('juris','')">All</button>
    \${s.by_jurisdiction.map(j=>\`<button class="pill \${S.juris===j.jurisdiction?'on':''}" onclick="setF('juris','\${j.jurisdiction}')">
      \${JURIS[j.jurisdiction]||j.jurisdiction} <span class="pn">\${fmt(j.n)}</span>
    </button>\`).join('')}
  \`;
}

function setF(k,v){S.offset=0;S[k==='juris'?'juris':'type']=v;doSearch()}
function setSrt(v){S.sort=v;S.offset=0;document.querySelectorAll('.sb2').forEach(b=>b.classList.toggle('on',b.dataset.s===v));if(S.q||S.type||S.juris)doSearch()}

// ── Search ────────────────────────────────────────────────────────────────────
function clearQ(){$('q').value='';S.q='';S.offset=0;$('qx').classList.remove('v');if(!S.type&&!S.juris)showEmpty();else doSearch()}
let _dt;
function qInp(){clearTimeout(_dt);_dt=setTimeout(()=>{S.offset=0;doSearch()},350)}

function pushUrl(){
  const p=new URLSearchParams();
  if(S.q)p.set('q',S.q);if(S.type)p.set('type',S.type);if(S.juris)p.set('juris',S.juris);
  if(S.sort!=='relevance')p.set('sort',S.sort);if(S.yf)p.set('from',S.yf);if(S.yt)p.set('to',S.yt);
  history.replaceState(null,'','?'+p.toString());
}

async function doSearch(append=false) {
  S.q=$('q').value.trim(); S.yf=$('yfr').value.trim(); S.yt=$('yto').value.trim();
  if(!append)S.offset=0;
  $('qx').classList.toggle('v',!!S.q);
  if(!S.q&&!S.type&&!S.juris&&!S.yf&&!S.yt){showEmpty();pushUrl();return}
  if(!append)$('main').innerHTML='<div class="empty"><p style="font-size:13px">Searching…</p></div>';
  pushUrl();

  let url=\`/api/search?limit=\${S.limit}&offset=\${S.offset}\`;
  if(S.q)url+='&q='+encodeURIComponent(S.q);
  if(S.type)url+='&type='+S.type;
  if(S.juris)url+='&jurisdiction='+S.juris;
  if(S.sort)url+='&sort='+S.sort;
  if(S.yf)url+='&year_from='+S.yf;
  if(S.yt)url+='&year_to='+S.yt;

  try {
    const d=await (await fetch(url)).json();
    renderResults(d,append);
  } catch(e) {
    $('main').innerHTML=\`<div class="empty"><p style="color:var(--red)">\${esc(e.message)}</p></div>\`;
  }
}

// ── Results ───────────────────────────────────────────────────────────────────
function cardHtml(r) {
  const court=CAABBR[r.feed_code]||r.feed_code?.split('/').pop()?.toUpperCase()||'';
  const tier=SUPERIOR.has(r.feed_code)?1:r.type==='legislation'?0:r.feed_code?.includes('/case')?2:9;
  const year=yr(r.pub_date)||yr(r.fetched_at)||'';
  const isPinned=!!pinned[r.id];
  return \`<div class="card\${isPinned?' pinned':''}" id="c\${r.id}" onclick="openDoc(\${r.id},this)">
    <div class="tier t\${tier}"></div>
    <div class="ctitle">\${esc(r.title||'(untitled)')}</div>
    \${r.snippet?\`<div class="csnip">\${r.snippet}</div>\`:''}
    <div class="cmeta">
      \${court?\`<span class="badge bc">\${esc(court)}</span>\`:''}
      <span class="badge \${r.type==='case_law'?'bcase':'bleg'}">\${r.type==='case_law'?'Case Law':'Legislation'}</span>
      <span class="badge bjur">\${(JURIS[r.jurisdiction]||r.jurisdiction||'').split(' ')[0]}</span>
      \${year?\`<span class="badge byr">\${year}</span>\`:''}
      \${tier===1?\`<span class="badge bsup">★</span>\`:''}
    </div>
    <div class="card-actions">
      <button class="ca" onclick="event.stopPropagation();openDoc(\${r.id})">View</button>
      <button class="ca \${isPinned?'pined':''}" data-id="\${r.id}" onclick="event.stopPropagation();quickPinBtn(this)">
        \${isPinned?'📌 Pinned':'📌 Pin'}
      </button>
      <button class="ca" onclick="event.stopPropagation();quickSummarise(\${r.id})">✨ Summary</button>
    </div>
  </div>\`;
}

function renderResults(data,append=false) {
  const res=data.results||[],total=data.count??res.length,hasMore=res.length===S.limit;
  if(!append) {
    if(!res.length){$('main').innerHTML='<div class="empty"><div class="ei">🔍</div><p>No results'+(S.q?' for <b>'+esc(S.q)+'</b>':' — try removing filters')+'</p></div>';return}
    $('main').innerHTML=\`<div class="rmeta"><span>Showing <b>\${fmt(res.length)}</b> of <b>\${fmt(total)}</b>\${S.q?' for <b>'+esc(S.q)+'</b>':''}</span></div><div class="rgrid" id="rgrid"></div>\`;
  }
  const grid=$('rgrid');
  res.forEach(r=>{ const d=document.createElement('div'); d.innerHTML=cardHtml(r); grid.appendChild(d.firstChild); });
  const old=$('lmbtn'); if(old)old.remove();
  if(hasMore&&S.offset+res.length<total) {
    const b=document.createElement('button');b.id='lmbtn';b.className='loadmore';
    b.textContent=\`Load more (\${fmt(total-S.offset-res.length)} remaining)\`;
    b.onclick=()=>{S.offset+=S.limit;doSearch(true)};
    $('main').appendChild(b);
  }
}

// ── Document modal ────────────────────────────────────────────────────────────
async function openDoc(id) {
  const doc=await (await fetch('/api/document/'+id)).json();
  curDoc=doc;
  const court=CAABBR[doc.feed_code]||doc.feed_code?.split('/').pop()?.toUpperCase()||'';
  const year=yr(doc.pub_date)||yr(doc.fetched_at)||'';
  const tier=SUPERIOR.has(doc.feed_code);
  $('mdbadges').innerHTML=\`
    \${court?\`<span class="badge bc">\${esc(court)}</span>\`:''}
    <span class="badge \${doc.type==='case_law'?'bcase':'bleg'}">\${doc.type==='case_law'?'Case':'Legislation'}</span>
    <span class="badge bjur">\${JURIS[doc.jurisdiction]||doc.jurisdiction||''}</span>
    \${year?\`<span class="badge byr">\${year}</span>\`:''}
    \${tier?\`<span class="badge bsup">★ Superior</span>\`:''}
  \`;
  $('mdtitle').textContent=doc.title||'(untitled)';

  // Summary block
  if(doc.summary) {
    $('mdsum').innerHTML=\`<div class="msum">\${esc(doc.summary)}</div>\`;
  } else {
    $('mdsum').innerHTML=\`<div class="msum" style="opacity:.6" id="sum-placeholder">
      No plain English summary yet. <button class="ca" style="font-size:11px" onclick="genSummary(\${doc.id})">✨ Generate with AI</button>
    </div>\`;
  }

  const body=doc.full_text||doc.description||'';
  $('mdcontent').innerHTML=body
    ? \`<div class="mtext">\${esc(body.slice(0,6000))}\${body.length>6000?'\\n\\n[…continues on source]':''}</div>\`
    : \`<div class="nosym">📄 Full text not yet fetched — click ↗ Source to read the original document.</div>\`;

  $('mdlink').href=doc.url||'#'; $('mdurl').textContent=doc.url||'';
  $('cpcite').textContent='📋 Copy citation'; $('cpcite').className='cp';
  $('pinbtn').textContent=pinned[doc.id]?'📌 Unpin':'📌 Pin';$('pinbtn').className='ca'+(pinned[doc.id]?' pined':'');
  $('bmbtn').textContent=bookmarks[doc.id]?'🔖 Saved':'🔖 Save';$('bmbtn').className='bm2'+(bookmarks[doc.id]?' sv':'');
  $('mbk').classList.add('open'); document.body.style.overflow='hidden';
}

function closeMdl(){$('mbk').classList.remove('open');document.body.style.overflow='';curDoc=null}

function copyCite(){
  if(!curDoc)return;
  navigator.clipboard.writeText(curDoc.title||curDoc.url||'').then(()=>{
    $('cpcite').textContent='✓ Copied!';$('cpcite').className='cp ok';
    setTimeout(()=>{$('cpcite').textContent='📋 Copy citation';$('cpcite').className='cp'},2000);
  });
}

async function genSummary(id) {
  $('sum-placeholder').innerHTML='✨ Generating summary…';
  const r=await fetch('/api/summarise/'+id, {method:'POST'});
  const d=await r.json();
  if(d.summary) $('mdsum').innerHTML=\`<div class="msum">\${esc(d.summary)}</div>\`;
  else $('mdsum').innerHTML=\`<div class="msum" style="color:var(--red)">Could not generate summary: \${esc(d.error||'unknown error')}</div>\`;
}

async function quickSummarise(id) {
  const r=await fetch('/api/summarise/'+id,{method:'POST'});
  const d=await r.json();
  if(d.summary) {
    const card=$('c'+id);
    if(card) {
      const existing=card.querySelector('.msum');
      if(!existing){const s=document.createElement('div');s.className='msum';s.style='margin:8px 0 0 10px;font-size:11px;line-height:1.5;padding:8px;';s.textContent=d.summary.slice(0,200)+'…';card.insertBefore(s,card.querySelector('.card-actions'));}
    }
  }
}

// ── Pin / bookmarks ───────────────────────────────────────────────────────────
function togglePin(){
  if(!curDoc)return;
  const id=curDoc.id;
  if(pinned[id]){delete pinned[id]} else {pinned[id]={id,title:curDoc.title,feed_code:curDoc.feed_code,jurisdiction:curDoc.jurisdiction}}
  $('pinbtn').textContent=pinned[id]?'📌 Unpin':'📌 Pin';$('pinbtn').className='ca'+(pinned[id]?' pined':'');
  renderTray();
  // Update card if visible
  const card=$('c'+id);if(card)card.className='card'+(pinned[id]?' pinned':'');
}
function quickPin(id, title){
  if(pinned[id]){delete pinned[id]}
  else{pinned[id]={id, title:title||'Case '+id, feed_code:'', jurisdiction:''}}
  renderTray();
  const card=$('c'+id);
  if(card){
    card.className='card'+(pinned[id]?' pinned':'');
    const btn=card.querySelector('[data-id="'+id+'"]');
    if(btn){btn.className='ca'+(pinned[id]?' pined':'');btn.textContent=pinned[id]?'📌 Pinned':'📌 Pin';}
  }
}
// Called from card button via data-id attribute (avoids string-escaping onclick args)
function quickPinBtn(btn){
  const id=parseInt(btn.dataset.id,10);
  const card=$('c'+id);
  const title=card?.querySelector('.ctitle')?.textContent||'Case '+id;
  quickPin(id, title);
}
function renderTray(){
  const items=Object.values(pinned);
  $('tray').className=items.length?'tray open':'tray';
  $('tray-ct').textContent=items.length;
  $('tray-cases').innerHTML=items.map(p=>\`<div class="tc"><span class="bmt">\${esc((p.title||'').slice(0,40))}</span><span class="tr" onclick="delete pinned['\${p.id}'];renderTray()">✕</span></div>\`).join('');
}
function clearTray(){pinned={};renderTray()}
function buildArgFromTray(){
  const ids=Object.keys(pinned);
  if(ids.length){$('rp-position').value='';showArgSection(ids)}
}
function showArgSection(ids){
  $('rp-arg-section').style.display='block';
  $('rp-selcases').innerHTML=ids.map(id=>\`<div class="rpc" style="margin-bottom:4px"><div class="rt">\${esc((pinned[id]?.title||'Case '+id).slice(0,60))}</div></div>\`).join('');
}

function toggleBM(){
  if(!curDoc)return;
  const id=String(curDoc.id);
  if(bookmarks[id])delete bookmarks[id];
  else bookmarks[id]={id,title:curDoc.title,type:curDoc.type,jurisdiction:curDoc.jurisdiction};
  localStorage.setItem('lex-bm',JSON.stringify(bookmarks));
  $('bmbtn').textContent=bookmarks[id]?'🔖 Saved':'🔖 Save';$('bmbtn').className='bm2'+(bookmarks[id]?' sv':'');
  renderBM();
}
function renderBM(){
  const items=Object.values(bookmarks);
  $('bmct').textContent=items.length?'('+items.length+')':'';
  $('bmlist').innerHTML=!items.length?'<div style="font-size:11px;color:var(--t3)">No saved items yet</div>':
    items.map(b=>\`<div class="bm" onclick="openDoc(\${b.id})"><span class="bmt" title="\${esc(b.title)}">\${esc(b.title)}</span><button class="bmd" onclick="event.stopPropagation();delete bookmarks['\${b.id}'];localStorage.setItem('lex-bm',JSON.stringify(bookmarks));renderBM()">✕</button></div>\`).join('');
}

// ── Research panel ────────────────────────────────────────────────────────────
function openRP(){$('rpanel').classList.add('open');rpOpen=true}
function closeRP(){$('rpanel').classList.remove('open');rpOpen=false}
function resetRP(){$('rp-out').style.display='none';$('rpform').style.display='block';$('rp-arg-section').style.display='none'}

async function runResearch() {
  const desc=$('rpdesc').value.trim();
  if(!desc){$('rpdesc').focus();return}
  const juris=$('rpjur').value, area=$('rparea').value, model=$('rpmodel').value;
  $('rpform').style.display='none';$('rp-out').style.display='block';
  $('rp-status').textContent='Researching…';
  $('rp-aiout').innerHTML='<span class="cursor"></span>';
  $('rp-cases-found').innerHTML='';

  const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({description:desc,jurisdiction:juris,area,model})});

  if(!r.ok||!r.body){const d=await r.json().catch(()=>({}));$('rp-aiout').textContent=d.error||'Error';return}

  const reader=r.body.getReader();const dec=new TextDecoder();
  let buf='',text='',caseData=null;
  $('rp-status').textContent='Generating…';

  while(true){
    const {done,value}=await reader.read();if(done)break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split('\\n');buf=lines.pop();
    for(const line of lines){
      if(!line.startsWith('data:'))continue;
      const d=JSON.parse(line.slice(5));
      if(d.type==='chunk'){
        text+=d.text;
        // Extract case data marker
        const match=text.match(/<!--CASES:(.*?)-->/);
        if(match){caseData=JSON.parse(match[1]);text=text.replace(/<!--CASES:.*?-->/,'');}
        $('rp-aiout').innerHTML=renderMD(text)+'<span class="cursor"></span>';
        $('rp-aiout').scrollTop=$('rp-aiout').scrollHeight;
      }
      if(d.type==='done'){
        $('rp-aiout').innerHTML=renderMD(text);
        $('rp-status').textContent='Done ✓';
        if(caseData&&caseData.length){
          $('rp-cases-found').innerHTML='<div class="sh" style="margin-bottom:6px">Cases found in corpus</div>'+
            caseData.map(c=>\`<div class="rpc"><div class="rt">\${esc(c.title||'')}</div>
              <div class="rpc-actions">
                <button class="ca" style="font-size:11px" onclick="openDoc(\${c.id})">View</button>
                <button class="ca" style="font-size:11px" data-id="\${c.id}" data-title="\${esc(c.title||'')}" onclick="quickPin(parseInt(this.dataset.id),this.dataset.title)">📌 Pin</button>
              </div></div>\`).join('');
        }
        break;
      }
      if(d.type==='error'){$('rp-aiout').innerHTML=\`<span style="color:var(--red)">\${esc(d.error)}</span>\`;$('rp-status').textContent='Error';break}
    }
  }
}

async function runArgument() {
  const pos=$('rp-position').value.trim();
  if(!pos){$('rp-position').focus();return}
  const ids=Object.keys(pinned);
  if(!ids.length){alert('Pin some cases first using the 📌 button on results.');return}
  const model=$('rpmodel').value, juris=$('rpjur').value, area=$('rparea').value;
  $('rpform').style.display='none';$('rp-out').style.display='block';
  $('rp-status').textContent='Building argument…';
  $('rp-aiout').innerHTML='<span class="cursor"></span>';
  $('rp-cases-found').innerHTML='';

  const r=await fetch('/api/argue',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({caseIds:ids.map(Number),userPosition:pos,jurisdiction:juris,area,model})});

  const reader=r.body.getReader();const dec=new TextDecoder();
  let buf='',text='';
  while(true){
    const {done,value}=await reader.read();if(done)break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split('\\n');buf=lines.pop();
    for(const line of lines){
      if(!line.startsWith('data:'))continue;
      const d=JSON.parse(line.slice(5));
      if(d.type==='chunk'){text+=d.text;$('rp-aiout').innerHTML=renderMD(text)+'<span class="cursor"></span>';$('rp-aiout').scrollTop=$('rp-aiout').scrollHeight}
      if(d.type==='done'){$('rp-aiout').innerHTML=renderMD(text);$('rp-status').textContent='Done ✓';break}
      if(d.type==='error'){$('rp-aiout').innerHTML=\`<span style="color:var(--red)">\${esc(d.error)}</span>\`;break}
    }
  }
}

function renderMD(text){
  try{return marked.parse(text,{breaks:true,gfm:true})}catch{return esc(text)}
}

// ── Area browser ──────────────────────────────────────────────────────────────
function renderAreaBrowser(){
  $('main').innerHTML=\`
    <div class="rmeta"><b>Browse by area of law</b> <span style="color:var(--t3)">Click an area to find relevant cases and legislation</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px" id="areasgrid"></div>
  \`;
  const grid=$('areasgrid');
  AREAS.forEach(a=>{
    const d=document.createElement('div');
    d.style='background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:14px 16px;cursor:pointer;transition:border-color .12s';
    d.onmouseenter=()=>d.style.borderColor='var(--purple)';d.onmouseleave=()=>d.style.borderColor='var(--bd)';
    d.onclick=()=>browseArea(a);
    d.innerHTML=\`
      <div style="font-size:22px;margin-bottom:6px">\${a.icon}</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:3px">\${esc(a.label)}</div>
      <div style="font-size:12px;color:var(--t2);margin-bottom:10px">\${esc(a.desc)}</div>
      <div style="font-size:11px;color:var(--t3)">
        \${Object.entries(a.legislation||{}).filter(([,v])=>v).slice(0,2).map(([,v])=>\`<div>📜 \${esc(v.split(' (')[0])}</div>\`).join('')}
      </div>
    \`;
    grid.appendChild(d);
  });
}

function browseArea(area) {
  switchTab('research');
  openRP();
  $('rparea').value=area.id;
  // Pre-fill the sidebar with an area-specific search
  switchTab('search');
  S.q=area.searches[0]||area.label;
  $('q').value=S.q;
  doSearch();
  // Open RP at the same time
  $('rpanel').classList.add('open'); rpOpen=true;
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function openSettings(){
  $('setpanel').classList.add('open');
  const ms=await (await fetch('/api/models')).json();
  $('setbody').innerHTML=\`
    <p style="font-size:12px;color:var(--t2)">Add API keys to enable AI features. Keys are stored in your local .env file.</p>
    \${[
      {k:'anthropic',label:'Anthropic (Claude)',hint:'Get at console.anthropic.com'},
      {k:'openai',   label:'OpenAI (GPT-4o)',   hint:'Get at platform.openai.com'},
      {k:'gemini',   label:'Google (Gemini)',    hint:'Get at aistudio.google.com'},
    ].map(({k,label,hint})=>\`
      <div class="setrow">
        <label>\${label}</label>
        <input type="password" id="key-\${k}" placeholder="Paste API key…" value="\${ms.keys[k]?'••••••••••••••••':''}">
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <span class="stbadge \${ms.keys[k]?'ok':'no'}">\${ms.keys[k]?'✓ Connected':'✗ Not set'}</span>
          <span class="hint">\${hint}</span>
        </div>
      </div>
    \`).join('')}
    <button class="bp" onclick="saveKeys()">Save keys</button>
    <button class="bg" onclick="closeSettings()">Cancel</button>
    <div id="set-msg" style="font-size:12px;color:var(--green);min-height:16px"></div>
    <div style="border-top:1px solid var(--bd);padding-top:12px">
      <div class="sh" style="margin-bottom:8px">Available models</div>
      \${ms.models.map(m=>\`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:12px">
        <div style="width:7px;height:7px;border-radius:50%;background:\${m.available?'var(--green)':'var(--t3)'};flex-shrink:0"></div>
        <span style="flex:1">\${esc(m.label)}</span>
        <span style="color:var(--t3)">\${m.available?'Ready':'Needs key'}</span>
      </div>\`).join('')}
    </div>
  \`;
}
function closeSettings(){$('setpanel').classList.remove('open')}

async function saveKeys(){
  const keys={};
  ['anthropic','openai','gemini'].forEach(k=>{
    const el=$('key-'+k);
    if(el&&el.value&&!el.value.includes('•')) keys[k]=el.value.trim();
  });
  if(!Object.keys(keys).length){$('set-msg').textContent='No new keys entered.';return}
  const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys})});
  const d=await r.json();
  if(d.ok){$('set-msg').textContent='✓ Saved! Refreshing models…';setTimeout(openSettings,800)}
  else $('set-msg').style.color='var(--red)',($('set-msg').textContent=d.error||'Error');
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function doRestart(){
  if(sessionStorage.getItem('admin-pw')){_callRestart();return}
  $('admpw').value='';$('admerr').textContent='';
  $('admbk').classList.add('open');setTimeout(()=>$('admpw').focus(),80);
}
function closeAdm(){$('admbk').classList.remove('open')}
async function submitAdm(){
  const pw=$('admpw').value;if(!pw)return;
  const r=await fetch('/api/restart',{method:'POST',headers:{'x-admin-password':pw}});
  if(r.status===401){$('admerr').textContent='Wrong password.';$('admpw').select();return}
  sessionStorage.setItem('admin-pw',pw);closeAdm();_showRestart((await r.json()).ok);
}
async function _callRestart(){
  const r=await fetch('/api/restart',{method:'POST',headers:{'x-admin-password':sessionStorage.getItem('admin-pw')||''}});
  if(r.status===401){sessionStorage.removeItem('admin-pw');doRestart();return}
  _showRestart((await r.json()).ok);
}
function _showRestart(ok){
  const btn=$('rbtn');btn.disabled=true;
  if(ok){btn.textContent='✓ Done';btn.style.background='var(--green)';btn.style.color='#000';setTimeout(()=>{btn.disabled=false;btn.textContent='⟳ Restart';btn.style.background='';btn.style.color=''},3000)}
  else{btn.textContent='✗ Failed';setTimeout(()=>{btn.disabled=false;btn.textContent='⟳ Restart'},2000)}
}

// ── Model status indicator ────────────────────────────────────────────────────
async function updateModelDot(){
  try{
    const ms=await (await fetch('/api/models')).json();
    const model=ALLMODELS.find(m=>m.id===$('rpmodel').value);
    const avail=ms.models.find(m=>m.id===$('rpmodel').value)?.available;
    $('moddot').className='model-dot'+(avail?' ok':'');
  } catch {}
}
$('rpmodel').addEventListener('change',updateModelDot);

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&document.activeElement!==$('q')&&document.activeElement!==$('rpdesc')&&document.activeElement!==$('admpw')){
    e.preventDefault();switchTab('search');$('q').focus();$('q').select();
  }
  if(e.key==='Escape'){
    if($('setpanel').classList.contains('open')){closeSettings();return}
    if($('admbk').classList.contains('open')){closeAdm();return}
    if($('mbk').classList.contains('open')){closeMdl();return}
    if(S.q){clearQ();return}
  }
  if(e.key==='Enter'&&document.activeElement===$('q')){e.preventDefault();S.offset=0;doSearch()}
  if(e.key==='Enter'&&document.activeElement===$('admpw')){submitAdm()}
});

$('q').addEventListener('input',qInp);
$('yfr').addEventListener('change',()=>{S.offset=0;doSearch()});
$('yto').addEventListener('change',()=>{S.offset=0;doSearch()});

// ── Boot ──────────────────────────────────────────────────────────────────────
const p=new URLSearchParams(location.search);
if(p.get('q'))$('q').value=S.q=p.get('q');
if(p.get('from'))$('yfr').value=S.yf=p.get('from');
if(p.get('to'))$('yto').value=S.yt=p.get('to');
if(p.get('type'))S.type=p.get('type');
if(p.get('sort'))S.sort=p.get('sort');
if(p.get('juris'))S.juris=p.get('juris');
document.querySelectorAll('.sb2').forEach(b=>b.classList.toggle('on',b.dataset.s===S.sort));

renderBM();renderTray();
pollStats();pollStatus();updateModelDot();
if(S.q||S.type||S.juris||S.yf||S.yt)doSearch();

setInterval(pollStatus,4000);setInterval(pollStats,8000);
</script>
</body></html>`;

// ─── Server ───────────────────────────────────────────────────────────────────
const db = getDb();

const server = createServer(async (req, res) => {
  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // ── Static ──
  if (path==='/'||path==='/index.html') return hres(res, HTML);

  // ── Status / stats ──
  if (path==='/api/stats')  return jres(res, stats());
  if (path==='/api/status') return jres(res, readStatus());
  if (path==='/api/models') {
    const k=gk(); const ms=modelStatus();
    return jres(res, { ...ms, keys:{ anthropic:!!k.anthropic, openai:!!k.openai, gemini:!!k.gemini } });
  }

  // ── Admin ──
  if (path==='/api/restart' && req.method==='POST') {
    if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) return jres(res,{ok:false,error:'Unauthorised'},401);
    const pid = readStatus().daemonPid;
    if (!pid) return jres(res,{ok:false,error:'Daemon not running'},503);
    try { process.kill(pid,'SIGUSR1'); return jres(res,{ok:true}); }
    catch(e) { return jres(res,{ok:false,error:e.message},500); }
  }

  // ── Settings ──
  if (path==='/api/settings' && req.method==='POST') {
    try {
      const b = JSON.parse(await body(req));
      for (const [k,v] of Object.entries(b.keys||{})) if (v) setKey(k,v);
      return jres(res,{ok:true});
    } catch(e) { return jres(res,{ok:false,error:e.message},400); }
  }

  // ── Search ──
  if (path==='/api/search') {
    const q=url.searchParams.get('q')||'',type=url.searchParams.get('type')||'',juris=url.searchParams.get('jurisdiction')||'';
    const sort=url.searchParams.get('sort')||'relevance',yearFrom=url.searchParams.get('year_from')||'',yearTo=url.searchParams.get('year_to')||'';
    const limit=Math.min(parseInt(url.searchParams.get('limit')||'30',10),200);
    const offset=parseInt(url.searchParams.get('offset')||'0',10);

    const orderByFts   = sort==='newest'?'ORDER BY d.pub_date DESC NULLS LAST,d.fetched_at DESC':sort==='oldest'?'ORDER BY d.pub_date ASC NULLS LAST':sort==='alpha'?'ORDER BY d.title ASC':'ORDER BY rank';
    const orderByBrowse= sort==='newest'?'ORDER BY pub_date DESC,fetched_at DESC':sort==='oldest'?'ORDER BY pub_date ASC':sort==='alpha'?'ORDER BY title ASC':'ORDER BY fetched_at DESC';

    const build=(pref='')=>{
      const cl=[],ps=[],p=pref?pref+'.':'';
      if(type){cl.push(`${p}type=?`);ps.push(type)}
      if(juris){cl.push(`${p}jurisdiction=?`);ps.push(juris)}
      if(yearFrom){cl.push(`substr(${p}pub_date,1,4)>=?`);ps.push(yearFrom)}
      if(yearTo){cl.push(`substr(${p}pub_date,1,4)<=?`);ps.push(yearTo)}
      return{where:cl.length?'AND '+cl.join(' AND '):'',params:ps};
    };

    try {
      if (q) {
        const{where,params}=build('d');
        const rows=db.prepare(`SELECT d.id,d.title,d.url,d.pub_date,d.type,d.jurisdiction,d.feed_code,d.fetched_at,d.summary,snippet(documents_fts,1,'<b>','</b>','…',28) AS snippet FROM documents_fts f JOIN documents d ON d.id=f.rowid WHERE documents_fts MATCH ? ${where} ${orderByFts} LIMIT ? OFFSET ?`).all(q,...params,limit,offset);
        const cnt=db.prepare(`SELECT COUNT(*) n FROM documents_fts f JOIN documents d ON d.id=f.rowid WHERE documents_fts MATCH ? ${where}`).get(q,...params).n;
        return jres(res,{count:cnt,results:rows});
      } else {
        const{where,params}=build('');
        const rows=db.prepare(`SELECT id,title,url,pub_date,type,jurisdiction,feed_code,fetched_at,summary FROM documents WHERE 1=1 ${where} ${orderByBrowse} LIMIT ? OFFSET ?`).all(...params,limit,offset);
        const cnt=db.prepare(`SELECT COUNT(*) n FROM documents WHERE 1=1 ${where}`).get(...params).n;
        return jres(res,{count:cnt,results:rows});
      }
    } catch(e) { return jres(res,{error:e.message},500); }
  }

  // ── Document ──
  const dm=path.match(/^\/api\/document\/(\d+)$/);
  if (dm) {
    const doc=db.prepare('SELECT * FROM documents WHERE id=?').get(parseInt(dm[1],10));
    if(!doc){res.writeHead(404);res.end();return}
    return jres(res,doc);
  }

  // ── Summarise ──
  const sm=path.match(/^\/api\/summarise\/(\d+)$/);
  if (sm && req.method==='POST') {
    try {
      const id=parseInt(sm[1],10);
      const existing=db.prepare('SELECT summary FROM documents WHERE id=?').get(id);
      if(existing?.summary) return jres(res,{summary:existing.summary});
      const summary=await summariseCase(id);
      if(!summary) return jres(res,{error:'Could not generate summary — ensure API key is set and document has text'},422);
      return jres(res,{summary});
    } catch(e) { return jres(res,{error:e.message},500); }
  }

  // ── AI Research (streaming SSE) ──
  if (path==='/api/research' && req.method==='POST') {
    try {
      const {description,jurisdiction,area,model} = JSON.parse(await body(req));
      stream(res);
      const gen = situationIntake({ description, jurisdiction, areaId:area, modelKey:model||DEFAULT_MODEL });
      for await (const chunk of gen) {
        sse(res,{type:'chunk',text:chunk});
      }
      sse(res,{type:'done'});
      res.end();
    } catch(e) { try{sse(res,{type:'error',error:e.message});res.end()}catch{} }
  }

  // ── Argument builder (streaming SSE) ──
  if (path==='/api/argue' && req.method==='POST') {
    try {
      const {caseIds,userPosition,jurisdiction,area,model} = JSON.parse(await body(req));
      stream(res);
      const gen = buildArgument({ caseIds, userPosition, jurisdiction, areaId:area, modelKey:model||DEFAULT_MODEL });
      for await (const chunk of gen) {
        sse(res,{type:'chunk',text:chunk});
      }
      sse(res,{type:'done'});
      res.end();
    } catch(e) { try{sse(res,{type:'error',error:e.message});res.end()}catch{} }
  }

  // ── Areas ──
  if (path==='/api/areas') return jres(res, AREAS.map(a=>({id:a.id,label:a.label,icon:a.icon,desc:a.desc})));

  // Fallback
  if (!res.writableEnded) { res.writeHead(404); res.end(); }
});

server.listen(PORT, () => {
  const u=`http://localhost:${PORT}`;
  console.log(`LexAU → ${u}`);
  import('child_process').then(({exec})=>exec(`open -a "Brave Browser" "${u}"`));
});
