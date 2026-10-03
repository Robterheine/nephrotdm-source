/* Compares NONMEM's empirical Bayes estimates with the app's MAP for everolimus M3.  node compare_posthoc_evr.mjs <workdir>
 * Both solutions are evaluated in the APP's own objective (same model, same data): the posterior mode is the lower one; a flat direction
 * (V3 from a trough alone) lets two optimisers stop a little apart without either being wrong. */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version', 'model', 'everolimus', 'bayes'].forEach(f => require(resolve(here, '../../../src/' + f + '.js')));
const { model: M, bayes: B } = globalThis.ECU, T = M.spec('evr').custom;
const work = process.argv[2] || 'work';
const readTab = f => readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
const papp = JSON.parse(readFileSync(`${work}/posthoc_evr_app.json`, 'utf8')), post = readTab(`${work}/post_evr.tab`);
const dif = []; let nSame = 0, nAppLower = 0, maxGapNM = 0, maxGapApp = 0;
papp.forEach(a => {
  const nm = post.find(r => r[0] === a.id); if (!nm) throw new Error('no NONMEM EBE for ' + a.id);
  const prep = T.prepare({ extra: a.rawEx, wt: 70, doses: a.doses.map(d => Object.assign({}, d)), obs: a.obs, steadyState: false });
  const ofv = B.makeOfv({ wt: 70, drug: 'evr', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: T.omega().vars, cov: null, dims: 3 }, extra: prep.extra, form: null });
  const etaNM = nm.slice(1, 4), fApp = ofv(a.eta), fNM = ofv(etaNM);
  const mx = Math.max(...a.eta.map((v, k) => Math.abs(v - etaNM[k])));
  dif.push({ id: a.id, mx, fApp, fNM, nObs: a.obs.length });
  if (mx < 5e-3) nSame++;
  if (fApp <= fNM + 1e-9) nAppLower++;
  maxGapNM = Math.max(maxGapNM, fNM - fApp); maxGapApp = Math.max(maxGapApp, fApp - fNM);
});
dif.sort((x, y) => y.mx - x.mx);
console.log(`B  POSTHOC ${papp.length} patients: max |eta(app) - eta(NONMEM)| median ${dif[Math.floor(dif.length / 2)].mx.toExponential(2)}, worst ${dif[0].mx.toExponential(2)} (ID ${dif[0].id}, ${dif[0].nObs} sample${dif[0].nObs === 1 ? '' : 's'}); ${nSame}/${papp.length} within 5e-3`);
console.log(`   objective of the app's model at each solution: app MAP lower or equal for ${nAppLower}/${papp.length} patients; NONMEM's EBE above the app's by at most ${maxGapNM.toFixed(4)} (-2 log-likelihood units); the app's above NONMEM's by at most ${maxGapApp.toFixed(4)}`);
const ok = maxGapApp < 0.05 && maxGapNM < 0.5;
console.log(`   ${ok ? 'OK' : 'CHECK'}: neither optimiser is materially away from the other's objective`);
console.log(ok ? '\nEVEROLIMUS POSTHOC: app and NONMEM agree.' : '\nEVEROLIMUS POSTHOC: DIFFERENCES, investigate.');
process.exit(ok ? 0 : 1);
