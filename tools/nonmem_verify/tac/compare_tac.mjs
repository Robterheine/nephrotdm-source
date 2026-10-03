/* Compare NONMEM with the app: A structural IPRED, B POSTHOC EBEs vs the app's MAP.  node compare_tac.mjs <workdir> */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version', 'model', 'tacrolimus', 'bayes'].forEach(f => require(resolve(here, '../../../src/' + f + '.js')));
const { model: M, bayes: B } = globalThis.ECU, T = M.spec('tac').custom;
const work = process.argv[2] || 'work';
const readTab = f => readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
let ok = true;
// ---- A
const app = JSON.parse(readFileSync(`${work}/struct_tac_app.json`, 'utf8'));
const tab = readTab(`${work}/struct_tac.tab`), byId = new Map();
tab.forEach(([id, t, ip]) => { if (!byId.has(id)) byId.set(id, []); byId.get(id).push({ t, ip }); });
for (const scen of ['ss', 'hist']) {
  let worst = { rel: 0 }, n = 0, sum = 0;
  for (const s of app.filter(x => x.scen === scen)) {
    const rows = byId.get(s.id), peak = Math.max(...s.ipred);
    s.times.forEach((tau, k) => {
      const row = rows.find(r => Math.abs(r.t - tau) < 1e-9);
      if (!row) throw new Error(`no NONMEM row for ID ${s.id} time ${tau}`);
      const rel = Math.abs(s.ipred[k] - row.ip) / Math.max(Math.abs(row.ip), 1e-3 * peak);
      n++; sum += rel; if (rel > worst.rel) worst = { rel, id: s.id, tau, app: s.ipred[k], nm: row.ip };
    });
  }
  const good = worst.rel < 1e-4; ok = ok && good;
  console.log(`A  ${scen.padEnd(5)} ${app.filter(x => x.scen === scen).length} subjects, ${n} predictions   mean rel diff ${(sum / n).toExponential(2)}   max ${worst.rel.toExponential(2)}  ${good ? 'OK' : 'CHECK'}`);
  if (worst.rel >= 1e-6) console.log(`     worst: ID ${worst.id} t=${worst.tau}  app ${worst.app}  NONMEM ${worst.nm}`);
}
// ---- B: the empirical Bayes estimates. Both solutions are evaluated in the APP's own objective (same model, same data):
//      the posterior mode is the lower one; a flat direction (κ on ka from a trough and two early samples) lets
//      two optimisers stop a little apart without either being wrong.
const papp = JSON.parse(readFileSync(`${work}/posthoc_tac_app.json`, 'utf8'));
const post = readTab(`${work}/post_tac.tab`);
const dif = []; let nSame = 0, nAppLower = 0, maxGapNM = 0, maxGapApp = 0;
papp.forEach(a => {
  const nm = post.find(r => r[0] === a.id); if (!nm) throw new Error('no NONMEM EBE for ' + a.id);
  const doses = a.doses.map(d => Object.assign({}, d));
  const prep = T.prepare({ extra: a.rawEx, wt: a.wt, doses: doses, obs: a.obs, steadyState: false });
  const om = M.omegaFull('tac', null, prep.extra);
  const ofv = B.makeOfv({ wt: a.wt, drug: 'tac', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: om.vars, cov: om.cov, dims: om.vars.length }, extra: prep.extra, form: null });
  const etaNM = nm.slice(1, 1 + a.eta.length);
  const fApp = ofv(a.eta), fNM = ofv(etaNM);
  const d = a.eta.map((v, k) => v - etaNM[k]), mx = Math.max(...d.map(Math.abs));
  dif.push({ id: a.id, mx, fApp, fNM });
  if (mx < 5e-3) nSame++;
  if (fApp <= fNM + 1e-9) nAppLower++;
  maxGapNM = Math.max(maxGapNM, fNM - fApp); maxGapApp = Math.max(maxGapApp, fApp - fNM);
});
dif.sort((x, y) => y.mx - x.mx);
console.log(`B  POSTHOC ${papp.length} patients — max |η(app) − η(NONMEM)|: median ${dif[Math.floor(dif.length / 2)].mx.toExponential(2)}, worst ${dif[0].mx.toExponential(2)} (ID ${dif[0].id}); ${nSame}/${papp.length} within 5e-3`);
console.log(`   objective of the app’s model at each solution: app MAP is lower or equal for ${nAppLower}/${papp.length} patients; NONMEM’s EBE is above the app’s by at most ${maxGapNM.toFixed(3)} (−2 log-likelihood units); the app’s is above NONMEM’s by at most ${maxGapApp.toFixed(3)}`);
const bOk = maxGapApp < 0.05 && maxGapNM < 0.5;
console.log(`   ${bOk ? 'OK' : 'CHECK'}: neither optimiser is materially away from the other's objective (a gap of 0.5 is far below the Monte Carlo noise of the reported probabilities)`);
ok = ok && bOk;
console.log(ok ? '\nTACROLIMUS: app and NONMEM agree.' : '\nTACROLIMUS: DIFFERENCES — investigate.');
process.exit(ok ? 0 : 1);
