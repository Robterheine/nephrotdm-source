/* NONMEM cross-check, part A: compare NONMEM's IPRED with the app's for the same etas.
 *   node tools/nonmem_verify/compare_structural.mjs <workdir> */
import { readFileSync } from 'fs';
const work = process.argv[2] || 'work';
const app = JSON.parse(readFileSync(`${work}/struct_app.json`, 'utf8'));

function readTab(f) {                       // NONMEM table: "TABLE NO. 1", header line, then whitespace-separated numbers
  const lines = readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  return lines.slice(2).map(l => l.trim().split(/\s+/).map(Number));
}
function offsetOf(form) { return form === 'mmf' ? 0 : 12; }     // EC-MPS times in the dataset are 12 h + time after the morning dose

let allOk = true;
for (const form of ['mmf', 'ecmps']) {
  const tab = readTab(`${work}/struct_${form}.tab`);              // ID TIME IPRED
  const byId = new Map();
  tab.forEach(([id, t, ip]) => { if (!byId.has(id)) byId.set(id, []); byId.get(id).push({ t, ip }); });
  let worst = { rel: 0 }, n = 0, sum = 0, worstAbsFloor = 0;
  for (const s of app[form]) {
    const rows = byId.get(s.id);
    const peak = Math.max(...s.ipred);
    s.times.forEach((tau, k) => {
      const row = rows.find(r => Math.abs(r.t - (offsetOf(form) + tau)) < 1e-9);
      if (!row) throw new Error(`no NONMEM row for ID ${s.id} time ${tau}`);
      const a = s.ipred[k], nm = row.ip;
      const rel = Math.abs(a - nm) / Math.max(Math.abs(nm), 1e-3 * peak);     // relative, floored in the tail (as in the ODE cross-check)
      n++; sum += rel;
      if (rel > worst.rel) worst = { rel, id: s.id, tau, app: a, nm, eta: s.eta.map(v => +v.toFixed(2)).join(','), mx: s.mx };
    });
  }
  const ok = worst.rel < 1e-4;
  allOk = allOk && ok;
  console.log(`${form.padEnd(6)} ${app[form].length} subjects × ${app[form][0].times.length} times = ${n} predictions   mean rel diff ${sum / n < 1e-12 ? '<1e-12' : (sum / n).toExponential(2)}   max rel diff ${worst.rel.toExponential(2)}  ${ok ? 'OK' : 'CHECK'}`);
  if (worst.rel >= 1e-9) console.log(`        worst: ID ${worst.id} (mixture ${worst.mx}) t=${worst.tau}h  app ${worst.app}  NONMEM ${worst.nm}  etas [${worst.eta}]`);
}
console.log(allOk ? '\nSTRUCTURAL MODEL: app and NONMEM agree.' : '\nSTRUCTURAL MODEL: DIFFERENCES — investigate.');
process.exit(allOk ? 0 : 1);
