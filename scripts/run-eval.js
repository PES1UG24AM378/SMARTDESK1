// Evaluates the routing quality of the search on a HAND-WRITTEN test set (db/eval/eval_set.csv),
// which is separate from the seed tickets. Compares the embedding search with a keyword (full-text) baseline.
//  * thresholds are tuned on one half of the set (even ids) and REPORTED on the other half (odd ids)
//  * writes docs/evaluation_results.md
// Run after `npm run db:reset` and `npm run embed`:   npm run eval
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, getPool } from '../lib/db.js';
import { getEmbedding, provider } from '../lib/embeddings.js';
import { formatVector, findSimilar } from '../lib/similarity.js';
import { decide } from '../lib/decide.js';
import { tokens } from '../lib/hashEmbedding.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1) rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const depts = Object.fromEntries((await query('SELECT dept_id, name FROM departments')).rows.map((d) => [d.name, d.dept_id]));
const triageId = depts['Triage'];
const items = parseCsv(fs.readFileSync(path.join(root, 'db/eval/eval_set.csv'), 'utf8')).map((r) => ({
  id: Number(r.id), text: r.text, trueDept: r.true_dept ? depts[r.true_dept] : null, shouldTriage: r.should_triage === '1',
}));

// ---- retrieve once, then sweep thresholds offline ----
for (const it of items) {
  it.neighbours = await findSimilar({ query }, formatVector(await getEmbedding(it.text)));
  // keyword baseline: OR of the stemmed words, top 5 verified resolved tickets by ts_rank
  const words = [...new Set(tokens(it.text))].filter((w) => /^[a-z0-9]+$/.test(w));
  it.kw = words.length ? (await query(
    `SELECT dept_id FROM tickets WHERE status = 'Resolved' AND resolution_verified
        AND to_tsvector('english', description) @@ to_tsquery('simple', $1)
      ORDER BY ts_rank(to_tsvector('english', description), to_tsquery('simple', $1)) DESC LIMIT 5`, [words.join(' | ')])).rows : [];
}

const outcome = (it, d) => {
  const routed = d.mode !== 'triage';
  const correct = it.shouldTriage ? !routed : routed && d.deptId === it.trueDept;
  return { routed, correct };
};
function score(set, T) {
  let correct = 0, routed = 0, routedCorrect = 0, shouldTri = 0, triCaught = 0, triPicked = 0, suggested = 0;
  for (const it of set) {
    const d = decide(it.neighbours, T); const o = outcome(it, d);
    if (o.correct) correct++;
    if (d.mode === 'suggest') suggested++;
    if (o.routed && !it.shouldTriage) { routed++; if (d.deptId === it.trueDept) routedCorrect++; }
    if (it.shouldTriage) { shouldTri++; if (!o.routed) triCaught++; }
    if (!o.routed) triPicked++;
  }
  const real = set.filter((i) => !i.shouldTriage).length;
  return {
    decisionAcc: correct / set.length, deptAcc: routed ? routedCorrect / routed : 0, coverage: real ? routed / real : 0,
    triageRecall: shouldTri ? triCaught / shouldTri : 0, triagePrecision: triPicked ? triCaught / triPicked : 0, suggestRate: suggested / set.length,
  };
}
function baseline(set) {
  let correct = 0, routed = 0, routedCorrect = 0, shouldTri = 0, triCaught = 0;
  for (const it of set) {
    let d = { mode: 'triage' };
    if (it.kw.length) {
      const votes = new Map(); it.kw.forEach((r) => votes.set(r.dept_id, (votes.get(r.dept_id) || 0) + 1));
      d = { mode: 'route', deptId: [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] };
    }
    const o = outcome(it, d);
    if (o.correct) correct++;
    if (o.routed && !it.shouldTriage) { routed++; if (d.deptId === it.trueDept) routedCorrect++; }
    if (it.shouldTriage) { shouldTri++; if (!o.routed) triCaught++; }
  }
  const real = set.filter((i) => !i.shouldTriage).length;
  return { decisionAcc: correct / set.length, deptAcc: routed ? routedCorrect / routed : 0, coverage: real ? routed / real : 0, triageRecall: shouldTri ? triCaught / shouldTri : 0 };
}

const tune = items.filter((i) => i.id % 2 === 0);
const hold = items.filter((i) => i.id % 2 === 1);
const sweep = [];
for (let high = 0.40; high <= 0.951; high += 0.05) for (let mid = 0.10; mid <= 0.601; mid += 0.05) {
  if (mid >= high) continue;
  const T = { HIGH: +high.toFixed(2), MID: +mid.toFixed(2), SHARE: 0.5, CLUSTER: 0.75 };
  sweep.push({ T, tune: score(tune, T) });
}
sweep.sort((a, b) => b.tune.decisionAcc - a.tune.decisionAcc || b.tune.deptAcc - a.tune.deptAcc);
const best = sweep[0].T;
const pct = (x) => (100 * x).toFixed(1) + '%';

const rTune = score(tune, best), rHold = score(hold, best), rAll = score(items, best);
const bTune = baseline(tune), bHold = baseline(hold), bAll = baseline(items);

const lines = [];
const log = (s = '') => { console.log(s); lines.push(s); };
log(`# Evaluation results`);
log();
log(`- Embedding provider: **${provider()}**${provider() === 'hash' ? ' (offline lexical fallback, NOT the MiniLM model; re-run with EMBEDDING_PROVIDER=minilm for the real figures)' : ''}`);
log(`- Test set: ${items.length} hand-written tickets (${items.filter((i) => !i.shouldTriage).length} real problems, ${items.filter((i) => i.shouldTriage).length} that should go to triage), separate from the seed tickets`);
log(`- Thresholds tuned on the even-numbered half (${tune.length} tickets), reported on the held-out odd-numbered half (${hold.length} tickets)`);
log(`- Chosen thresholds: HIGH (suggest) = ${best.HIGH}, MID (route) = ${best.MID}`);
log(`- Searchable corpus: ${(await query(`SELECT COUNT(*)::int AS n FROM tickets WHERE status='Resolved' AND resolution_verified AND embedding IS NOT NULL`)).rows[0].n} verified resolved tickets`);
log();
log(`| Metric | Embedding search (held-out) | Keyword baseline (held-out) | Embedding search (tuning half) | Embedding search (all) |`);
log(`|---|---|---|---|---|`);
log(`| Decision accuracy | ${pct(rHold.decisionAcc)} | ${pct(bHold.decisionAcc)} | ${pct(rTune.decisionAcc)} | ${pct(rAll.decisionAcc)} |`);
log(`| Department accuracy among routed tickets | ${pct(rHold.deptAcc)} | ${pct(bHold.deptAcc)} | ${pct(rTune.deptAcc)} | ${pct(rAll.deptAcc)} |`);
log(`| Coverage (real problems not sent to triage) | ${pct(rHold.coverage)} | ${pct(bHold.coverage)} | ${pct(rTune.coverage)} | ${pct(rAll.coverage)} |`);
log(`| Triage recall (out-of-scope tickets caught) | ${pct(rHold.triageRecall)} | ${pct(bHold.triageRecall)} | ${pct(rTune.triageRecall)} | ${pct(rAll.triageRecall)} |`);
log(`| Share of tickets answered with a suggested fix | ${pct(rHold.suggestRate)} | n/a | ${pct(rTune.suggestRate)} | ${pct(rAll.suggestRate)} |`);
log();
log(`Decision accuracy counts a ticket as correct when a real problem is routed to the right department, or an out-of-scope ticket is sent to triage.`);
log();
log(`## Threshold sweep (tuning half, top 8 of ${sweep.length})`);
log();
log(`| HIGH | MID | Decision accuracy | Department accuracy | Coverage |`);
log(`|---|---|---|---|---|`);
sweep.slice(0, 8).forEach((s) => log(`| ${s.T.HIGH} | ${s.T.MID} | ${pct(s.tune.decisionAcc)} | ${pct(s.tune.deptAcc)} | ${pct(s.tune.coverage)} |`));
log();
log(`## Mistakes on the held-out half`);
log();
const names = Object.fromEntries(Object.entries(depts).map(([n, id]) => [id, n]));
let wrong = 0;
for (const it of hold) {
  const d = decide(it.neighbours, best); const o = outcome(it, d);
  if (!o.correct) { wrong++; log(`- "${it.text}": expected ${it.shouldTriage ? 'triage' : names[it.trueDept]}, got ${d.mode === 'triage' ? 'triage (' + d.reason + ')' : names[d.deptId] + ' (' + d.mode + ', best similarity ' + it.neighbours[0]?.similarity.toFixed(2) + ')'}`); }
}
if (!wrong) log('- none');
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/evaluation_results.md'), lines.join('\n') + '\n');
console.log('\nSaved docs/evaluation_results.md');
await getPool().end();
