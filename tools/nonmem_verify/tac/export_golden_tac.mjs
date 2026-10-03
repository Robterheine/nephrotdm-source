/* Export NONMEM's results as fixtures for `npm test`.  node export_golden_tac.mjs <workdir> */
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const work = process.argv[2] || '/tmp/tac_nonmem_verify', out = resolve(here, '../../../tests');
copyFileSync(`${work}/struct_tac.csv`, `${out}/nonmem_tac_struct.csv`);
copyFileSync(`${work}/struct_tac.tab`, `${out}/nonmem_tac_struct.tab`);
const papp = JSON.parse(readFileSync(`${work}/posthoc_tac_app.json`, 'utf8'));
const tab = readFileSync(`${work}/post_tac.tab`, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
const fx = { note: 'NONMEM 7.6 POSTHOC (FOCE-I, MAXEVAL=0) empirical Bayes estimates for the tacrolimus model at the published parameter values; produced by tools/nonmem_verify/tac/run_tac.sh', patients: papp.map(a => ({ id: a.id, wt: a.wt, rawEx: a.rawEx, doses: a.doses, obs: a.obs, etaNM: tab.find(r => r[0] === a.id).slice(1, 1 + a.eta.length) })) };
writeFileSync(`${out}/nonmem_tac_posthoc.json`, JSON.stringify(fx));
console.log('fixtures written to', out);
