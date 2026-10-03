/* =========================================================================
 * MPA TDM — test harness
 *
 * Minimal xUnit: assert helpers, a registry of test cases, and a runner.
 * Per repo discipline every new assertion must be able to fail; a test that
 * cannot go red is not a test.
 * ========================================================================= */
'use strict';

var TESTS = [];

function t(name, fn) { TESTS.push({ name: name, fn: fn }); }

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'eq failed') + ' — expected ' + JSON.stringify(expected) +
      ', got ' + JSON.stringify(actual));
  }
}
function near(actual, expected, tol, msg) {
  if (!isFinite(actual) || Math.abs(actual - expected) > tol) {
    throw new Error((msg || 'near failed') + ' — expected ~' + expected +
      ' (±' + tol + '), got ' + actual);
  }
}
function throws(fn, msgSubstr, msg) {
  var threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) throw new Error(msg || 'expected an exception, none was thrown');
  if (msgSubstr && String(threw.message).indexOf(msgSubstr) === -1) {
    throw new Error('exception message mismatch — expected to contain "' +
      msgSubstr + '", got "' + threw.message + '"');
  }
}
function truthy(v, msg) { assert(!!v, msg || 'expected truthy value'); }
function falsy(v, msg) { assert(!v, msg || 'expected falsy value'); }

async function rejects(p, msgSubstr, msg) {
  var threw = null;
  try { await p; } catch (e) { threw = e; }
  if (!threw) throw new Error(msg || 'expected a rejection, none occurred');
  if (msgSubstr && String(threw.message).indexOf(msgSubstr) === -1) {
    throw new Error('rejection message mismatch — expected to contain "' +
      msgSubstr + '", got "' + threw.message + '"');
  }
}

/* A test whose promise never settles (a hung worker, a lost callback) leaves Node with nothing to wait for: it exits with
 * code 0 and prints no summary, which `npm test` would report as success. Fail loudly instead. */
var _running = null, _finished = false;
if (typeof process !== 'undefined' && process.on) {
  process.on('exit', function (code) {
    if (_running && !_finished) {
      console.error('\nTEST RUN DID NOT COMPLETE: "' + _running + '" never settled (the process ran out of work to do).');
      process.exitCode = 1;
    }
  });
}

async function runAll() {
  var failed = 0, ran = 0;
  for (var i = 0; i < TESTS.length; i++) {
    var tc = TESTS[i];
    _running = tc.name;
    ran++;
    try {
      var r = tc.fn();
      if (r && typeof r.then === 'function') await r;
      console.log('  ok  ' + tc.name);
    } catch (e) {
      failed++;
      console.error('  FAIL ' + tc.name + ' — ' + (e && e.message ? e.message : e));
    }
  }
  _finished = true;
  console.log(failed === 0
    ? ran + ' tests passed.'
    : failed + ' of ' + ran + ' tests FAILED.');
  return failed === 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { t: t, assert: assert, eq: eq, near: near, throws: throws, rejects: rejects, truthy: truthy, falsy: falsy, runAll: runAll };
}
