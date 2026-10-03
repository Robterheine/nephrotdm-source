/* Export NONMEM's results as fixtures for `npm test`.  node export_golden_evr.mjs <workdir> */
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const work = process.argv[2] || '/tmp/evr_nonmem_verify', out = resolve(here, '../../../tests');
copyFileSync(`${work}/struct_evr.csv`, `${out}/nonmem_evr_struct.csv`);
copyFileSync(`${work}/struct_evr.tab`, `${out}/nonmem_evr_struct.tab`);
const papp = JSON.parse(readFileSync(`${work}/posthoc_evr_app.json`, 'utf8'));
const tab = readFileSync(`${work}/post_evr.tab`, 'utf8').split('\n').filter(l => l.trim()).slice(2).map(l => l.trim().split(/\s+/).map(Number));
const fx = { note: 'NONMEM 7.6 POSTHOC (FOCE-I, MAXEVAL=0) empirical Bayes estimates for everolimus Model 3 at the published parameter values; produced by tools/nonmem_verify/evr/run_evr.sh',
  patients: papp.map(a => ({ id: a.id, rawEx: a.rawEx, doses: a.doses, obs: a.obs, etaNM: tab.find(r => r[0] === a.id).slice(1, 4) })) };
writeFileSync(`${out}/nonmem_evr_posthoc.json`, JSON.stringify(fx));
console.log('fixtures written to', out);
