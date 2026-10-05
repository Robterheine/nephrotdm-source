/* Compares NONMEM's empirical Bayes estimates with the app's MAP for the pediatric models (gate G2).  node compare_posthoc_ped.mjs <workdir>
 * Reported (hand-off L2): median and worst max|eta(app) - eta(NONMEM)|; the reported steady-state AUC computed from each eta vector (relative difference);
 * and both solutions evaluated in the APP's objective (same model, same data; the posterior mode is the lower one, and a flat direction lets two
 * optimisers stop a little apart without either being wrong). Pass: median max|d eta| <= 1e-3 and AUC within 0.5 % for every patient; where the etas
 * differ by more, the objective decides (neither optimiser may sit materially above the other's objective). */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version', 'model', 'tacped', 'mpaped', 'bayes'].forEach(f => require(resolve(here, '../../../src/' + f + '.js')));
const { model: M, bayes: B } = globalThis.ECU;
const work = process.argv[2] || 'work';
const readTab = f => readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
const grid12 = []; for (let i = 0; i <= 48; i++) grid12.push(i * 0.25);
let allOk = true;

function run(drug, nEta) {
  const T = M.spec(drug).custom, papp = JSON.parse(readFileSync(`${work}/posthoc_${drug}_app.json`, 'utf8')), post = readTab(`${work}/post_${drug}.tab`);
  const rows = []; let worstAuc = 0, maxGapNM = 0, maxGapApp = 0, nSame = 0, nAppLower = 0;
  papp.forEach(a => {
    const nm = post.find(r => r[0] === a.id); if (!nm) throw new Error('no NONMEM EBE for ' + a.id);
    const prep = T.prepare({ extra: a.rawEx, wt: a.wt, doses: a.doses.map(d => Object.assign({}, d)), obs: a.obs, steadyState: false });
    const om = T.omega(prep.extra), n = om.vars.length;
    const ofv = B.makeOfv({ wt: a.wt, drug, doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: om.vars, cov: drug === 'mpaped' ? om.cov : null, dims: n }, extra: prep.extra, form: null });
    const etaNM = nm.slice(1, 1 + n), fApp = ofv(a.eta), fNM = ofv(etaNM);
    const mx = Math.max(...a.eta.map((v, k) => Math.abs(v - etaNM[k])));
    // the reported quantity: steady-state AUC of the regimen on a typical day, from each eta vector
    const last = a.doses[a.doses.length - 1], ctx = { wt: a.wt, extra: prep.extra, ss: { amt: last.amt, every: 12, tEnd: last.t, form: last.form }, grid: grid12.map(x => x + last.t), hctAct: prep.hctReport, hctRef: T.constants.HCT_REF };
    const aucOf = e => T.exposure([e.slice(0, 3)], ctx);
    const A1 = aucOf(a.eta), A2 = aucOf(etaNM);
    const rA = Math.max(Math.abs(A1.aucA[0] / A2.aucA[0] - 1), A1.aucR ? Math.abs(A1.aucR[0] / A2.aucR[0] - 1) : 0);
    worstAuc = Math.max(worstAuc, rA);
    rows.push({ id: a.id, mx, rA, fApp, fNM, nObs: a.obs.length, n });
    if (mx < 1e-3) nSame++;
    if (fApp <= fNM + 1e-9) nAppLower++;
    maxGapNM = Math.max(maxGapNM, fNM - fApp); maxGapApp = Math.max(maxGapApp, fApp - fNM);
  });
  const sorted = rows.slice().sort((x, y) => x.mx - y.mx), med = sorted[Math.floor(sorted.length / 2)].mx, worst = sorted[sorted.length - 1];
  console.log(`${drug}  ${papp.length} patients: max |d eta| median ${med.toExponential(2)}, worst ${worst.mx.toExponential(2)} (ID ${worst.id}, ${worst.nObs} sample${worst.nObs === 1 ? '' : 's'}, ${worst.n} etas); ${nSame}/${papp.length} within 1e-3`);
  console.log(`      reported steady-state AUC from the two eta vectors: worst relative difference ${(worstAuc * 100).toExponential(2)} %`);
  console.log(`      objective of the app's model: app MAP lower or equal for ${nAppLower}/${papp.length}; NONMEM's EBE above the app's by at most ${maxGapNM.toFixed(5)}; the app's above NONMEM's by at most ${maxGapApp.toFixed(5)} (-2 log-likelihood units)`);
  const okEta = med <= 1e-3, okAuc = worstAuc <= 0.005, okObj = maxGapApp < 0.05 && maxGapNM < 0.5;
  console.log(`      ${okEta ? 'OK  ' : 'CHECK'} median eta difference <= 1e-3;  ${okAuc ? 'OK  ' : 'CHECK'} AUC within 0.5 % for every patient;  ${okObj ? 'OK  ' : 'CHECK'} neither optimiser materially off the other's objective`);
  if (!(okEta && okAuc && okObj)) allOk = false;
  return rows;
}
run('mpaped'); run('tacped');
console.log(allOk ? '\nPEDIATRIC POSTHOC: app and NONMEM agree.' : '\nPEDIATRIC POSTHOC: DIFFERENCES, investigate.');
process.exit(allOk ? 0 : 1);
