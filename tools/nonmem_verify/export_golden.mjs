/* Export a compact NONMEM reference (tests/nonmem_golden.json) from a completed run.sh work directory, so
 * `npm test` can check the app against NONMEM's own numbers without NONMEM installed.
 *   node tools/nonmem_verify/export_golden.mjs <workdir> */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const work = process.argv[2] || 'work';
function readTab(f) {
  const L = readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  const h = L[1].trim().split(/\s+/);
  return L.slice(2).map(l => { const v = l.trim().split(/\s+/).map(Number); const o = {}; h.forEach((k, i) => o[k] = v[i]); return o; });
}
const sApp = JSON.parse(readFileSync(`${work}/struct_app.json`, 'utf8'));
const pApp = JSON.parse(readFileSync(`${work}/post_app.json`, 'utf8'));
const out = { _comment: 'Reference values computed by NONMEM 7.6.0 (ADVAN4 TRANS4, gfortran) for the de Winter 2008 model; produced by tools/nonmem_verify/. structural: etas given as data, NONMEM IPRED (mg/L) after the last (morning) dose at steady state. posthoc: subjects for which NONMEM POSTHOC (FOCE, all parameters fixed, MAXEVAL=0) and the app land on the same unique solution; obs are simulated concentrations, eta/mix are NONMEM EBEs.', structural: [], posthoc: [] };

// ---- structural: the excursion / extreme subjects plus a few random ones, 7 times each
for (const form of ['mmf', 'ecmps']) {
  const tab = readTab(`${work}/struct_${form}.tab`);
  const off = form === 'mmf' ? 0 : 12, nEta = form === 'mmf' ? 6 : 7;
  const pick = new Set([1, 2 * nEta + 2, 2 * nEta + 3, 2 * nEta + 4, 5, 8, 20, 33, 47, 58]);       // zero; V2 +5, ka -1.4, ka +4; assorted
  for (const s of sApp[form]) {
    if (!pick.has(s.id)) continue;
    const rows = tab.filter(r => r.ID === s.id);
    const idx = [0, 3, 6, 9, 12, 14, s.times.length - 1].filter(i => i < s.times.length);
    out.structural.push({
      form, mix: s.mx - 1, amt: form === 'mmf' ? 739 : 674, eta: s.eta, taus: idx.map(i => s.times[i]),
      nonmem: idx.map(i => rows.find(r => Math.abs(r.TIME - (off + s.times[i])) < 1e-9).IPRED)
    });
  }
}
// ---- posthoc: identical-solution subjects
const want = { 'mmf-lss': 4, 'mmf-trough': 2, 'ec-lss': 3, 'ec-trough': 2 };
for (const form of ['mmf', 'ecmps']) {
  const tab = readTab(`${work}/post_${form}.tab`);
  const nEta = form === 'mmf' ? 6 : 7;
  const left = { ...want };
  for (const s of pApp.subjects[form]) {
    if (!left[s.design]) continue;
    const mine = tab.filter(r => r.ID === s.id);
    const eta = []; for (let k = 1; k <= nEta; k++) eta.push(mine[0]['ETA' + k]);
    const mix = form === 'ecmps' ? mine[0].MEST - 1 : 0;
    const d = Math.max(...s.app.eta.map((v, k) => Math.abs(v - eta[k])));
    if (d > 1e-4 || mix !== s.app.mix) continue;
    out.posthoc.push({ form, design: s.design, amt: s.amt, obs: s.obs, eta, mix });
    left[s.design]--;
  }
}
writeFileSync(resolve(here, '../../tests/nonmem_golden.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`tests/nonmem_golden.json: ${out.structural.length} structural subjects, ${out.posthoc.length} posthoc subjects`);
