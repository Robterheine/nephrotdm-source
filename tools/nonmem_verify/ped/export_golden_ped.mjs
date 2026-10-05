/* Export NONMEM's structural results as fixtures for `npm test` (tests/nonmem_ped_*).  node export_golden_ped.mjs <workdir>
 * Keeps the judged subjects only (the informational SS=1 and haematocrit-change tacrolimus subjects are dropped: NONMEM's own SS iteration is inaccurate for fast
 * absorption, see docs/NONMEM_CROSSCHECK_PEDIATRIC.md). Table and data rows stay in record order, one table row per data row. */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const work = process.argv[2] || '/tmp/ped_nonmem_verify', out = resolve(here, '../../../tests');
for (const [drug, short] of [['tacped', 'tac'], ['mpaped', 'mpa']]) {
  const ref = JSON.parse(readFileSync(`${work}/struct_${drug}_ref.json`, 'utf8'));
  const keep = new Set(ref.filter(s => s.scen !== 'ss1' && s.scen !== 'htvar').map(s => s.id));
  const csv = readFileSync(`${work}/struct_${drug}.csv`, 'utf8').split('\n').filter(l => l.trim());
  const tab = readFileSync(`${work}/struct_${drug}.tab`, 'utf8').split('\n').filter(l => l.trim());
  const scen = Object.fromEntries(ref.map(s => [s.id, s.scen]));
  const body = csv.slice(1), tbody = tab.slice(2);
  if (body.length !== tbody.length) throw new Error(`${drug}: ${body.length} data rows but ${tbody.length} table rows`);
  const idOf = l => parseInt(l.split(',')[0], 10);
  const keepIdx = body.map((l, i) => i).filter(i => keep.has(idOf(body[i])));
  writeFileSync(`${out}/nonmem_ped_${short}_struct.csv`, [csv[0]].concat(keepIdx.map(i => body[i])).join('\n') + '\n');
  writeFileSync(`${out}/nonmem_ped_${short}_struct.tab`, tab.slice(0, 2).concat(keepIdx.map(i => tbody[i])).join('\n') + '\n');
  writeFileSync(`${out}/nonmem_ped_${short}_struct.json`, JSON.stringify({ note: 'NONMEM 7.6 structural check, etas as data; scenario of each subject id', scen: Object.fromEntries([...keep].map(id => [id, scen[id]])) }));
  console.log(drug, 'subjects kept', keep.size, 'rows', keepIdx.length);
}
