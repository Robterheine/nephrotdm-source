/* Export NONMEM's POSTHOC results as a fixture for `npm test` (tests/nonmem_ped_posthoc.json).  node export_golden_posthoc_ped.mjs <workdir>
 * Each patient: the covariates, the regular 12-hourly history (t0, n, amt, form), the samples and NONMEM's empirical Bayes etas. */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const work = process.argv[2] || '/tmp/ped_nonmem_verify', out = resolve(here, '../../../tests');
const readTab = f => readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
const fx = { note: 'NONMEM 7.6 POSTHOC (FOCE-I, MAXEVAL=0) empirical Bayes estimates for the pediatric models at the published values, proportional error; produced by tools/nonmem_verify/ped/run_ped.sh. Doses are a regular 12-hourly history: t0, n, amt (and form).' };
for (const drug of ['mpaped', 'tacped']) {
  const papp = JSON.parse(readFileSync(`${work}/posthoc_${drug}_app.json`, 'utf8')), post = readTab(`${work}/post_${drug}.tab`);
  fx[drug] = papp.map(a => {
    const d = a.doses, step = d[1].t - d[0].t;
    if (!d.every((x, i) => Math.abs(x.t - (d[0].t + i * step)) < 1e-9 && x.amt === d[0].amt && x.form === d[0].form)) throw new Error('history of patient ' + a.id + ' is not regular');
    const nm = post.find(r => r[0] === a.id), n = 3 + (drug === 'mpaped' ? a.nOcc : 0);
    return { id: a.id, wt: a.wt, rawEx: a.rawEx, hist: { t0: d[0].t, every: step, n: d.length, amt: d[0].amt, form: d[0].form || null }, obs: a.obs.map(o => o.hct != null ? { t: o.t, c: o.c, hct: o.hct } : { t: o.t, c: o.c }), etaNM: nm.slice(1, 1 + n) };
  });
}
writeFileSync(`${out}/nonmem_ped_posthoc.json`, JSON.stringify(fx));
console.log('fixture written:', fx.mpaped.length, 'MPA and', fx.tacped.length, 'tacrolimus patients');
