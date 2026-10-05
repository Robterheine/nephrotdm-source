// Compares the NONMEM tables with the oracle predictions (make_ped.mjs). Pass: max relative difference <= 1e-6 (hand-off L1) for the
// steady-state and history sets; the formulation-switch set and the SS=1 set (NONMEM's own SS iteration, see make_ped.mjs) are reported, not judged. node compare_ped.mjs <workdir>
import fs from 'fs';
const work = process.argv[2] || 'work';
const readTab = fn => fs.readFileSync(fn, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
let ok = true;
const rel = (a, b, floor) => Math.abs(a - b) / Math.max(Math.abs(b), floor);
function run(drug, cols) {
  const ref = JSON.parse(fs.readFileSync(`${work}/struct_${drug}_ref.json`, 'utf8'));
  const byId = new Map(); readTab(`${work}/struct_${drug}.tab`).forEach(row => { if (!byId.has(row[0])) byId.set(row[0], []); byId.get(row[0]).push(row); });
  for (const scen of ['ss', 'ss1', 'hist', 'switch', 'htvar']) {
    const subs = ref.filter(s => s.scen === scen); if (!subs.length) continue;
    let w = { e: 0 }, mean = 0, n = 0;
    for (const s of subs) {
      const rows = byId.get(s.id);
      s.times.forEach((t, k) => {
        const row = rows.find(x => Math.abs(x[1] - t) < 1e-9 && (scen === 'ss1' || x[1] > 0)); if (!row) throw new Error(`no NONMEM row ID ${s.id} t=${t}`);
        cols.forEach(([name, idx, key, sc]) => {
          const a = s[key][k], b = row[idx] * sc, e = rel(a, b, 1e-3 * Math.max(...s[key]));
          n++; mean += e; if (e > w.e) w = { e, id: s.id, t, name, oracle: a, nonmem: b };
        });
      });
    }
    const judged = scen !== 'switch' && scen !== 'ss1' && scen !== 'htvar', good = !judged || w.e <= 1e-6; ok = ok && good;
    console.log(`${drug} ${scen.padEnd(6)} ${String(subs.length).padStart(2)} subjects, ${String(n).padStart(4)} predictions  max rel diff ${w.e.toExponential(2)}  mean ${(mean / n).toExponential(2)}  ${judged ? (good ? 'OK' : 'CHECK') : 'informational'}`);
    if (!good || !judged) console.log('   worst', JSON.stringify(w));
    if (scen === 'htvar') console.log('   (the app approximation of a haematocrit that changes between records: PK at the latest sample Ht; mean error ' + (100 * mean / n).toFixed(2) + ' %, max ' + (100 * w.e).toFixed(2) + ' %)');
  }
}
run('mpaped', [['plasma', 2, 'c', 1]]);
run('tacped', [['whole blood', 2, 'cb', 1], ['plasma', 3, 'cp', 1]]);
process.exit(ok ? 0 : 1);
