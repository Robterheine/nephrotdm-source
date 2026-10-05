/* Driver: runs the cells of tools/calibrate_ped.mjs as separate processes, P at a time (the machine has 8 cores).
 *   node tools/calibrate_ped_run.mjs --drug=mpaped|tacped [--tag=main] [--cells=M01,M02] [--sab=none] [--n=100] [--procs=8] [--iters=N]
 * stdout and stderr of every child go to /tmp/claude-501/calibration_ped/log_<tag>_<drug>_<cell>.txt; a child with a non-zero exit or any stderr is reported. */
import { spawn, execFileSync } from 'child_process';
import { openSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url)), main = resolve(here, 'calibrate_ped.mjs');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const drug = arg('drug', 'mpaped'), tag = arg('tag', 'main'), sab = arg('sab', 'none'), n = arg('n', '100'), P = parseInt(arg('procs', '8'), 10), iters = arg('iters', '');
const all = execFileSync('node', [main, '--drug=' + drug, '--list']).toString().trim().split(/\s+/);
const cells = arg('cells', '') ? arg('cells', '').split(',') : all;
const queue = cells.slice(), t0 = Date.now(); let running = 0, bad = 0;
await new Promise(done => {
  const next = () => {
    if (!queue.length && !running) return done();
    while (running < P && queue.length) {
      const c = queue.shift(), log = `/tmp/claude-501/calibration_ped/log_${tag}_${drug}_${c}.txt`, fd = openSync(log, 'w');
      running++;
      const ch = spawn('node', [main, '--drug=' + drug, '--cell=' + c, '--n=' + n, '--tag=' + tag, '--sab=' + sab].concat(iters ? ['--iters=' + iters] : []), { stdio: ['ignore', fd, fd] });
      ch.on('exit', code => {
        running--; const txt = readFileSync(log, 'utf8'), ok = code === 0 && /^done /m.test(txt) && txt.trim().split('\n').length === 1;
        if (!ok) bad++;
        console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${drug} ${c} ${ok ? 'finished' : 'PROBLEM (exit ' + code + '): see ' + log}`);
        next();
      });
    }
  };
  next();
});
console.log(`all ${cells.length} cells done in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${bad} with problems`);
