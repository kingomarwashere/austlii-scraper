/**
 * I AM THE LAW — Australian Legal Research & Case Management
 * Run: node src/viewer.js  →  http://localhost:4242
 */
import 'dotenv/config';
import { createServer } from 'http';
import { getDb, stats } from './db.js';
import { readStatus } from './status.js';
import { AREAS, getArea, corpusSearch, situationIntake, buildArgument, summariseCase } from './research.js';
import { modelStatus, setKey, getKeys as gk, MODELS, DEFAULT_MODEL } from './ai.js';
import { initCasesTables, getCases, getCase, createCase, updateCase, deleteCase, upsertTask, deleteTask, addEvent, deleteEvent, addDocument, toggleDocument, deleteDocument, TASK_TEMPLATES } from './cases.js';
import { searchNSWCaselaw, COURT_RESOURCES, loginNSWRegistry, submitNSW2FA, scrapeRegistryCases, scrapeRegistryCaseDetail, closeRegistryBrowser } from './courtlink.js';

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
@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#050505;--s1:#0a0a0a;--s2:#111;--s3:#181818;--bd:#1f1f1f;--bd2:#2a2a2a;
  --accent:#ff0099;--adim:#1a0010;--gold:#c87000;--gdim:#1a0e00;
  --purple:#9b6dff;--pdim:#160f2a;
  --green:#22c55e;--greendim:#061309;
  --text:#e8e8e8;--t2:#888;--t3:#444;
  --red:#ef4444;--rdim:#1a0505;
  --amber:#f59e0b;
  --green:#22c55e;--gdim:#0b1f12;--amber:#f59e0b;--red:#ef4444;--rdim:#1f0d0d;
  --gold:#fbbf24;--silver:#9ca3b8;--bronze:#c97c3a;
  --r:10px;--r2:7px;
}
html{font-size:14px;height:100%}
body{background:var(--bg);color:var(--text);font-family:'Roboto Mono',monospace;height:100%;display:flex;flex-direction:column;overflow:hidden}
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
.logo{font-size:15px;font-weight:700;letter-spacing:.15em;white-space:nowrap;text-transform:uppercase}
.logo em{color:var(--accent);font-style:normal;font-weight:900}
.logo sub{font-size:8px;color:var(--t3);font-weight:400;letter-spacing:.12em;text-transform:uppercase;vertical-align:baseline;margin-left:4px}
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

/* ── My Cases / War Room ── */
.wr-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.wr-header h2{font-size:16px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.case-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.case-card{background:var(--s1);border:1px solid var(--bd2);border-radius:10px;padding:16px;cursor:pointer;transition:border-color .12s,transform .1s;position:relative;overflow:hidden}
.case-card:hover{border-color:var(--accent);transform:translateY(-1px)}
.case-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent)}
.case-card.won::before{background:var(--green)}
.case-card.lost::before{background:var(--red)}
.case-card.settled::before{background:var(--gold)}
.cc-title{font-size:13px;font-weight:700;margin-bottom:4px;letter-spacing:.02em}
.cc-meta{font-size:11px;color:var(--t2);margin-bottom:10px}
.cc-progress{background:var(--bd);border-radius:3px;height:4px;margin-bottom:8px;overflow:hidden}
.cc-progress-bar{height:100%;background:var(--accent);border-radius:3px;transition:width .3s}
.case-card.won .cc-progress-bar{background:var(--green)}
.cc-stats{display:flex;gap:12px;font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em}
.cc-stats b{color:var(--text);font-size:11px}
.cc-badge{display:inline-block;padding:1px 7px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-left:6px}
.badge-active{background:var(--adim);color:var(--accent);border:1px solid var(--accent)}
.badge-won{background:var(--greendim);color:var(--green);border:1px solid var(--green)}
.badge-lost{background:var(--rdim);color:var(--red);border:1px solid var(--red)}
.badge-settled{background:var(--gdim);color:var(--gold);border:1px solid var(--gold)}
.badge-appealing{background:var(--pdim);color:var(--purple);border:1px solid var(--purple)}
.add-case-btn{background:var(--adim);border:1px dashed var(--accent);color:var(--accent);border-radius:10px;padding:20px;cursor:pointer;text-align:center;font-size:13px;font-weight:600;letter-spacing:.05em;transition:all .12s;width:100%}
.add-case-btn:hover{background:var(--accent);color:#000}
/* Case detail */
#case-detail{display:none;flex-direction:column;gap:0;flex:1;overflow:hidden}
.cd-header{padding:16px 20px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--s1)}
.cd-header h2{font-size:15px;font-weight:700;flex:1;letter-spacing:.05em}
.cd-body{display:grid;grid-template-columns:1fr 340px;flex:1;overflow:hidden}
.cd-left{overflow-y:auto;padding:16px}
.cd-right{border-left:1px solid var(--bd);overflow-y:auto;padding:14px;background:var(--s1)}
.section-head{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--bd)}
/* Tasks/checklist */
.task-list{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.task{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;cursor:pointer;transition:all .12s}
.task:hover{border-color:var(--bd2)}
.task.done-task{opacity:.5}
.task.done-task .task-title{text-decoration:line-through;color:var(--t3)}
.task-check{width:18px;height:18px;border:2px solid var(--bd2);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px;transition:all .12s;font-size:12px}
.task.done-task .task-check{background:var(--green);border-color:var(--green);color:#000}
.task-body{flex:1;min-width:0}
.task-title{font-size:12px;font-weight:600;margin-bottom:2px;line-height:1.3}
.task-desc{font-size:11px;color:var(--t2);line-height:1.4}
.task-meta{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}
.task-cat{font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:1px 6px;border-radius:3px;font-weight:700}
.cat-action{background:#1a0010;color:var(--accent);border:1px solid var(--accent)}
.cat-filing{background:#0a1a00;color:var(--green);border:1px solid var(--green)}
.cat-evidence{background:#1a1000;color:var(--gold);border:1px solid var(--gold)}
.cat-hearing{background:var(--rdim);color:var(--red);border:1px solid var(--red)}
.cat-legal{background:var(--pdim);color:var(--purple);border:1px solid var(--purple)}
.cat-research{background:var(--s3);color:var(--t2);border:1px solid var(--bd2)}
.task-due{font-size:10px;color:var(--t3)}
.task-due.overdue{color:var(--red);font-weight:700}
.task-del{color:var(--t3);background:none;border:none;cursor:pointer;padding:2px;font-size:13px;flex-shrink:0;align-self:flex-start;margin-top:1px}
.task-del:hover{color:var(--red)}
/* Timeline */
.timeline{display:flex;flex-direction:column;gap:0;position:relative}
.timeline::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:1px;background:var(--bd2)}
.tl-item{display:flex;gap:14px;padding-bottom:14px;position:relative}
.tl-dot{width:17px;height:17px;border-radius:50%;background:var(--bd2);border:2px solid var(--bd2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;margin-top:2px;z-index:1}
.tl-dot.hearing{background:var(--rdim);border-color:var(--red);color:var(--red)}
.tl-dot.filing{background:var(--greendim);border-color:var(--green);color:var(--green)}
.tl-dot.milestone{background:var(--adim);border-color:var(--accent);color:var(--accent)}
.tl-dot.order{background:var(--gdim);border-color:var(--gold);color:var(--gold)}
.tl-content{flex:1;padding-bottom:4px}
.tl-title{font-size:12px;font-weight:600;margin-bottom:2px}
.tl-date{font-size:10px;color:var(--t3)}
.tl-desc{font-size:11px;color:var(--t2);margin-top:3px}
.tl-del{color:var(--t3);background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px}
.tl-del:hover{color:var(--red)}
/* Docs checklist */
.doc-list{display:flex;flex-direction:column;gap:4px}
.doc-item{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--s2);border:1px solid var(--bd);border-radius:6px;font-size:12px;cursor:pointer;transition:border-color .1s}
.doc-item:hover{border-color:var(--bd2)}
.doc-status{font-size:16px;flex-shrink:0}
.doc-title{flex:1;color:var(--t2)}.doc-item.have .doc-title{color:var(--green)}
.doc-del{color:var(--t3);background:none;border:none;cursor:pointer;font-size:12px}
.doc-del:hover{color:var(--red)}
/* Court resources */
.res-grid{display:flex;flex-direction:column;gap:5px}
.res-item{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--s2);border:1px solid var(--bd);border-radius:6px;font-size:11px}
.res-item a{color:var(--accent);text-decoration:none;font-weight:600;font-size:11px}
.res-item a:hover{text-decoration:underline}
/* Add forms (inline) */
.add-form{background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:12px;margin-top:8px}
.add-form input,.add-form textarea,.add-form select{width:100%;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:6px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none;margin-bottom:6px}
.add-form input:focus,.add-form textarea:focus,.add-form select:focus{border-color:var(--accent)}
.add-form textarea{resize:vertical;min-height:60px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
/* NSW search */
.court-results{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.cr-item{background:var(--s2);border:1px solid var(--bd);border-radius:7px;padding:10px 12px}
.cr-title{font-size:12px;font-weight:600;margin-bottom:3px}
.cr-title a{color:var(--accent);text-decoration:none}.cr-title a:hover{text-decoration:underline}
.cr-meta{font-size:10px;color:var(--t3);margin-bottom:4px}
.cr-snip{font-size:11px;color:var(--t2);line-height:1.4}

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
<title>I AM THE LAW — Australian Legal Engine</title>
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
  <div class="logo">I AM <em>THE LAW</em><sub>beta</sub></div>
  <div class="tabs" id="tabs">
    <button class="tab active" data-tab="search" onclick="switchTab('search')">⌕ Search</button>
    <button class="tab" data-tab="mycases" onclick="switchTab('mycases')">⚡ My Cases</button>
    <button class="tab" data-tab="research" onclick="switchTab('research')">◈ AI Research</button>
    <button class="tab" data-tab="areas" onclick="switchTab('areas')">≡ Browse</button>
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

<!-- War Room: My Cases (full-screen overlay) -->
<div id="warroom" style="display:none;position:fixed;inset:0;background:var(--bg);z-index:80;flex-direction:column;overflow:hidden">
  <div style="background:var(--s1);border-bottom:1px solid var(--bd);padding:12px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0">
    <div style="font-size:13px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--accent)">⚡ WAR ROOM</div>
    <div style="font-size:11px;color:var(--t3)">Your cases. Your fight.</div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      <button class="bp" style="font-size:11px;padding:5px 12px;letter-spacing:.05em" onclick="showAddCase()">+ New Case</button>
      <button class="bg" style="font-size:11px;padding:5px 12px;background:var(--pdim);border-color:var(--purple);color:var(--purple)" onclick="syncRegistry()" id="btn-registry-sync">⟳ Sync Registry</button>
      <div id="registry-sync-status" style="font-size:10px;color:var(--t3)"></div>
      <button class="bg" style="font-size:11px;padding:5px 10px" onclick="switchTab('search')">✕ Close</button>
    </div>
  </div>
  <div id="wr-body" style="flex:1;overflow-y:auto;padding:18px"></div>
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

<script data-cfasync="false">
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
  $('warroom').style.display = t==='mycases' ? 'flex' : 'none';

  if (t==='search') {
    $('rpanel').classList.remove('open'); rpOpen=false;
    if (!S.q&&!S.type&&!S.juris) showEmpty();
  }
  if (t==='research') {
    $('rpanel').classList.add('open'); rpOpen=true;
    showEmpty('Pick an area below or describe your situation in the research panel →');
  }
  if (t==='areas') {
    $('rpanel').classList.remove('open'); rpOpen=false;
    renderAreaBrowser();
  }
  if (t==='mycases') {
    $('rpanel').classList.remove('open'); rpOpen=false;
    loadWarRoom();
  }
}

// ── WAR ROOM ──────────────────────────────────────────────────────────────────
const AREA_LABELS = {tenancy:'Renting & Tenancy',employment:'Employment',family:'Family Law',consumer:'Consumer & Contracts',debt:'Debt & Contracts',injury:'Personal Injury',criminal:'Criminal Law',immigration:'Immigration',property:'Property',discrimination:'Discrimination',wills:'Wills & Estates'};
const STATUS_LABELS = {active:'Active',won:'Won ✓',lost:'Lost',settled:'Settled',appealing:'Appealing'};
const CAT_ICONS = {action:'◈',filing:'↑',evidence:'📎',hearing:'⚖',legal:'§',research:'⌕'};
const TYPE_ICONS = {hearing:'⚖',filing:'↑',order:'⚡',milestone:'★',note:'◈',judgment:'⚖'};

let currentCaseId = null;

async function loadWarRoom(caseId=null) {
  if(caseId){ await loadCaseDetail(caseId); return; }
  const cases = await (await fetch('/api/cases')).json();
  const body = $('wr-body');

  if(!cases.length){
    body.innerHTML=\`<div style="text-align:center;padding:60px 20px">
      <div style="font-size:48px;margin-bottom:16px;opacity:.3">⚡</div>
      <div style="font-size:18px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">No cases yet</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:24px">Add your first case to start building your legal strategy.</div>
      <button class="bp" style="padding:10px 24px;font-size:13px;letter-spacing:.08em" onclick="showAddCase()">+ Add My Case</button>
    </div>\`;
    return;
  }

  body.innerHTML=\`
    <div class="wr-header">
      <h2>⚡ My Cases (\${cases.length})</h2>
    </div>
    <div class="case-grid" id="case-grid"></div>
  \`;

  const grid=$('case-grid');
  cases.forEach(c=>{
    const pct=c.total_tasks>0?Math.round((c.done_tasks/c.total_tasks)*100):0;
    const deadline=c.next_deadline?new Date(c.next_deadline)<new Date()?'<span style="color:var(--red)">⚠ OVERDUE</span>':'Due '+c.next_deadline:'';
    const div=document.createElement('div');
    div.className='case-card '+c.status;
    div.onclick=()=>loadCaseDetail(c.id);
    div.innerHTML=\`
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
        <div class="cc-title">\${esc(c.title)}<span class="cc-badge badge-\${c.status}">\${STATUS_LABELS[c.status]||c.status}</span></div>
      </div>
      <div class="cc-meta">\${esc(c.court||'')} \${c.matter_number?'· #'+esc(c.matter_number):''} \${c.area_of_law?'· '+esc(AREA_LABELS[c.area_of_law]||c.area_of_law):''}</div>
      <div class="cc-progress"><div class="cc-progress-bar" style="width:\${pct}%"></div></div>
      <div class="cc-stats">
        <div>\${pct}% <span style="color:var(--t3)">complete</span></div>
        <div><b>\${c.done_tasks||0}</b><span style="color:var(--t3)">/ \${c.total_tasks||0} tasks</span></div>
        \${c.next_date?'<div style="color:var(--gold)">📅 '+esc(c.next_date)+'</div>':''}
        \${deadline?'<div>'+deadline+'</div>':''}
      </div>
    \`;
    grid.appendChild(div);
  });

  // Add new case card
  const addDiv=document.createElement('div');
  addDiv.innerHTML='<button class="add-case-btn" onclick="showAddCase()">+ ADD NEW CASE</button>';
  grid.appendChild(addDiv);
}

async function loadCaseDetail(id) {
  currentCaseId=id;
  const c = await (await fetch('/api/cases/'+id)).json();
  const body = $('wr-body');
  const pct=c.tasks.length>0?Math.round((c.tasks.filter(t=>t.done).length/c.tasks.length)*100):0;
  const done=c.tasks.filter(t=>t.done).length;
  const resources = await (await fetch('/api/court-resources?juris='+c.jurisdiction)).json();

  // Build task list
  const taskHtml = t => {
    const isOver = t.due_date && !t.done && new Date(t.due_date)<new Date();
    return \`<div class="task\${t.done?' done-task':''}" onclick="toggleTask(\${t.id})">
      <div class="task-check">\${t.done?'✓':''}</div>
      <div class="task-body">
        <div class="task-title">\${esc(t.title)}</div>
        \${t.description?\`<div class="task-desc">\${esc(t.description)}</div>\`:''}
        <div class="task-meta">
          <span class="task-cat cat-\${t.category}">\${CAT_ICONS[t.category]||'◈'} \${t.category}</span>
          \${t.due_date?\`<span class="task-due\${isOver?' overdue':''}">\${isOver?'⚠ OVERDUE: ':'Due: '}\${t.due_date}</span>\`:''}
        </div>
      </div>
      <button class="task-del" onclick="event.stopPropagation();deleteTask(\${t.id})" title="Delete">✕</button>
    </div>\`;
  };

  const pending = c.tasks.filter(t=>!t.done);
  const completed = c.tasks.filter(t=>t.done);

  body.innerHTML=\`
    <div id="case-detail" style="display:flex">
      <div class="cd-header">
        <button class="bg" style="padding:4px 10px;font-size:11px" onclick="loadWarRoom()">← Cases</button>
        <h2>\${esc(c.title)}<span class="cc-badge badge-\${c.status}" style="margin-left:8px">\${STATUS_LABELS[c.status]||c.status}</span></h2>
        <div style="font-size:11px;color:var(--t3)">\${pct}% · \${done}/\${c.tasks.length} tasks · \${c.area_of_law?AREA_LABELS[c.area_of_law]:''}</div>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="bg" style="font-size:11px;padding:4px 10px" onclick="showEditCase(\${c.id})">Edit</button>
          <button class="bg" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:var(--red)" onclick="deleteCaseConfirm(\${c.id})">Delete</button>
        </div>
      </div>
      <div class="cd-body">
        <div class="cd-left">
          <!-- Progress -->
          <div style="background:var(--s2);border:1px solid var(--bd2);border-radius:10px;padding:14px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px">
              <span style="color:var(--t2)">Case progress</span>
              <span style="font-weight:700;color:\${pct===100?'var(--green)':'var(--accent)'}">\${pct}%</span>
            </div>
            <div class="cc-progress" style="height:8px"><div class="cc-progress-bar" style="width:\${pct}%"></div></div>
            \${c.next_date?\`<div style="margin-top:10px;font-size:11px;color:var(--gold)">📅 Next date: <b>\${c.next_date}</b></div>\`:''}
            \${c.matter_number?\`<div style="margin-top:4px;font-size:11px;color:var(--t2)">Matter: <b>\${esc(c.matter_number)}</b></div>\`:''}
            \${c.notes?\`<div style="margin-top:8px;font-size:11px;color:var(--t2);white-space:pre-wrap">\${esc(c.notes)}</div>\`:''}
          </div>

          <!-- Tasks -->
          <div class="section-head">▶ TASKS (\${pending.length} pending)</div>
          <div class="task-list" id="task-list">
            \${pending.map(taskHtml).join('')}
          </div>
          \${completed.length?\`<div style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;cursor:pointer" onclick="toggleCompleted()">▾ Completed (\${completed.length})</div>
          <div id="completed-tasks" style="display:none" class="task-list">\${completed.map(taskHtml).join('')}</div>\`:''}

          <!-- Add task form -->
          <button class="bg" style="width:100%;margin-top:8px;font-size:11px;letter-spacing:.05em" onclick="showAddTask()">+ Add task</button>
          <div id="add-task-form" style="display:none" class="add-form">
            <input id="nt-title" placeholder="Task title *" type="text">
            <textarea id="nt-desc" placeholder="Description (optional)"></textarea>
            <div class="form-row">
              <select id="nt-cat">
                <option value="action">◈ Action</option>
                <option value="filing">↑ Filing</option>
                <option value="evidence">📎 Evidence</option>
                <option value="hearing">⚖ Hearing</option>
                <option value="legal">§ Legal</option>
                <option value="research">⌕ Research</option>
              </select>
              <input id="nt-due" type="date" placeholder="Due date">
            </div>
            <div style="display:flex;gap:6px">
              <button class="bp" style="font-size:11px;flex:1" onclick="addTask()">Add Task</button>
              <button class="bg" style="font-size:11px" onclick="$('add-task-form').style.display='none'">Cancel</button>
            </div>
          </div>

          <!-- Documents -->
          <div class="section-head" style="margin-top:20px">📎 EVIDENCE & DOCUMENTS (\${c.documents.length})</div>
          <div class="doc-list" id="doc-list">
            \${c.documents.map(d=>\`<div class="doc-item \${d.status==='have'?'have':''}" onclick="toggleDoc(\${d.id})">
              <span class="doc-status">\${d.status==='have'?'✅':'☐'}</span>
              <span class="doc-title">\${esc(d.title)}</span>
              <button class="doc-del" onclick="event.stopPropagation();deleteDoc(\${d.id})">✕</button>
            </div>\`).join('')}
          </div>
          <div id="add-doc-form-wrap">
            <button class="bg" style="width:100%;margin-top:6px;font-size:11px;letter-spacing:.05em" onclick="$('add-doc-form').style.display='block';this.style.display='none'">+ Add document</button>
            <div id="add-doc-form" style="display:none" class="add-form">
              <input id="nd-title" placeholder="Document name *" type="text">
              <div style="display:flex;gap:6px">
                <button class="bp" style="font-size:11px;flex:1" onclick="addDoc()">Add</button>
                <button class="bg" style="font-size:11px" onclick="$('add-doc-form').style.display='none';$('add-doc-form-wrap').querySelector('button').style.display='block'">Cancel</button>
              </div>
            </div>
          </div>

          <!-- NSW Caselaw search -->
          <div class="section-head" style="margin-top:20px">⌕ SEARCH NSW CASELAW</div>
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <input id="nsw-q" type="text" style="flex:1;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:6px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none" placeholder="Search by party name or issue…" value="\${esc(c.title.split(' v ')[0]||'')}">
            <button class="bp" style="font-size:11px;padding:6px 12px;white-space:nowrap" onclick="searchCaselaw()">Search</button>
          </div>
          <div id="nsw-results"></div>
        </div>

        <div class="cd-right">
          <!-- Timeline -->
          <div class="section-head">▶ TIMELINE</div>
          <div class="timeline" id="timeline">
            \${c.events.map(e=>\`<div class="tl-item">
              <div class="tl-dot \${e.event_type}">\${TYPE_ICONS[e.event_type]||'◈'}</div>
              <div class="tl-content">
                <div class="tl-title">\${esc(e.title)}</div>
                \${e.event_date?\`<div class="tl-date">\${e.event_date}</div>\`:''}
                \${e.description?\`<div class="tl-desc">\${esc(e.description)}</div>\`:''}
              </div>
              <button class="tl-del" onclick="deleteEvent(\${e.id})">✕</button>
            </div>\`).join('')}
          </div>
          <div id="add-event-form" class="add-form" style="margin-top:8px">
            <input id="ne-title" placeholder="Event title *" type="text">
            <div class="form-row">
              <input id="ne-date" type="date">
              <select id="ne-type">
                <option value="hearing">⚖ Hearing</option>
                <option value="filing">↑ Filing</option>
                <option value="order">⚡ Order</option>
                <option value="milestone">★ Milestone</option>
                <option value="note" selected>◈ Note</option>
              </select>
            </div>
            <input id="ne-desc" placeholder="Details (optional)" type="text">
            <button class="bp" style="width:100%;font-size:11px" onclick="addEvent()">Add to timeline</button>
          </div>

          <!-- Court resources -->
          <div class="section-head" style="margin-top:20px">🔗 COURT RESOURCES</div>
          <div class="res-grid">
            \${resources.map(r=>\`<div class="res-item"><div><div style="font-weight:600;font-size:11px">\${esc(r.name)}</div><div style="font-size:10px;color:var(--t3)">\${esc(r.desc)}</div></div><a href="\${esc(r.url)}" target="_blank" rel="noopener">Open ↗</a></div>\`).join('')}
          </div>

          <!-- AI: Research this case -->
          <div class="section-head" style="margin-top:20px">◈ AI RESEARCH</div>
          <button class="blink" style="width:100%;padding:9px;font-size:12px;letter-spacing:.06em" onclick="researchThisCase()">◈ Research \${esc(AREA_LABELS[c.area_of_law]||'my case')} with AI</button>
        </div>
      </div>
    </div>
  \`;
}

function toggleCompleted(){ const d=$('completed-tasks'); d.style.display=d.style.display==='none'?'block':'none'; }

async function toggleTask(id){
  await fetch('/api/cases/'+currentCaseId+'/tasks/'+id+'/toggle',{method:'POST'});
  loadCaseDetail(currentCaseId);
}
async function deleteTask(id){
  if(!confirm('Delete this task?'))return;
  await fetch('/api/cases/'+currentCaseId+'/tasks/'+id,{method:'DELETE'});
  loadCaseDetail(currentCaseId);
}
function showAddTask(){$('add-task-form').style.display=$('add-task-form').style.display==='none'?'block':'none'}
async function addTask(){
  const t=$('nt-title').value.trim();if(!t)return;
  await fetch('/api/cases/'+currentCaseId+'/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t,description:$('nt-desc').value,category:$('nt-cat').value,due_date:$('nt-due').value||null})});
  loadCaseDetail(currentCaseId);
}
async function deleteEvent(id){
  await fetch('/api/cases/'+currentCaseId+'/events/'+id,{method:'DELETE'});
  loadCaseDetail(currentCaseId);
}
async function addEvent(){
  const t=$('ne-title').value.trim();if(!t)return;
  await fetch('/api/cases/'+currentCaseId+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t,event_date:$('ne-date').value||null,event_type:$('ne-type').value,description:$('ne-desc').value})});
  loadCaseDetail(currentCaseId);
}
async function toggleDoc(id){
  await fetch('/api/cases/'+currentCaseId+'/documents/'+id+'/toggle',{method:'POST'});
  loadCaseDetail(currentCaseId);
}
async function deleteDoc(id){
  await fetch('/api/cases/'+currentCaseId+'/documents/'+id,{method:'DELETE'});
  loadCaseDetail(currentCaseId);
}
async function addDoc(){
  const t=$('nd-title').value.trim();if(!t)return;
  await fetch('/api/cases/'+currentCaseId+'/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t})});
  loadCaseDetail(currentCaseId);
}

async function searchCaselaw(){
  const q=$('nsw-q').value.trim();if(!q)return;
  const r=$('nsw-results');
  r.innerHTML='<div style="font-size:11px;color:var(--t3)">Searching NSW Caselaw…</div>';
  const d=await (await fetch('/api/courtlink?q='+encodeURIComponent(q))).json();
  if(!d.results?.length){r.innerHTML='<div style="font-size:11px;color:var(--t3)">No results found. Try different search terms.</div>';return}
  r.innerHTML='<div class="court-results">'+d.results.map(c=>\`<div class="cr-item">
    <div class="cr-title"><a href="\${esc(c.url)}" target="_blank" rel="noopener">\${esc(c.title)}</a></div>
    <div class="cr-meta">\${esc(c.court)} \${c.date?'· '+esc(c.date):''}</div>
    \${c.summary?\`<div class="cr-snip">\${esc(c.summary)}</div>\`:''}
  </div>\`).join('')+'</div>';
}

// ── NSW Registry sync ─────────────────────────────────────────────────────────
async function syncRegistry(){
  const btn=$('btn-registry-sync'), st=$('registry-sync-status');
  btn.disabled=true; btn.textContent='Syncing…'; st.textContent=''; st.style.color='var(--t3)';

  // Prompt for party name if not configured
  let partyName = '';
  try {
    const ms = await (await fetch('/api/models')).json();
    partyName = ms.keys.registry_name || '';
    if (!ms.keys.registry_user || !ms.keys.registry_pass) {
      st.style.color='var(--amber)'; st.textContent='Add Registry login in ⚙ Settings first';
      btn.disabled=false; btn.textContent='⟳ Sync Registry'; return;
    }
    if (!partyName) {
      partyName = prompt('Enter your full legal name as it appears in court documents (e.g. SMITH JOHN):') || '';
      if (!partyName.trim()) { btn.disabled=false; btn.textContent='⟳ Sync Registry'; return; }
    }
  } catch(e) { st.style.color='var(--red)'; st.textContent='Error: '+e.message; btn.disabled=false; btn.textContent='⟳ Sync Registry'; return; }

  try {
    st.textContent='Logging in to NSW Registry…';
    // Pre-login so we can handle 2FA before the sync
    const keys2 = await (await fetch('/api/models')).json();
    const loginR = await fetch('/api/registry/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:keys2.keys.registry_user, password:keys2.keys.registry_pass})});
    const loginD = await loginR.json();
    if (loginD.needs_2fa) {
      st.style.color='var(--amber)'; st.textContent='2FA required…';
      const code = prompt('NSW Registry sent you a verification code.\\nEnter it here:');
      if (!code) { btn.disabled=false; btn.textContent='⟳ Sync Registry'; st.textContent='Cancelled.'; return; }
      const r2fa = await fetch('/api/registry/2fa', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code})});
      const d2fa = await r2fa.json();
      if (!d2fa.ok) { st.style.color='var(--red)'; st.textContent='2FA error: '+(d2fa.error||'failed'); btn.disabled=false; btn.textContent='⟳ Sync Registry'; return; }
      st.textContent='2FA accepted. Fetching cases…';
    } else if (!loginD.ok) {
      st.style.color='var(--red)'; st.textContent='Login error: '+(loginD.error||'failed');
      btn.disabled=false; btn.textContent='⟳ Sync Registry'; return;
    } else { st.textContent='Logged in. Fetching cases…'; }

    const r = await fetch('/api/registry/sync', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({partyName})});
    const d = await r.json();

    if (!d.ok) {
      st.style.color='var(--red)'; st.textContent='Error: '+(d.error||'Unknown error');
      // Show debug nav links if available
      if (d.debug?.navLinks?.length) {
        console.log('[Registry] Nav links found after login:', d.debug.navLinks);
        st.textContent += ' (check console for nav links)';
      }
      btn.disabled=false; btn.textContent='⟳ Sync Registry'; return;
    }

    const cases = d.cases || [];
    if (!cases.length) {
      st.style.color='var(--amber)';
      st.textContent = d.message || 'No cases found for "'+partyName+'"';
      if (d.rawText) { console.log('[Registry] Raw page text:', d.rawText); st.textContent += ' (see console)'; }
      btn.disabled=false; btn.textContent='⟳ Sync Registry'; return;
    }

    // Import cases that don't already exist (match by matter number)
    const existing = await (await fetch('/api/cases')).json();
    const existingNums = new Set(existing.map(c=>c.matter_number).filter(Boolean));
    let added=0, skipped=0;

    for (const rc of cases) {
      const mn = (rc.matter_number||'').trim();
      if (mn && existingNums.has(mn)) { skipped++; continue; }
      // Map registry fields to our case format
      const newCase = {
        title:         rc.title || rc.matter_number || 'Registry Case',
        court:         rc.court || 'NSW Court',
        matter_number: rc.matter_number || '',
        status:        mapRegistryStatus(rc.status),
        next_date:     parseRegistryDate(rc.next_date),
        notes:         rc.parties ? 'Parties: '+rc.parties : '',
        jurisdiction:  'nsw',
        area_of_law:   '',
      };
      await fetch('/api/cases', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newCase)});
      added++;
    }

    st.style.color='var(--green)';
    st.textContent=\`✓ Synced: \${added} added, \${skipped} already existed\`;
    await loadWarRoom(); // refresh case list
  } catch(e) {
    st.style.color='var(--red)'; st.textContent='Error: '+e.message;
  }
  btn.disabled=false; btn.textContent='⟳ Sync Registry';
}

function mapRegistryStatus(s) {
  if (!s) return 'active';
  const sl = s.toLowerCase();
  if (sl.includes('finalised')||sl.includes('disposed')||sl.includes('judgment')) return 'won';
  if (sl.includes('withdrawn')||sl.includes('dismissed')) return 'lost';
  if (sl.includes('settled')||sl.includes('consent')) return 'settled';
  return 'active';
}

function parseRegistryDate(s) {
  if (!s) return null;
  // DD/MM/YYYY
  const p1 = s.match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);
  if (p1) return p1[3]+'-'+p1[2].padStart(2,'0')+'-'+p1[1].padStart(2,'0');
  // DD Mon YYYY
  const MONTHS={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  const p2 = s.match(/(\\d{1,2})[\\s-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\\s-](\\d{4})/i);
  if (p2) return p2[3]+'-'+(MONTHS[p2[2].toLowerCase().slice(0,3)]||'01')+'-'+p2[1].padStart(2,'0');
  return null;
}

function researchThisCase(){
  switchTab('research');
  openRP();
  const c = {area: currentCaseId?'':'', juris: ''};
  fetch('/api/cases/'+currentCaseId).then(r=>r.json()).then(d=>{
    $('rpdesc').value=d.title+(d.notes?'\\n\\n'+d.notes:'');
    if(d.jurisdiction)$('rpjur').value=d.jurisdiction;
    if(d.area_of_law)$('rparea').value=d.area_of_law;
  });
}

// Add case modal
function showAddCase(prefill={}){
  const overlay=document.createElement('div');
  overlay.id='add-case-overlay';
  overlay.style='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)';
  overlay.innerHTML=\`<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:14px;width:500px;padding:28px;box-shadow:0 25px 80px rgba(0,0,0,.7);max-height:90vh;overflow-y:auto">
    <div style="font-size:15px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:18px;color:var(--accent)">⚡ ADD CASE</div>
    <label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Case title *</label>
    <input id="nc-title" type="text" placeholder="e.g. Smith v Jones Pty Ltd" style="width:100%;background:var(--bg);border:1.5px solid var(--bd2);color:var(--text);padding:8px 10px;border-radius:7px;font-size:13px;font-family:'Roboto Mono',monospace;outline:none;margin-bottom:10px">
    <div class="form-row" style="margin-bottom:10px">
      <div>
        <label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Court / Tribunal</label>
        <input id="nc-court" type="text" placeholder="e.g. NSWSC, NCAT, FWC" style="width:100%;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:7px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none">
      </div>
      <div>
        <label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Matter number</label>
        <input id="nc-num" type="text" placeholder="e.g. 2024/00123" style="width:100%;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:7px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none">
      </div>
    </div>
    <div class="form-row" style="margin-bottom:10px">
      <div>
        <label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Area of law</label>
        <select id="nc-area" style="width:100%;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:7px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none;appearance:none">
          <option value="">Select area…</option>
          <option value="tenancy">🏠 Renting & Tenancy</option>
          <option value="employment">💼 Employment</option>
          <option value="family">👨‍👩‍👧 Family Law</option>
          <option value="consumer">🛒 Consumer</option>
          <option value="debt">💰 Debt & Contracts</option>
          <option value="injury">🤕 Personal Injury</option>
          <option value="criminal">⚖️ Criminal</option>
          <option value="immigration">✈️ Immigration</option>
          <option value="property">🏡 Property</option>
          <option value="discrimination">🤝 Discrimination</option>
          <option value="wills">📜 Wills & Estates</option>
        </select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Jurisdiction</label>
        <select id="nc-juris" style="width:100%;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:7px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none;appearance:none">
          <option value="nsw">New South Wales</option>
          <option value="vic">Victoria</option>
          <option value="qld">Queensland</option>
          <option value="cth">Commonwealth</option>
          <option value="sa">South Australia</option>
          <option value="wa">Western Australia</option>
          <option value="tas">Tasmania</option>
          <option value="nt">Northern Territory</option>
          <option value="act">ACT</option>
        </select>
      </div>
    </div>
    <label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Next court date</label>
    <input id="nc-date" type="date" style="width:100%;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:7px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none;margin-bottom:10px">
    <label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Notes</label>
    <textarea id="nc-notes" rows="3" placeholder="Brief description of your case…" style="width:100%;background:var(--bg);border:1px solid var(--bd2);color:var(--text);padding:7px 9px;border-radius:6px;font-size:12px;font-family:'Roboto Mono',monospace;outline:none;resize:vertical;margin-bottom:14px"></textarea>
    <div style="font-size:11px;color:var(--t3);margin-bottom:14px">✓ Pre-built task checklist will be added automatically for the selected area of law.</div>
    <div style="display:flex;gap:8px">
      <button class="bp" style="flex:1;padding:10px;font-size:12px;letter-spacing:.08em" onclick="submitAddCase()">⚡ CREATE CASE</button>
      <button class="bg" style="padding:10px 14px;font-size:12px" onclick="document.getElementById('add-case-overlay').remove()">Cancel</button>
    </div>
  </div>\`;
  document.body.appendChild(overlay);
  setTimeout(()=>$('nc-title').focus(),80);
}

async function submitAddCase(){
  const title=$('nc-title').value.trim();
  if(!title)return;
  const data={title,court:$('nc-court').value,matter_number:$('nc-num').value,area_of_law:$('nc-area').value,jurisdiction:$('nc-juris').value||'nsw',next_date:$('nc-date').value||null,notes:$('nc-notes').value};
  const r=await fetch('/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const c=await r.json();
  document.getElementById('add-case-overlay').remove();
  await loadCaseDetail(c.id);
}

async function deleteCaseConfirm(id){
  if(!confirm('Delete this case and all its tasks? This cannot be undone.'))return;
  await fetch('/api/cases/'+id,{method:'DELETE'});
  currentCaseId=null;
  loadWarRoom();
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
    <p style="font-size:12px;color:var(--t2);margin-bottom:12px">Keys stored in your local .env file. Leave blank to keep existing value.</p>

    <div class="sh" style="margin-bottom:10px;color:var(--accent)">AI API Keys</div>
    \${[
      {k:'anthropic',label:'Anthropic (Claude)',hint:'console.anthropic.com'},
      {k:'openai',   label:'OpenAI (GPT-4o)',   hint:'platform.openai.com'},
      {k:'gemini',   label:'Google (Gemini)',    hint:'aistudio.google.com'},
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

    <div class="sh" style="margin:16px 0 10px;color:var(--accent)">NSW Online Registry</div>
    <p style="font-size:11px;color:var(--t2);margin-bottom:10px">Login to auto-sync your cases from the NSW Courts registry.</p>
    <div class="setrow">
      <label>Registry Username</label>
      <input type="text" id="key-registry_user" placeholder="Your lawlink.nsw.gov.au username" value="\${ms.keys.registry_user?'••••••':''}">
    </div>
    <div class="setrow">
      <label>Registry Password</label>
      <input type="password" id="key-registry_pass" placeholder="Your password" value="\${ms.keys.registry_pass?'••••••••':''}">
    </div>
    <div class="setrow">
      <label>Your Full Legal Name</label>
      <input type="text" id="key-registry_name" placeholder="e.g. SMITH JOHN MICHAEL — as it appears in court docs" value="\${esc(ms.keys.registry_name||'')}">
      <div style="font-size:10px;color:var(--t3);margin-top:3px">Used to search for your cases. Usually SURNAME FIRSTNAME.</div>
    </div>

    <button class="bp" onclick="saveKeys()" style="margin-top:14px">Save all</button>
    <button class="bg" onclick="closeSettings()">Cancel</button>
    <div id="set-msg" style="font-size:12px;color:var(--green);min-height:16px;margin-top:8px"></div>
    <div style="border-top:1px solid var(--bd);padding-top:12px;margin-top:4px">
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
  ['anthropic','openai','gemini','registry_user','registry_pass','registry_name'].forEach(k=>{
    const el=$('key-'+k);
    if(el&&el.value&&!el.value.includes('•')) keys[k]=el.value.trim();
  });
  if(!Object.keys(keys).length){$('set-msg').textContent='No new values entered.';return}
  const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys})});
  const d=await r.json();
  if(d.ok){$('set-msg').textContent='✓ Saved!';setTimeout(openSettings,800)}
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
initCasesTables();

// ── Admin log ─────────────────────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS admin_log (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   TEXT    DEFAULT (datetime('now')),
  type TEXT    NOT NULL,
  ip   TEXT,
  data TEXT
)`);

const ADMIN_PW = 'potato';

function logEvent(type, req, data) {
  const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket?.remoteAddress || '';
  try { db.prepare('INSERT INTO admin_log (type,ip,data) VALUES (?,?,?)').run(type, ip, JSON.stringify(data)); } catch{}
}

function parseCookies(req) {
  const h = req.headers.cookie || '';
  return Object.fromEntries(h.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
}

function adminHtml(rows, keys) {
  const byType = t => rows.filter(r => r.type === t);
  const searches  = byType('search');
  const research  = byType('research');
  const argues    = byType('argue');
  const keylogs   = byType('keys');

  const tbl = (cols, items, rowFn) => items.length === 0
    ? '<p style="color:#555;font-size:12px;padding:8px 0">No data yet.</p>'
    : `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${items.map(rowFn).join('')}</tbody></table>`;

  const td = v => `<td>${String(v||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>`;
  const ts = r => `<td style="color:#555;white-space:nowrap">${r.ts}</td>`;
  const ip = r => `<td style="color:#777">${r.ip||'?'}</td>`;
  const parse = r => { try { return JSON.parse(r.data||'{}'); } catch { return {}; } };

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>IAMTHELAW — Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#050505;color:#e8e8e8;font-family:'Courier New',monospace;font-size:13px;padding:24px}
h1{color:#ff0099;font-size:18px;letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px}
.sub{color:#444;font-size:11px;margin-bottom:28px}
h2{color:#ff0099;font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin:28px 0 10px;border-bottom:1px solid #1f1f1f;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{text-align:left;color:#555;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-bottom:1px solid #1a1a1a}
td{padding:6px 10px;border-bottom:1px solid #111;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top}
tr:hover td{background:#0a0a0a}
.key-val{color:#ff0099;font-weight:700;letter-spacing:.03em;word-break:break-all;white-space:normal}
.key-empty{color:#333;font-style:italic}
.pill{display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase;background:#1a0010;color:#ff0099;border:1px solid #ff0099;margin-right:4px}
.section{background:#0a0a0a;border:1px solid #1f1f1f;border-radius:8px;padding:16px;margin-bottom:20px}
.stat{display:inline-block;margin-right:20px;color:#555;font-size:11px}<b style="color:#e8e8e8">.stat b</b>
a{color:#ff0099;text-decoration:none}
a:hover{text-decoration:underline}
</style></head><body>
<h1>⚡ IAMTHELAW — ADMIN</h1>
<div class="sub"><a href="/">← Back to app</a> &nbsp;·&nbsp; ${rows.length} total events logged</div>

<h2>🔑 Current API Keys (.env)</h2>
<div class="section">
  ${['anthropic','openai','gemini'].map(p => {
    const v = keys[p];
    return `<div style="margin-bottom:8px"><span style="color:#555;width:90px;display:inline-block;text-transform:uppercase;font-size:11px">${p}</span> ${v ? `<span class="key-val">${v}</span>` : '<span class="key-empty">not set</span>'}</div>`;
  }).join('')}
</div>

<h2>🔐 Key Submissions (${keylogs.length})</h2>
<div class="section">${tbl(['Time','IP','Keys Submitted'], keylogs.slice().reverse(), r => {
  const d = parse(r);
  const summary = Object.entries(d.keys||{}).filter(([,v])=>v).map(([k,v])=>`<b style="color:#ff0099">${k}:</b> ${v}`).join('&nbsp; ');
  return `<tr>${ts(r)}${ip(r)}<td style="white-space:normal">${summary||'(empty)'}</td></tr>`;
})}</div>

<h2>🔍 Searches (${searches.length})</h2>
<div class="section">${tbl(['Time','IP','Query','Type','Jurisdiction','Sort'], searches.slice().reverse(), r => {
  const d = parse(r);
  return `<tr>${ts(r)}${ip(r)}${td(d.q)}${td(d.type||'any')}${td(d.juris||'all')}${td(d.sort||'relevance')}</tr>`;
})}</div>

<h2>◈ AI Research Prompts (${research.length})</h2>
<div class="section">${tbl(['Time','IP','Description','Area','Jurisdiction','Model'], research.slice().reverse(), r => {
  const d = parse(r);
  return `<tr>${ts(r)}${ip(r)}<td style="white-space:normal;max-width:500px">${(d.description||'').replace(/</g,'&lt;').slice(0,300)}</td>${td(d.area||'—')}${td(d.jurisdiction||'—')}${td(d.model||'—')}</tr>`;
})}</div>

<h2>⚡ Argument Builder (${argues.length})</h2>
<div class="section">${tbl(['Time','IP','Position','Area','Jurisdiction','Cases','Model'], argues.slice().reverse(), r => {
  const d = parse(r);
  return `<tr>${ts(r)}${ip(r)}<td style="white-space:normal;max-width:300px">${(d.userPosition||'').replace(/</g,'&lt;').slice(0,200)}</td>${td(d.area||'—')}${td(d.jurisdiction||'—')}${td(d.caseCount||0)}${td(d.model||'—')}</tr>`;
})}</div>

</body></html>`;
}

function adminLoginHtml(bad) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Admin Login</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#050505;color:#e8e8e8;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;height:100vh}
.box{background:#0a0a0a;border:1px solid #1f1f1f;border-radius:12px;padding:36px 40px;width:320px;text-align:center}
h1{color:#ff0099;font-size:14px;letter-spacing:.15em;text-transform:uppercase;margin-bottom:24px}
input{width:100%;background:#050505;border:1px solid #2a2a2a;color:#e8e8e8;padding:10px 14px;border-radius:6px;font-family:inherit;font-size:13px;margin-bottom:14px;outline:none}
input:focus{border-color:#ff0099}
button{width:100%;background:#ff0099;color:#000;border:none;padding:10px;border-radius:6px;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
button:hover{background:#ff33aa}
.err{color:#ef4444;font-size:11px;margin-bottom:10px}
</style></head><body>
<div class="box">
  <h1>⚡ Admin Access</h1>
  ${bad ? '<div class="err">Wrong password</div>' : ''}
  <form method="POST" action="/admin">
    <input type="password" name="pw" placeholder="Password" autofocus>
    <button type="submit">Enter</button>
  </form>
</div></body></html>`;
}

const server = createServer(async (req, res) => {
  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // ── Static ──
  if (path==='/'||path==='/index.html') return hres(res, HTML);

  // ── Admin ─────────────────────────────────────────────────────────────────
  if (path==='/admin') {
    if (req.method==='POST') {
      const raw = await body(req);
      const pw = new URLSearchParams(raw).get('pw') || '';
      if (pw !== ADMIN_PW) { res.writeHead(200,{'Content-Type':'text/html'}); res.end(adminLoginHtml(true)); return; }
      res.writeHead(302,{'Set-Cookie':'adm=potato; Path=/; HttpOnly','Location':'/admin'}); res.end(); return;
    }
    const cookies = parseCookies(req);
    if (cookies.adm !== ADMIN_PW) { res.writeHead(200,{'Content-Type':'text/html'}); res.end(adminLoginHtml(false)); return; }
    const rows = db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 2000').all();
    const keys = gk();
    res.writeHead(200,{'Content-Type':'text/html'}); res.end(adminHtml(rows, keys)); return;
  }

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
      if (Object.values(b.keys||{}).some(v=>v)) logEvent('keys', req, {keys: b.keys});
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

    if (q) logEvent('search', req, {q, type, juris, sort, yearFrom, yearTo});
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
      logEvent('research', req, {description, jurisdiction, area, model});
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
      logEvent('argue', req, {userPosition, jurisdiction, area, model, caseCount: caseIds?.length||0});
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

  // ── Court resources ──
  if (path==='/api/court-resources') {
    const juris = url.searchParams.get('juris') || 'nsw';
    const { COURT_RESOURCES } = await import('./courtlink.js');
    return jres(res, COURT_RESOURCES[juris] || COURT_RESOURCES.nsw);
  }

  // ── NSW Caselaw search ──
  if (path==='/api/courtlink') {
    const q = url.searchParams.get('q') || '';
    if (!q) return jres(res, { results: [] });
    try {
      const { searchNSWCaselaw } = await import('./courtlink.js');
      const results = await searchNSWCaselaw(q, 8);
      return jres(res, { results });
    } catch(e) { return jres(res, { results: [], error: e.message }); }
  }

  // ── Cases CRUD ──
  if (path==='/api/cases' && req.method==='GET')  return jres(res, getCases());
  if (path==='/api/cases' && req.method==='POST') {
    const data = JSON.parse(await body(req));
    return jres(res, createCase(data), 201);
  }

  const caseMatch = path.match(/^\/api\/cases\/(\d+)$/);
  if (caseMatch) {
    const cid = parseInt(caseMatch[1], 10);
    if (req.method==='GET')    return jres(res, getCase(cid) || {error:'Not found'});
    if (req.method==='PUT')    return jres(res, updateCase(cid, JSON.parse(await body(req))));
    if (req.method==='DELETE') { deleteCase(cid); return jres(res, {ok:true}); }
  }

  // Tasks
  const taskPost = path.match(/^\/api\/cases\/(\d+)\/tasks$/);
  if (taskPost && req.method==='POST') {
    upsertTask(parseInt(taskPost[1],10), JSON.parse(await body(req)));
    return jres(res, {ok:true});
  }
  const taskToggle = path.match(/^\/api\/cases\/(\d+)\/tasks\/(\d+)\/toggle$/);
  if (taskToggle && req.method==='POST') {
    const db2 = getDb();
    const t = db2.prepare('SELECT done FROM case_tasks WHERE id=?').get(parseInt(taskToggle[2],10));
    db2.prepare('UPDATE case_tasks SET done=? WHERE id=?').run(t?.done?0:1, parseInt(taskToggle[2],10));
    return jres(res, {ok:true});
  }
  const taskDel = path.match(/^\/api\/cases\/(\d+)\/tasks\/(\d+)$/);
  if (taskDel && req.method==='DELETE') { deleteTask(parseInt(taskDel[2],10)); return jres(res,{ok:true}); }

  // Events
  const evtPost = path.match(/^\/api\/cases\/(\d+)\/events$/);
  if (evtPost && req.method==='POST') {
    addEvent(parseInt(evtPost[1],10), JSON.parse(await body(req)));
    return jres(res, {ok:true});
  }
  const evtDel = path.match(/^\/api\/cases\/(\d+)\/events\/(\d+)$/);
  if (evtDel && req.method==='DELETE') { deleteEvent(parseInt(evtDel[2],10)); return jres(res,{ok:true}); }

  // Documents
  const docPost = path.match(/^\/api\/cases\/(\d+)\/documents$/);
  if (docPost && req.method==='POST') {
    addDocument(parseInt(docPost[1],10), JSON.parse(await body(req)));
    return jres(res, {ok:true});
  }
  const docToggle = path.match(/^\/api\/cases\/(\d+)\/documents\/(\d+)\/toggle$/);
  if (docToggle && req.method==='POST') { toggleDocument(parseInt(docToggle[2],10)); return jres(res,{ok:true}); }
  const docDel = path.match(/^\/api\/cases\/(\d+)\/documents\/(\d+)$/);
  if (docDel && req.method==='DELETE') { deleteDocument(parseInt(docDel[2],10)); return jres(res,{ok:true}); }

  // ── NSW Registry ──
  if (path==='/api/registry/login' && req.method==='POST') {
    const { username, password } = JSON.parse(await body(req));
    const result = await loginNSWRegistry(username, password);
    return jres(res, result, result.ok ? 200 : result.needs_2fa ? 202 : 401);
  }
  if (path==='/api/registry/2fa' && req.method==='POST') {
    const { code } = JSON.parse(await body(req));
    const result = await submitNSW2FA(code);
    return jres(res, result, result.ok ? 200 : 401);
  }
  if (path==='/api/registry/sync' && req.method==='POST') {
    const keys = gk();
    const partyName = (JSON.parse(await body(req)).partyName || keys.registry_name || '').trim();
    if (!partyName) return jres(res, { ok: false, error: 'No party name — set it in Settings' }, 400);
    // Auto-login if credentials stored
    const { registry_user: u, registry_pass: p } = keys;
    if (u && p) {
      const login = await loginNSWRegistry(u, p);
      if (!login.ok) return jres(res, { ok: false, error: 'Registry login failed: ' + login.error }, 401);
    }
    const result = await scrapeRegistryCases(partyName);
    return jres(res, result);
  }
  if (path==='/api/registry/case' && req.method==='POST') {
    const { url: caseUrl } = JSON.parse(await body(req));
    const result = await scrapeRegistryCaseDetail(caseUrl);
    return jres(res, result);
  }

  // Fallback
  if (!res.writableEnded) { res.writeHead(404); res.end(); }
});

server.listen(PORT, () => {
  const u=`http://localhost:${PORT}`;
  console.log(`I AM THE LAW → ${u}`);
  import('child_process').then(({exec})=>exec(`open -a "Brave Browser" "${u}"`));
});
