/* =========================================================================
 * NephroTDM: parallel MCMC chains on a pool of Web Workers
 *
 * The chains of a fit are independent tasks with their own seeds (bayes.js runChainTask), so running them at the same time
 * changes the wall-clock time and nothing else: the draws are the same numbers, chain for chain, as when they run one after
 * another. Workers are built from the page's own inlined scripts (the app is a single offline file; no extra file, no network).
 *
 * Falls back to running the chains in this thread, with identical results, when a worker cannot be created (a browser that
 * refuses blob workers on file://, the development page whose scripts are not inlined, one core) or when one fails mid-run.
 *
 * ECU.parallel.use(spawn) lets a test supply another way to start a worker (Node's worker_threads).
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var B = ECU.bayes;

  /* Runs inside the worker (browser: self; Node worker_threads: parentPort). */
  var GLUE = [
    '(function () {',
    '  var isWeb = typeof self !== "undefined" && typeof self.postMessage === "function";',
    '  var port = isWeb ? self : require("worker_threads").parentPort;',
    '  function onMsg(m) {',
    '    var id = m.id, last = -1;',
    '    globalThis.ECU.bayes.runChainTask(m.task, function (f) {',
    '      if (f - last >= 0.02 || f >= 1) { last = f; port.postMessage({ type: "progress", id: id, f: f }); }',
    '    }).then(function (r) { port.postMessage({ type: "done", id: id, result: r }); },',
    '            function (e) { port.postMessage({ type: "error", id: id, message: String(e && e.message || e) }); });',
    '  }',
    '  if (isWeb) self.onmessage = function (e) { onMsg(e.data); }; else port.on("message", onMsg);',
    '})();'
  ].join('\n');

  var SOURCES = ['src/version.js', 'src/model.js', 'src/tacrolimus.js', 'src/everolimus.js', 'src/tacped.js', 'src/mpaped.js', 'src/bayes.js'];

  /* The built page carries each module as an inline <script> that starts with a marker comment (build.mjs). */
  function inlinedSources() {
    if (typeof document === 'undefined') return null;
    var found = {}, scripts = document.getElementsByTagName('script'), i, j;
    for (i = 0; i < scripts.length; i++) {
      var t = scripts[i].textContent || '';
      for (j = 0; j < SOURCES.length; j++) {
        if (t.replace(/^\s+/, '').indexOf('/* ' + SOURCES[j] + ' (inlined) */') === 0) found[SOURCES[j]] = t;
      }
    }
    var out = [];
    for (j = 0; j < SOURCES.length; j++) { if (!found[SOURCES[j]]) return null; out.push(found[SOURCES[j]]); }
    return out;
  }
  function workerSource(sources) { return sources.join('\n;\n') + '\n;\n' + GLUE; }

  var state = { spawn: null, source: null, maxWorkers: null, enabled: true, last: 'in-process', watchdogMs: 10000 };

  function browserSpawn() {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
    var srcs = inlinedSources();
    if (!srcs) return null;
    var url;
    try { url = URL.createObjectURL(new Blob([workerSource(srcs)], { type: 'text/javascript' })); } catch (e) { return null; }
    return {
      start: function () {
        var w = new Worker(url);
        return {
          postMessage: function (m) { w.postMessage(m); },
          onMessage: function (fn) { w.onmessage = function (e) { fn(e.data); }; },
          onError: function (fn) { w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); fn(e); }; },
          terminate: function () { w.terminate(); }
        };
      },
      dispose: function () { try { URL.revokeObjectURL(url); } catch (e) {} }
    };
  }

  function workerCount(nTasks) {
    var cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    var n = state.maxWorkers != null ? state.maxWorkers : Math.max(1, Math.min(8, cores - 1));   // leave a core for the page
    return Math.min(n, nTasks);
  }

  function parallelExecutor(tasks, onProgress) {
    var provider = state.spawn ? state.spawn : (state.enabled ? browserSpawn() : null);
    var n = provider ? workerCount(tasks.length) : 0;
    if (!provider || n < 2) {
      state.last = 'in-process';
      if (provider && provider.dispose) provider.dispose();
      return B.sequentialExecutor(tasks, onProgress);
    }
    return new Promise(function (resolve, reject) {
      var results = new Array(tasks.length), next = 0, finished = 0, dead = false, pool = [], dog = null;
      // a worker the browser accepted but never runs would leave the fit waiting forever: no message from any worker for
      // watchdogMs (progress arrives every ~2 % of a chain, i.e. every fraction of a second) → run the chains in this thread
      function pet() { if (dog) clearTimeout(dog); dog = setTimeout(function () { fallBack(); }, state.watchdogMs); }
      function stopAll() { if (dog) clearTimeout(dog); pool.forEach(function (w) { try { w.terminate(); } catch (e) {} }); pool = []; if (provider.dispose) provider.dispose(); }
      function fallBack() {
        if (dead) return;
        dead = true; stopAll();
        state.last = 'in-process';
        B.sequentialExecutor(tasks, onProgress).then(resolve, reject);   // same seeds → same draws
      }
      function report(id, f) {   // the progress callback may throw (the fit was cancelled): stop the workers and reject
        if (!onProgress) return true;
        try { onProgress(id, f); } catch (e) { dead = true; stopAll(); reject(e); return false; }
        return true;
      }
      function feed(w) {
        if (dead || next >= tasks.length) return;
        var id = next++;
        w.postMessage({ id: id, task: tasks[id] });
      }
      function attach(w) {   // one closure per worker, so a finished worker is handed the next task
        w.onMessage(function (m) {
          if (dead) return;
          pet();
          if (m.type === 'progress') { report(m.id, m.f); }
          else if (m.type === 'done') {
            results[m.id] = m.result;
            if (!report(m.id, 1)) return;
            finished++;
            if (finished === tasks.length) { dead = true; stopAll(); state.last = n + ' workers'; resolve(results); }
            else feed(w);
          } else if (m.type === 'error') fallBack();
        });
        w.onError(fallBack);
        pool.push(w);
      }
      try {
        for (var k = 0; k < n; k++) attach(provider.start());
        pet();
        pool.slice().forEach(feed);
      } catch (e) { fallBack(); }
    });
  }

  ECU.parallel = {
    workerSource: workerSource,
    use: function (spawn, opts) { state.spawn = spawn; state.maxWorkers = opts && opts.workers != null ? opts.workers : null; state.watchdogMs = opts && opts.watchdogMs != null ? opts.watchdogMs : 10000; },
    disable: function () { state.enabled = false; },
    enable: function () { state.enabled = true; },
    status: function () { return state.last; }
  };
  if (B) B.chainExecutor = parallelExecutor;
})(typeof window !== 'undefined' ? window : globalThis);
