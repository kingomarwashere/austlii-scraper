import { getDb, stats } from './db.js';

getDb();
const s = stats();

console.log('\n=== AustLII Database Stats ===\n');
console.log(`Total documents:   ${s.total.toLocaleString()}`);
console.log(`  Case law:        ${s.case_law.toLocaleString()}`);
console.log(`  Legislation:     ${s.legislation.toLocaleString()}`);
console.log(`  With full text:  ${s.with_fulltext.toLocaleString()}`);
console.log('\nBy jurisdiction:');
for (const j of s.by_jurisdiction) {
  const bar = '█'.repeat(Math.ceil(j.n / Math.max(s.total / 40, 1)));
  console.log(`  ${j.jurisdiction.padEnd(8)} ${String(j.n).padStart(7)}  ${bar}`);
}
