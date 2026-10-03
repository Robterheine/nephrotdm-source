/* NONMEM cross-check, part B: compare NONMEM's POSTHOC (EBE) with the app's MAP.
 *   node tools/nonmem_verify/compare_posthoc.mjs <workdir>
 * Per subject and per design: eta differences, the app's objective evaluated at BOTH solutions
 * (a flat direction can move eta without moving the objective), IPRED at the samples, and AUC0-12. */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['version', 'model', 'bayes']) require(resolve(here, `../../src/${f}.js`));
const M = globalThis.ECU.model, B = globalThis.ECU.bayes;

const work = process.argv[2] || 'work';
const meta = JSON.parse(readFileSync(`${work}/post_app.json`, 'utf8'));
const TEND = meta.tEnd;

function readTab(f) {
  const lines = readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  const hdr = lines[1].trim().split(/\s+/);
  return lines.slice(2).map(l => { const v = l.trim().split(/\s+/).map(Number); const o = {}; hdr.forEach((h, i) => o[h] = v[i]); return o; });
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const fmt = (x, d = 3) => (Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(1) : x.toFixed(d));

const summary = [];
for (const form of ['mmf', 'ecmps']) {
  const tab = readTab(`${work}/post_${form}.tab`);
  const names = M.etaNamesFor('mpa', form), nEta = names.length;
  const mixPrior = M.mixPriorOf('mpa', form);
  const off = form === 'mmf' ? 0 : 12;
  const rows = [];
  for (const s of meta.subjects[form]) {
    const mine = tab.filter(r => r.ID === s.id);
    const nmEta = []; for (let k = 1; k <= nEta; k++) nmEta.push(mine[0]['ETA' + k]);
    const nmMix = form === 'ecmps' ? mine[0].MEST - 1 : 0;
    const nmObs = mine.filter(r => r.EVID === 0).map(r => r.IPRED);
    const grid = mine.filter(r => r.EVID === 2).sort((a, b) => a.TIME - b.TIME);
    let nmAuc = 0; for (let i = 1; i < grid.length; i++) nmAuc += 0.5 * (grid[i].IPRED + grid[i - 1].IPRED) * (grid[i].TIME - grid[i - 1].TIME);

    // the app's objective, exactly as runFit builds it
    const ofv = B.makeOfv({ wt: 70, drug: 'mpa', form, doses: [], ss: { amt: s.amt, every: 12, tEnd: TEND },
      obs: s.obs.map(o => ({ t: TEND + o.tau, c: o.c })), omega: { vars: M.omegaVars('mpa', form), dims: nEta }, mixPrior, recency: 'off', rtol: 1e-6 });
    const fApp = ofv(s.app.eta, s.app.mix), fNm = ofv(nmEta, nmMix);
    const aucAt = (eta, mix) => M.simulate([], [TEND], M.indivParams(70, null, null, null, eta, 'mpa', form, mix),
      { id: 'mpa', ss: { amt: s.amt, every: 12, tEnd: TEND }, aucWindow: [TEND, TEND + 12] }).auc;
    rows.push({
      id: s.id, design: s.design, dEta: s.app.eta.map((v, k) => Math.abs(v - nmEta[k])), names,
      mixApp: s.app.mix, mixNm: nmMix, dOfv: fNm - fApp, appOfv: fApp,
      dIpred: nmObs.map((v, k) => Math.abs(v - s.app.ipred[k]) / Math.max(v, 1e-9)),
      aucNm: nmAuc, aucApp: aucAt(s.app.eta, s.app.mix), aucAtNm: aucAt(nmEta, nmMix)
    });
  }
  for (const design of [...new Set(rows.map(r => r.design))]) {
    const R = rows.filter(r => r.design === design);
    const maxEta = R.map(r => Math.max(...r.dEta));
    const dOfv = R.map(r => r.dOfv);
    const aucRel = R.map(r => Math.abs(r.aucNm - r.aucApp) / r.aucApp);
    const aucRelExact = R.map(r => Math.abs(r.aucAtNm - r.aucApp) / r.aucApp);
    const ipred = R.flatMap(r => r.dIpred);
    const mixDis = R.filter(r => r.mixApp !== r.mixNm);
    summary.push({ form, design, n: R.length, maxEta, dOfv, aucRel, ipred, mixDis, R });
    console.log(`\n${design}  (n=${R.length})`);
    console.log(`  max |Δη| per subject   median ${fmt(q(maxEta, .5))}  p90 ${fmt(q(maxEta, .9))}  max ${fmt(Math.max(...maxEta))}   | subjects with max|Δη| > 0.05: ${maxEta.filter(v => v > 0.05).length}`);
    console.log(`  app objective at NONMEM's η minus at app's η (>0 = app found the lower objective):  median ${fmt(q(dOfv, .5), 4)}  p90 ${fmt(q(dOfv, .9), 4)}  max ${fmt(Math.max(...dOfv), 4)}  min ${fmt(Math.min(...dOfv), 4)}`);
    console.log(`  IPRED at the samples   max rel diff ${fmt(Math.max(...ipred), 4)}   median ${fmt(q(ipred, .5), 5)}`);
    console.log(`  AUC0-12 (NONMEM trapezoid vs app exact)   median rel diff ${fmt(q(aucRel, .5), 5)}  max ${fmt(Math.max(...aucRel), 4)}   |  app exact at NONMEM η vs at app η: max ${fmt(Math.max(...aucRelExact), 4)}`);
    if (form === 'ecmps') console.log(`  most-probable subgroup: agree ${R.length - mixDis.length}/${R.length}` + (mixDis.length ? `  (disagree: IDs ${mixDis.map(r => r.id).join(', ')})` : ''));
  }
}
