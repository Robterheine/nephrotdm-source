/* Assemble the tables of docs/CALIBRATION_RESULTS_EVR.md from the per-patient JSONL records written by tools/calibrate_evr.mjs
 * (/tmp/calib_evr_<tag>_<cell>-<ht>.jsonl).   node tools/assemble_calibration_evr.mjs [--tag=main] [--out=docs/CALIBRATION_RESULTS_EVR.md]
 * Only the block between <!-- TABLES START --> and <!-- TABLES END --> is replaced; the text around it is written by hand. */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const TAG = arg('tag', 'main'), OUT = resolve(root, arg('out', 'docs/CALIBRATION_RESULTS_EVR.md'));
const DESIGN = { 'ss-trough1': 'steady state · one predose trough', 'ss-profile2': 'steady state · predose + 2 h', 'hist-trough1': '21-day history · one predose trough', 'hist-profile2': '21-day history · predose + 2 h' };
const HT = { normal: 'Ht normal (0.36 ± 0.05)', low: 'Ht low (0.26)', high: 'Ht high (0.46)' };
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pc = x => (100 * x).toFixed(0) + '%';
let md = '', bad = 0, tot = 0, nCells = 0, nFits = 0, nConv = 0, worstRhat = 0, minEss = Infinity;
md += `| cell | n | AUC cov. | trough cov. | AUC corr. cov. | trough corr. cov. | median AUC interval (p95/p5) | median trough interval | median \\|AUC error\\| | converged | s/fit |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const d of Object.keys(DESIGN)) for (const h of Object.keys(HT)) {
  const f = `/tmp/calib_evr_${TAG}_${d}-${h}.jsonl`; if (!existsSync(f)) continue;
  const L = readFileSync(f, 'utf8').split('\n').filter(x => x.trim()).map(JSON.parse), ok = L.filter(r => r.ok), n = ok.length; if (!n) continue;
  const cv = k => ok.filter(r => r.cov[k]).length / n, se = p => 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / n);
  const flag = p => (p >= 0.85 && p <= 0.95) ? '' : (p + se(p) >= 0.85 && p - se(p) <= 0.95 ? '†' : '*');
  const q = ['auc', 'tr', 'aucR', 'trR'].map(k => ({ p: cv(k), f: flag(cv(k)) })); q.forEach(x => { tot++; if (x.f === '*') bad++; });
  nCells++; nFits += n; nConv += ok.filter(r => r.conv).length; ok.forEach(r => { if (r.rhat > worstRhat) worstRhat = r.rhat; if (r.ess < minEss) minEss = r.ess; });
  md += `| ${d} — ${DESIGN[d]}, ${HT[h]} | ${n}${L.length - n ? ' (' + (L.length - n) + ' failed)' : ''} | ${q.map(x => pc(x.p) + x.f).join(' | ')} | ×/÷ ${med(ok.map(r => r.auc[2] / r.auc[0])).toFixed(2)} | ×/÷ ${med(ok.map(r => r.tr[2] / r.tr[0])).toFixed(2)} | ${pc(med(ok.map(r => Math.abs(r.auc[1] / r.truth.auc - 1))))} | ${pc(ok.filter(r => r.conv).length / n)} | ${(med(ok.map(r => r.ms)) / 1000).toFixed(1)} |\n`;
}
md += `\n\`*\` = the 95 % confidence interval of the coverage lies wholly outside 85–95 %; \`†\` = the point estimate is outside the band but its interval overlaps it. Intervals: ±1.96·√(p(1−p)/n), about ±7 points at n = 100.\n`;
md += `\nCells scored: ${nCells}; fits: ${nFits}; coverage figures: ${tot}, of which ${bad} are clearly outside the band. Converged (R̂ < 1.01, ESS ≥ 400): ${nConv}/${nFits}; worst R̂ ${worstRhat.toFixed(4)}; smallest ESS ${Math.round(minEss)}.\n`;
const hdr = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '', START = '<!-- TABLES START -->', END = '<!-- TABLES END -->';
if (hdr.includes(START)) writeFileSync(OUT, hdr.slice(0, hdr.indexOf(START) + START.length) + '\n\n' + md + '\n' + hdr.slice(hdr.indexOf(END)));
else writeFileSync(OUT, md);
console.log(md);
