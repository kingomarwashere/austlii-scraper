// Complete catalog of AustLII databases — legislation + case law across all Australian jurisdictions
// Feed URL pattern: https://www.austlii.edu.au/cgi-bin/feed.cgi?db=<code>

export const AUSTLII_BASE = 'https://www.austlii.edu.au';

// Delay between requests (ms) — be respectful to AustLII
export const REQUEST_DELAY_MS = 1500;
export const CONCURRENT_FEEDS = 3;

export const FEEDS = [
  // ─── HIGH COURT & FEDERAL ─────────────────────────────────────────────────
  { code: 'au/cases/cth/HCA',   name: 'High Court of Australia',              type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FCAFC', name: 'Federal Court Full Court',             type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FCA',   name: 'Federal Court of Australia',           type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FCCA',  name: 'Federal Circuit Court',                type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FCCM',  name: 'Federal Circuit & Family Court (Div 2)', type: 'case_law',  jurisdiction: 'cth' },
  { code: 'au/cases/cth/FamCA', name: 'Family Court of Australia',            type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FamCAFC', name: 'Family Court Full Court',            type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/AATA',  name: 'Administrative Appeals Tribunal',      type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/ATC',   name: 'Australian Tax Cases',                 type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FICA',  name: 'Federal Industrial Court',             type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FCAS',  name: 'Federal Court (Admiralty)',            type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/NSD',   name: 'Federal Court NSW Registry',           type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/ICCRC', name: 'Immigration & Citizenship Decisions',  type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/MRD',   name: 'Migration Review Decisions',           type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/MRTA',  name: 'Migration Review Tribunal',            type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/RRT',   name: 'Refugee Review Tribunal',              type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/NNTTA', name: 'National Native Title Tribunal',       type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/ACCC',  name: 'ACCC Decisions',                       type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/ASIC',  name: 'ASIC Decisions',                       type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/APSC',  name: 'Australian Public Service Commission', type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/ADFFD', name: 'Defence Force Discipline Tribunal',    type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/ACTSC', name: 'ACT Supreme Court (Federal)',          type: 'case_law',    jurisdiction: 'cth' },

  // ─── FEDERAL LEGISLATION ──────────────────────────────────────────────────
  { code: 'au/legis/cth/consol_act',  name: 'Commonwealth Consolidated Acts',     type: 'legislation', jurisdiction: 'cth' },
  { code: 'au/legis/cth/num_act',     name: 'Commonwealth Numbered Acts',         type: 'legislation', jurisdiction: 'cth' },
  { code: 'au/legis/cth/consol_reg',  name: 'Commonwealth Consolidated Regs',     type: 'legislation', jurisdiction: 'cth' },
  { code: 'au/legis/cth/num_reg',     name: 'Commonwealth Numbered Regs',         type: 'legislation', jurisdiction: 'cth' },
  { code: 'au/legis/cth/bill',        name: 'Commonwealth Bills',                 type: 'legislation', jurisdiction: 'cth' },

  // ─── NEW SOUTH WALES ──────────────────────────────────────────────────────
  { code: 'au/cases/nsw/NSWSC',  name: 'NSW Supreme Court',                    type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCA',  name: 'NSW Court of Appeal',                  type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCCA', name: 'NSW Court of Criminal Appeal',         type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWDC',  name: 'NSW District Court',                   type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWLC',  name: 'NSW Land & Environment Court',         type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWIRComm', name: 'NSW Industrial Relations Commission', type: 'case_law',  jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWMC',  name: 'NSW Local Court',                      type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCATAD', name: 'NSW NCAT Administrative',            type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCATAP', name: 'NSW NCAT Appeal Panel',              type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCATCD', name: 'NSW NCAT Consumer',                  type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCATEQ', name: 'NSW NCAT Equal Opportunity',         type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCATGD', name: 'NSW NCAT Guardianship',              type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/cases/nsw/NSWCATOD', name: 'NSW NCAT Occupational',              type: 'case_law',    jurisdiction: 'nsw' },
  { code: 'au/legis/nsw/consol_act', name: 'NSW Consolidated Acts',            type: 'legislation', jurisdiction: 'nsw' },
  { code: 'au/legis/nsw/num_act',    name: 'NSW Numbered Acts',                type: 'legislation', jurisdiction: 'nsw' },
  { code: 'au/legis/nsw/consol_reg', name: 'NSW Consolidated Regs',            type: 'legislation', jurisdiction: 'nsw' },
  { code: 'au/legis/nsw/num_reg',    name: 'NSW Numbered Regs',                type: 'legislation', jurisdiction: 'nsw' },

  // ─── VICTORIA ─────────────────────────────────────────────────────────────
  { code: 'au/cases/vic/VSC',   name: 'Victorian Supreme Court',               type: 'case_law',    jurisdiction: 'vic' },
  { code: 'au/cases/vic/VSCA',  name: 'Victorian Court of Appeal',             type: 'case_law',    jurisdiction: 'vic' },
  { code: 'au/cases/vic/VCC',   name: 'Victorian County Court',                type: 'case_law',    jurisdiction: 'vic' },
  { code: 'au/cases/vic/VMC',   name: 'Victorian Magistrates Court',           type: 'case_law',    jurisdiction: 'vic' },
  { code: 'au/cases/vic/VCAT',  name: 'Victorian VCAT',                        type: 'case_law',    jurisdiction: 'vic' },
  { code: 'au/cases/vic/VIRComm', name: 'Victorian Industrial Relations Comm', type: 'case_law',    jurisdiction: 'vic' },
  { code: 'au/legis/vic/consol_act', name: 'Victorian Consolidated Acts',      type: 'legislation', jurisdiction: 'vic' },
  { code: 'au/legis/vic/num_act',    name: 'Victorian Numbered Acts',          type: 'legislation', jurisdiction: 'vic' },
  { code: 'au/legis/vic/consol_reg', name: 'Victorian Consolidated Regs',      type: 'legislation', jurisdiction: 'vic' },
  { code: 'au/legis/vic/num_reg',    name: 'Victorian Numbered Regs',          type: 'legislation', jurisdiction: 'vic' },

  // ─── QUEENSLAND ───────────────────────────────────────────────────────────
  { code: 'au/cases/qld/QSC',   name: 'Queensland Supreme Court',              type: 'case_law',    jurisdiction: 'qld' },
  { code: 'au/cases/qld/QCA',   name: 'Queensland Court of Appeal',            type: 'case_law',    jurisdiction: 'qld' },
  { code: 'au/cases/qld/QDC',   name: 'Queensland District Court',             type: 'case_law',    jurisdiction: 'qld' },
  { code: 'au/cases/qld/QMC',   name: 'Queensland Magistrates Court',          type: 'case_law',    jurisdiction: 'qld' },
  { code: 'au/cases/qld/QCAT',  name: 'Queensland QCAT',                       type: 'case_law',    jurisdiction: 'qld' },
  { code: 'au/cases/qld/QIRComm', name: 'Qld Industrial Relations Commission', type: 'case_law',    jurisdiction: 'qld' },
  { code: 'au/legis/qld/consol_act', name: 'Queensland Consolidated Acts',     type: 'legislation', jurisdiction: 'qld' },
  { code: 'au/legis/qld/num_act',    name: 'Queensland Numbered Acts',         type: 'legislation', jurisdiction: 'qld' },
  { code: 'au/legis/qld/consol_reg', name: 'Queensland Consolidated Regs',     type: 'legislation', jurisdiction: 'qld' },
  { code: 'au/legis/qld/num_reg',    name: 'Queensland Numbered Regs',         type: 'legislation', jurisdiction: 'qld' },

  // ─── SOUTH AUSTRALIA ──────────────────────────────────────────────────────
  { code: 'au/cases/sa/SASC',   name: 'SA Supreme Court',                      type: 'case_law',    jurisdiction: 'sa' },
  { code: 'au/cases/sa/SASCFC', name: 'SA Supreme Court Full Court',           type: 'case_law',    jurisdiction: 'sa' },
  { code: 'au/cases/sa/SADC',   name: 'SA District Court',                     type: 'case_law',    jurisdiction: 'sa' },
  { code: 'au/cases/sa/SAMC',   name: 'SA Magistrates Court',                  type: 'case_law',    jurisdiction: 'sa' },
  { code: 'au/cases/sa/SAIRC',  name: 'SA Industrial Relations Court',         type: 'case_law',    jurisdiction: 'sa' },
  { code: 'au/cases/sa/SAET',   name: 'SA Employment Tribunal',                type: 'case_law',    jurisdiction: 'sa' },
  { code: 'au/legis/sa/consol_act', name: 'SA Consolidated Acts',              type: 'legislation', jurisdiction: 'sa' },
  { code: 'au/legis/sa/num_act',    name: 'SA Numbered Acts',                  type: 'legislation', jurisdiction: 'sa' },
  { code: 'au/legis/sa/consol_reg', name: 'SA Consolidated Regs',              type: 'legislation', jurisdiction: 'sa' },

  // ─── WESTERN AUSTRALIA ────────────────────────────────────────────────────
  { code: 'au/cases/wa/WASC',   name: 'WA Supreme Court',                      type: 'case_law',    jurisdiction: 'wa' },
  { code: 'au/cases/wa/WASCA',  name: 'WA Court of Appeal',                    type: 'case_law',    jurisdiction: 'wa' },
  { code: 'au/cases/wa/WADC',   name: 'WA District Court',                     type: 'case_law',    jurisdiction: 'wa' },
  { code: 'au/cases/wa/WAMC',   name: 'WA Magistrates Court',                  type: 'case_law',    jurisdiction: 'wa' },
  { code: 'au/cases/wa/WAIRC',  name: 'WA Industrial Relations Commission',    type: 'case_law',    jurisdiction: 'wa' },
  { code: 'au/cases/wa/WASAT',  name: 'WA State Administrative Tribunal',      type: 'case_law',    jurisdiction: 'wa' },
  { code: 'au/legis/wa/consol_act', name: 'WA Consolidated Acts',              type: 'legislation', jurisdiction: 'wa' },
  { code: 'au/legis/wa/num_act',    name: 'WA Numbered Acts',                  type: 'legislation', jurisdiction: 'wa' },
  { code: 'au/legis/wa/consol_reg', name: 'WA Consolidated Regs',              type: 'legislation', jurisdiction: 'wa' },

  // ─── TASMANIA ─────────────────────────────────────────────────────────────
  { code: 'au/cases/tas/TASSC',  name: 'Tasmanian Supreme Court',              type: 'case_law',    jurisdiction: 'tas' },
  { code: 'au/cases/tas/TASCCA', name: 'Tasmanian Court of Criminal Appeal',   type: 'case_law',    jurisdiction: 'tas' },
  { code: 'au/cases/tas/TASMC',  name: 'Tasmanian Magistrates Court',          type: 'case_law',    jurisdiction: 'tas' },
  { code: 'au/cases/tas/TASCAT', name: 'Tasmanian TASCAT',                     type: 'case_law',    jurisdiction: 'tas' },
  { code: 'au/legis/tas/consol_act', name: 'Tasmanian Consolidated Acts',      type: 'legislation', jurisdiction: 'tas' },
  { code: 'au/legis/tas/num_act',    name: 'Tasmanian Numbered Acts',          type: 'legislation', jurisdiction: 'tas' },
  { code: 'au/legis/tas/consol_reg', name: 'Tasmanian Consolidated Regs',      type: 'legislation', jurisdiction: 'tas' },

  // ─── NORTHERN TERRITORY ───────────────────────────────────────────────────
  { code: 'au/cases/nt/NTSC',   name: 'NT Supreme Court',                      type: 'case_law',    jurisdiction: 'nt' },
  { code: 'au/cases/nt/NTCA',   name: 'NT Court of Appeal',                    type: 'case_law',    jurisdiction: 'nt' },
  { code: 'au/cases/nt/NTMC',   name: 'NT Magistrates Court',                  type: 'case_law',    jurisdiction: 'nt' },
  { code: 'au/legis/nt/consol_act', name: 'NT Consolidated Acts',              type: 'legislation', jurisdiction: 'nt' },
  { code: 'au/legis/nt/num_act',    name: 'NT Numbered Acts',                  type: 'legislation', jurisdiction: 'nt' },
  { code: 'au/legis/nt/consol_reg', name: 'NT Consolidated Regs',              type: 'legislation', jurisdiction: 'nt' },

  // ─── ACT ──────────────────────────────────────────────────────────────────
  { code: 'au/cases/act/ACTSC',  name: 'ACT Supreme Court',                    type: 'case_law',    jurisdiction: 'act' },
  { code: 'au/cases/act/ACTCA',  name: 'ACT Court of Appeal',                  type: 'case_law',    jurisdiction: 'act' },
  { code: 'au/cases/act/ACTMC',  name: 'ACT Magistrates Court',                type: 'case_law',    jurisdiction: 'act' },
  { code: 'au/cases/act/ACAT',   name: 'ACT Civil & Administrative Tribunal',  type: 'case_law',    jurisdiction: 'act' },
  { code: 'au/legis/act/consol_act', name: 'ACT Consolidated Acts',            type: 'legislation', jurisdiction: 'act' },
  { code: 'au/legis/act/num_act',    name: 'ACT Numbered Acts',                type: 'legislation', jurisdiction: 'act' },
  { code: 'au/legis/act/consol_reg', name: 'ACT Consolidated Regs',            type: 'legislation', jurisdiction: 'act' },

  // ─── SPECIALIST FEDERAL TRIBUNALS / BODIES ────────────────────────────────
  { code: 'au/cases/cth/FWC',   name: 'Fair Work Commission',                  type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FWCFB', name: 'Fair Work Commission Full Bench',       type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/FWCA',  name: 'Fair Work Australia',                   type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/AIRC',  name: 'Australian Industrial Relations Commission', type: 'case_law', jurisdiction: 'cth' },
  { code: 'au/cases/cth/IRCommA', name: 'Industrial Relations Commission (historical)', type: 'case_law', jurisdiction: 'cth' },
  { code: 'au/cases/cth/FCSC',  name: 'Federal Court (Small Claims)',          type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/AHRPT', name: 'Human Rights & Equal Opportunity Comm', type: 'case_law',   jurisdiction: 'cth' },
  { code: 'au/cases/cth/ICSID', name: 'ICSID Australian Cases',                type: 'case_law',    jurisdiction: 'cth' },
  { code: 'au/cases/cth/AustLII', name: 'AustLII Miscellaneous',               type: 'case_law',    jurisdiction: 'cth' },
];

// URL pattern confirmed from live AustLII inspection
export function feedUrl(code) {
  return `${AUSTLII_BASE}/cgi-bin/feed/${code}/`;
}

export function caseUrl(code, caseId) {
  return `${AUSTLII_BASE}/cgi-bin/viewdoc/au/cases/${code}/${caseId}.html`;
}
