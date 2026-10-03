/* Assemble docs/CALIBRATION_RESULTS_STORSET.md from the per-patient JSONL records written by
 * tools/calibrate_storset.mjs (/tmp/calib_tac_<tag>_<cell>.jsonl).
 *   node tools/assemble_calibration_storset.mjs [--tag=v120] [--out=docs/CALIBRATION_RESULTS_STORSET.md]
 * The tables are computed here; the interpretation is written by hand around them (see the file's header). */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const TAG = arg('tag', 'v120'), OUT = resolve(root, arg('out', 'docs/CALIBRATION_RESULTS_STORSET.md'));
const CELLS = [
  ['ss-trough1', 'steady state · one predose trough'], ['ss-troughs5', 'steady state · predose troughs on 5 days'], ['ss-profile3', 'steady state · predose + 1 h + 3 h'],
  ['hist-trough1', '21-day history · one predose trough'], ['hist-troughs5', '21-day history · predose troughs on 5 days'], ['hist-profile3', '21-day history · predose + 1 h + 3 h'],
  ['ss-profile3-armA', 'arm A · truth with exact log-normal ω² (ss-profile3)'], ['ss-profile3-armB', 'arm B · truth with ρ(V1,Q) = 0 (ss-profile3)'], ['ss-profile3-armC', 'arm C · 15 % CYP3A5 expressers in truth, fitted as “unknown” (ss-profile3)']
];
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pc = x => (100 * x).toFixed(0) + '%';
let md = '', bad = 0, tot = 0;
const rows = [];
for (const [cell, label] of CELLS) {
  const f = `/tmp/calib_tac_${TAG}_${cell}.jsonl`;
  if (!existsSync(f)) continue;
  const L = readFileSync(f, 'utf8').split('\n').filter(x => x.trim()).map(JSON.parse), ok = L.filter(r => r.ok), n = ok.length;
  if (!n) continue;
  const cv = k => ok.filter(r => r.cov[k]).length / n, se = p => 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / n);
  const flag = p => (p >= 0.85 && p <= 0.95) ? '' : (p + se(p) >= 0.85 && p - se(p) <= 0.95 ? '†' : '*');
  const q = ['auc', 'tr', 'aucR', 'trR'].map(k => ({ p: cv(k), f: flag(cv(k)), se: se(cv(k)) }));
  q.forEach(x => { tot++; if (x.f === '*') bad++; });
  rows.push({ cell, label, n, err: L.length - n, q, w: med(ok.map(r => r.auc[2] / r.auc[0])), wt: med(ok.map(r => r.tr[2] / r.tr[0])), e: med(ok.map(r => Math.abs(r.auc[1] / r.truth.auc - 1))),
    conv: ok.filter(r => r.conv).length / n, sec: med(ok.map(r => r.ms)) / 1000, nOcc: med(ok.map(r => r.nOcc)) });
}
md += `| cell | n | AUC cov. | trough cov. | AUC corr. cov. | trough corr. cov. | median AUC interval (p95/p5) | median trough interval | median \\|AUC error\\| | converged | s/fit |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.cell} — ${r.label} | ${r.n}${r.err ? ' (' + r.err + ' failed)' : ''} | ${r.q.map(x => pc(x.p) + x.f).slice(0, 2).join(' | ')} | ${r.q.map(x => pc(x.p) + x.f).slice(2).join(' | ')} | ×/÷ ${r.w.toFixed(2)} | ×/÷ ${r.wt.toFixed(2)} | ${pc(r.e)} | ${pc(r.conv)} | ${r.sec.toFixed(0)} |\n`;
md += `\n\`*\` = the 95 % confidence interval of the coverage lies wholly outside 85–95 %; \`†\` = the point estimate is outside the band but its interval overlaps it. Intervals: ±1.96·√(p(1−p)/n), ≈ ±7 points at n = 100.\n`;
md += `\nCells scored: ${rows.length}; coverage figures: ${tot}, of which ${bad} are clearly outside the band.\n`;
const body = md;
const hdr = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
const START = '<!-- TABLES START -->', END = '<!-- TABLES END -->';
if (hdr.includes(START)) {
  writeFileSync(OUT, hdr.slice(0, hdr.indexOf(START) + START.length) + '\n\n' + body + '\n' + hdr.slice(hdr.indexOf(END)));
} else {
  writeFileSync(OUT, body);
}
console.log(body);
