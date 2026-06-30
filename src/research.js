/**
 * Legal research engine — bridges AI + corpus for self-represented litigants.
 *
 * Functions:
 *   situationIntake()   - plain English situation → structured research bundle (streaming)
 *   summariseCase()     - case text → 3-sentence plain English summary
 *   buildArgument()     - selected cases + user position → legal argument draft (streaming)
 *   classifyAreaOfLaw() - short text → area of law + relevant jurisdiction rules
 */
import { streamChat, chat } from './ai.js';
import { getDb } from './db.js';

const SYSTEM_LEGAL = `You are an expert Australian legal researcher helping self-represented litigants
understand the law. You must:
- Always use plain English. Avoid jargon where possible; define it when necessary.
- Only cite Australian law (Commonwealth, State and Territory).
- Be accurate — do not invent case citations or legislation. If uncertain, say so.
- Be practical — focus on what the person actually needs to do.
- Never give a definitive prediction of outcome; explain what the law says and how courts have applied it.
- Format responses using Markdown (headings, bullet points, bold key terms).`;

// ── Area of law taxonomy ───────────────────────────────────────────────────────

export const AREAS = [
  { id:'tenancy',    label:'Renting & Tenancy',      icon:'🏠', desc:'Bond disputes, repairs, eviction, rent increases',
    courts:{ nsw:'NSWCAT', vic:'VCAT', qld:'QCAT', sa:'SACAT', wa:'SAT', tas:'TASCAT', act:'ACAT', nt:'NTCAT', cth:'FCA' },
    legislation:{ nsw:'Residential Tenancies Act 2010 (NSW)', vic:'Residential Tenancies Act 1997 (Vic)', qld:'Residential Tenancies and Rooming Accommodation Act 2008 (Qld)', cth:null },
    searches:['residential tenancy bond return','landlord obligations repairs','notice to vacate unlawful'] },
  { id:'employment', label:'Employment & Work',       icon:'💼', desc:'Unfair dismissal, underpayment, bullying, discrimination',
    courts:{ cth:'Fair Work Commission → Federal Circuit Court' },
    legislation:{ cth:'Fair Work Act 2009 (Cth)' },
    searches:['unfair dismissal reinstatement','general protections adverse action','underpayment wage theft','workplace bullying stopbullying'] },
  { id:'family',     label:'Family Law',              icon:'👨‍👩‍👧', desc:'Divorce, property settlement, children, parenting orders',
    courts:{ cth:'Federal Circuit & Family Court (FCFC)' },
    legislation:{ cth:'Family Law Act 1975 (Cth)' },
    searches:['property settlement contributions just equitable','parenting orders best interests child','divorce application'] },
  { id:'consumer',   label:'Consumer & Contracts',    icon:'🛒', desc:'Refunds, misleading conduct, contract disputes, ACL',
    courts:{ nsw:'NSWCAT', vic:'VCAT', qld:'QCAT', cth:'Federal Court (ACCC matters)' },
    legislation:{ cth:'Australian Consumer Law (Schedule 2, Competition and Consumer Act 2010 (Cth))' },
    searches:['misleading deceptive conduct','major failure remedy refund','unconscionable conduct supplier'] },
  { id:'debt',       label:'Debt & Contracts',        icon:'💰', desc:'Debt recovery, breach of contract, loans, guarantees',
    courts:{ nsw:'NSWDC or NSWSC', vic:'VCC or VSC', qld:'QDC or QSC', cth:'Federal Court' },
    legislation:{ cth:'National Credit Code', nsw:'Contracts Review Act 1980 (NSW)' },
    searches:['breach of contract damages','debt recovery judgment','unconscionable contract review'] },
  { id:'injury',     label:'Personal Injury',         icon:'🤕', desc:'Negligence, car accidents, workers comp, public liability',
    courts:{ nsw:'NSWSC or NSWDC', vic:'VSC or VCC', qld:'QSC or QDC', cth:'Federal Court' },
    legislation:{ nsw:'Civil Liability Act 2002 (NSW)', vic:'Wrongs Act 1958 (Vic)', cth:'(varies by type)' },
    searches:['duty of care negligence breach','contributory negligence apportionment','damages personal injury assessment'] },
  { id:'criminal',   label:'Criminal Law',            icon:'⚖️', desc:'Charges, bail, sentencing, appeals, your rights',
    courts:{ nsw:'NSW Local/District/Supreme', vic:'VIC Magistrates/County/Supreme', cth:'Federal Court (Cth offences)' },
    legislation:{ nsw:'Crimes Act 1900 (NSW)', vic:'Crimes Act 1958 (Vic)', cth:'Criminal Code Act 1995 (Cth)' },
    searches:['beyond reasonable doubt burden proof','sentencing mitigating factors','bail application criteria'] },
  { id:'immigration',label:'Immigration & Visa',      icon:'✈️', desc:'Visa refusal, cancellation, deportation, refugee claims',
    courts:{ cth:'Administrative Appeals Tribunal → Federal Circuit Court' },
    legislation:{ cth:'Migration Act 1958 (Cth)' },
    searches:['visa cancellation character ground','refugee complementary protection','skilled visa assessment'] },
  { id:'property',   label:'Property & Land',         icon:'🏡', desc:'Boundary disputes, easements, strata, neighbour disputes',
    courts:{ nsw:'NSWSC (Land & Environment Court)', vic:'VCAT or VSC', cth:'Federal Court' },
    legislation:{ nsw:'Conveyancing Act 1919 (NSW)', vic:'Property Law Act 1958 (Vic)' },
    searches:['adverse possession title','easement right of way','strata levy dispute'] },
  { id:'discrimination',label:'Discrimination',       icon:'🤝', desc:'Workplace, services, education — race, sex, disability',
    courts:{ cth:'Australian Human Rights Commission → Federal Court', nsw:'NSW Civil and Administrative Tribunal' },
    legislation:{ cth:'Sex Discrimination Act 1984 (Cth), Racial Discrimination Act 1975 (Cth), Disability Discrimination Act 1992 (Cth)', nsw:'Anti-Discrimination Act 1977 (NSW)' },
    searches:['direct discrimination comparator','victimisation complaint','reasonable adjustment disability'] },
  { id:'wills',      label:'Wills & Estates',         icon:'📜', desc:'Contesting wills, executor disputes, intestacy, probate',
    courts:{ nsw:'NSW Supreme Court (Equity)', vic:'VSC', qld:'QSC' },
    legislation:{ nsw:'Succession Act 2006 (NSW)', vic:'Administration and Probate Act 1958 (Vic)', cth:null },
    searches:['family provision application eligible person','contesting will testamentary capacity','intestacy distribution'] },
];

export function getArea(id) { return AREAS.find(a => a.id === id) || null; }

// ── Corpus search helper ────────────────────────────────────────────────────────

export function corpusSearch(query, { type, jurisdiction, limit=6 } = {}) {
  const db = getDb();
  try {
    let sql = `SELECT d.id,d.title,d.url,d.pub_date,d.type,d.jurisdiction,d.feed_code,d.summary,
                      snippet(documents_fts,1,'**','**','…',30) AS snippet
               FROM documents_fts f JOIN documents d ON d.id=f.rowid
               WHERE documents_fts MATCH ?`;
    const params = [query];
    if (type)        { sql += ' AND d.type=?';         params.push(type); }
    if (jurisdiction){ sql += ' AND d.jurisdiction=?'; params.push(jurisdiction); }
    sql += ' ORDER BY rank LIMIT ?'; params.push(limit);
    return db.prepare(sql).all(...params);
  } catch { return []; }
}

// ── Situation intake (streaming) ───────────────────────────────────────────────

export async function* situationIntake({ description, jurisdiction, areaId, modelKey }) {
  const area   = getArea(areaId);
  const db     = getDb();

  // Pull relevant cases from corpus first
  const searches = area?.searches || [description.slice(0,60)];
  const cases = [];
  const seen  = new Set();
  for (const q of searches) {
    for (const r of corpusSearch(q, { jurisdiction, limit:4 })) {
      if (!seen.has(r.id)) { seen.add(r.id); cases.push(r); }
    }
  }
  // Also search with user's own words
  for (const r of corpusSearch(description.slice(0,80), { jurisdiction, limit:4 })) {
    if (!seen.has(r.id)) { seen.add(r.id); cases.push(r); }
  }
  const topCases = cases.slice(0, 8);

  const court      = area?.courts?.[jurisdiction] || area?.courts?.cth || 'the relevant court or tribunal';
  const legisNote  = area?.legislation?.[jurisdiction] || area?.legislation?.cth || '';

  const caseContext = topCases.map((c,i) =>
    `[${i+1}] ${c.title}\n    URL: ${c.url}\n    ${c.snippet||c.description||''}`
  ).join('\n\n');

  const prompt = `A self-represented litigant in ${jurisdiction?.toUpperCase()||'Australia'} has the following situation:

"${description}"

${area ? `Area of law: ${area.label}\nKey legislation: ${legisNote}\nRelevant court/tribunal: ${court}` : ''}

Relevant cases and legislation found in our corpus:
${caseContext || '(no specific cases found — reason from general principles)'}

Please provide a structured research bundle in Markdown with these sections:
1. **What area of law applies** — 2-3 sentences identifying the legal framework
2. **Your rights and the law** — what the law actually says about this situation, citing the relevant Act and sections
3. **What courts/tribunals have decided** — summarise how courts have applied this law, referencing the cases above where relevant (cite as: *Title* [year] — no fabricated citations)
4. **What you need to prove** — the legal test, broken into plain-English elements
5. **Practical next steps** — what to do, in order, with time limits if any
6. **Risks and watch-outs** — what could go against you and why

Keep it practical, clear, and honest. Do not predict outcomes.`;

  yield* streamChat(
    [{ role:'user', content: prompt }],
    modelKey,
    SYSTEM_LEGAL
  );

  // Append the case list as structured data at the end (for the UI to parse)
  yield `\n\n<!--CASES:${JSON.stringify(topCases.map(c=>({id:c.id,title:c.title,url:c.url,type:c.type,jurisdiction:c.jurisdiction,feed_code:c.feed_code})))}-->`;
}

// ── Case summary ───────────────────────────────────────────────────────────────

export async function summariseCase(docId, modelKey='claude-sonnet') {
  const db  = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(docId);
  if (!doc) return null;

  const text = doc.full_text || doc.description || '';
  if (!text || text.length < 100) return null;

  const prompt = `Summarise this Australian ${doc.type==='case_law'?'court decision':'legislation'} in plain English for a self-represented litigant.

Title: ${doc.title}
Text (excerpt): ${text.slice(0, 8000)}

Write exactly 3 short paragraphs:
1. What was this case/law about? (1-2 sentences, plain English)
2. What did the court decide, or what does the law require? (2-3 sentences, with the key legal rule)
3. When is this relevant? When would someone want to read this? (1-2 sentences)

No markdown. No headings. Just the 3 paragraphs, separated by blank lines.`;

  const summary = await chat([{ role:'user', content:prompt }], modelKey, SYSTEM_LEGAL);

  // Store in DB
  db.prepare('UPDATE documents SET summary=? WHERE id=?').run(summary.trim(), docId);
  return summary.trim();
}

// ── Argument builder (streaming) ──────────────────────────────────────────────

export async function* buildArgument({ caseIds, userPosition, jurisdiction, areaId, modelKey }) {
  const db    = getDb();
  const area  = getArea(areaId);
  const cases = caseIds.map(id => db.prepare('SELECT * FROM documents WHERE id=?').get(id)).filter(Boolean);

  const caseList = cases.map((c,i) => {
    const excerpt = (c.full_text||c.description||'').slice(0,1500);
    return `[${i+1}] ${c.title}\n${excerpt}`;
  }).join('\n\n---\n\n');

  const prompt = `You are drafting the legal argument section of a court/tribunal submission for a self-represented litigant.

Jurisdiction: ${jurisdiction?.toUpperCase()||'Australia'}
${area ? `Area of law: ${area.label}` : ''}

The party's position: "${userPosition}"

Cases/legislation to incorporate:
${caseList}

Draft a formal legal argument section that:
1. Opens with a clear statement of the legal position
2. States the applicable legal test (with Act and section references if mentioned in the cases)
3. Applies each case to the facts — use the phrase "As in [case name], ..." or "The court in [case name] held that..."
4. Anticipates the main counter-argument and distinguishes it
5. Closes with a submission sentence

Format:
- Use proper legal writing style (formal, third person)
- Use correct citation format: *Title* [year] Court number (e.g. *Smith v Jones* [2023] HCA 12)
- Use bold for key legal terms on first use
- Include section numbers for legislation if available
- Target length: 400-600 words

Do NOT fabricate case citations. Only use the cases provided above.`;

  yield* streamChat([{ role:'user', content:prompt }], modelKey, SYSTEM_LEGAL);
}

// ── Background summariser ─────────────────────────────────────────────────────

export async function runSummariserBatch({ limit=20, modelKey='claude-sonnet' } = {}) {
  const db   = getDb();
  const docs = db.prepare(`
    SELECT id FROM documents
    WHERE summary IS NULL AND full_text IS NOT NULL AND length(full_text) > 200
    LIMIT ?
  `).all(limit);

  console.log(`[summariser] ${docs.length} docs to summarise`);
  let done=0, failed=0;

  for (const { id } of docs) {
    try {
      await summariseCase(id, modelKey);
      done++;
      if (done % 5 === 0) console.log(`[summariser] ${done}/${docs.length} done`);
      await new Promise(r => setTimeout(r, 500)); // rate limit
    } catch(e) {
      failed++;
      console.warn(`[summariser] doc ${id} failed: ${e.message}`);
    }
  }
  return { done, failed };
}
