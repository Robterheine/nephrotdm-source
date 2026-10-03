/* Compare NONMEM (struct_evr.tab) with the app-side closed form and, for scenario C, with exact piecewise propagation.  node compare_evr.js <workdir> */
const fs = require('fs');
const work = process.argv[2] || 'work';
const readTab = f => fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
const { app, cscen, firstC } = JSON.parse(fs.readFileSync(`${work}/struct_evr_app.json`, 'utf8'));
const byId = new Map(); readTab(`${work}/struct_evr.tab`).forEach(([id, t, ip, cp]) => { if (!byId.has(id)) byId.set(id, []); byId.get(id).push({ t, ip: ip * 1000, cp: cp * 1000 }); });
const rel = (a, b, floor) => Math.abs(a - b) / Math.max(Math.abs(b), floor);
let ok = true;
for (const scen of ['ss', 'hist']) {
  let w = { rel: 0 }, wp = 0, n = 0;
  for (const s of app.filter(x => x.scen === scen)) {
    const rows = byId.get(s.id), peak = Math.max(...s.cb);
    s.times.forEach((tau, k) => {
      const row = rows.find(r => Math.abs(r.t - tau) < 1e-9); if (!row) throw new Error(`no NONMEM row for ID ${s.id} t=${tau}`);
      const e = rel(s.cb[k], row.ip, 1e-3 * peak), ep = rel(s.cp[k], row.cp, 1e-3 * Math.max(...s.cp)); n++; wp = Math.max(wp, ep); if (e > w.rel) w = { rel: e, id: s.id, tau, app: s.cb[k], nm: row.ip };
    });
  }
  const good = w.rel < 1e-5; ok = ok && good;
  console.log(`A/B ${scen.padEnd(5)} ${app.filter(x => x.scen === scen).length} subjects, ${n} predictions   whole blood max rel diff ${w.rel.toExponential(2)}   plasma ${wp.toExponential(2)}   ${good ? 'OK' : 'CHECK'}`);
  if (!good) console.log('   worst', JSON.stringify(w));
}
// scenario C: Ht changes between records
const stat = k => { let m = 0, s = 0, n = 0, worst = 0; cscen.forEach((c, i) => { const rows = byId.get(firstC + i), peak = Math.max(...rows.filter(r => r.ip > 0).map(r => r.ip));
  c.times.forEach((t, j) => { const row = rows.find(r => Math.abs(r.t - t) < 1e-9 && r.ip > 0); const e = rel(c[k][j], row.ip, 1e-3 * peak); s += e; n++; m = Math.max(m, e); }); }); return { mean: s / n, max: m }; };
const kS = stat('cbStart'), kE = stat('cbEnd'), kA = stat('cbApprox');
console.log('C   (Ht changes between records) NONMEM vs exact propagation using the Ht of the interval START record: max ' + kS.max.toExponential(2) + ', mean ' + kS.mean.toExponential(2));
console.log('C   NONMEM vs exact propagation using the Ht of the interval END record:   max ' + kE.max.toExponential(2) + ', mean ' + kE.mean.toExponential(2));
console.log('C   NONMEM vs the app approximation (one Ht for the PK = latest sample, own Ht per sample for the blood transform): max ' + (kA.max * 100).toFixed(2) + ' %, mean ' + (kA.mean * 100).toFixed(2) + ' %');
const conv = kS.max < kE.max ? 'start' : 'end'; console.log('    NONMEM convention: the Ht of the record at the ' + conv + ' of the interval applies');
process.exit(ok ? 0 : 1);
