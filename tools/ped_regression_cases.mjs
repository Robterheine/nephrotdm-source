/* The fixed-seed cases behind tests/mpaped_regression.json and tests/tacped_regression.json (one definition, used by the recorder and the test).
 * Doses are in the engine's own units (mg MMF; ug tacrolimus), as runFit receives them. */
export function pedCases(M) {
  const tEnd = 24 * 20 + 20, ssH = (amt, form) => M.ssHistory({ amt, intervalHours: 12, tEnd, n: 30, route: 'oral', form });
  const hist = (n, f) => { const d = []; for (let k = 0; k < n; k++) d.push(f(k, tEnd - 12 * (n - 1 - k))); return d; };
  return {
    mpaped: {
      ss_trough_peak: { drug: 'mpaped', wt: 38.5, extra: { albumin: '34' }, doses: ssH(600), steadyState: true, obs: [{ t: tEnd, c: 3.1 }, { t: tEnd + 1, c: 14.2 }, { t: tEnd + 2, c: 9.8 }], intervalHours: 12, winLo: 30, winHi: 60, seed: 11, mcmcIters: 160000 },
      hist_two_days: { drug: 'mpaped', wt: 22, extra: { albumin: '28' }, doses: hist(40, (k, t) => ({ t, amt: k < 20 ? 250 : 375, route: 'oral' })), steadyState: false, obs: [{ t: tEnd - 36 + 1, c: 9.5 }, { t: tEnd - 36 + 2, c: 7.4 }, { t: tEnd + 1, c: 11.2 }, { t: tEnd + 12, c: 2.9 }], intervalHours: 12, winLo: 30, winHi: 60, seed: 5, mcmcIters: 160000 },
      population: { drug: 'mpaped', wt: 60, extra: { albumin: '38' }, doses: ssH(1000), steadyState: true, obs: [], intervalHours: 12, winLo: 30, winHi: 60, seed: 3, priorDraws: 3000 }
    },
    tacped: {
      ss_trough_peak: { drug: 'tacped', wt: 25, extra: { hct: '0.30' }, doses: ssH(3000, 'capsule'), steadyState: true, obs: [{ t: tEnd, c: 9.1, hct: 0.30 }, { t: tEnd + 1, c: 17.8, hct: 0.30 }, { t: tEnd + 2, c: 15.2, hct: 0.30 }], intervalHours: 12, winLo: 100, winHi: 250, troughLo: 5, troughHi: 10, seed: 11, mcmcIters: 160000 },
      hist_switch: { drug: 'tacped', wt: 14, extra: { hct: '0.27' }, doses: hist(30, (k, t) => ({ t, amt: 1500, route: 'oral', form: k < 16 ? 'suspension' : 'capsule' })), steadyState: false, obs: [{ t: tEnd, c: 6.4, hct: 0.27 }, { t: tEnd + 2, c: 13.1, hct: 0.29 }], intervalHours: 12, seed: 5, mcmcIters: 160000 },
      population: { drug: 'tacped', wt: 45, extra: { hct: '0.36' }, doses: ssH(5000, 'suspension'), steadyState: true, obs: [], intervalHours: 12, winLo: 100, winHi: 250, seed: 3, priorDraws: 3000 }
    },
    tEnd
  };
}
