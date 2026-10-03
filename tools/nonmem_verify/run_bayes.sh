#!/bin/bash
# Bayesian cross-check (part C): the app's REPORTED outcomes against NONMEM's posterior. Slow (~30 min): NONMEM BAYES
# samples every subject 6 500 times. Needs run.sh to have produced <workdir> first.   tools/nonmem_verify/run_bayes.sh <workdir>
set -e
HERE=$(cd "$(dirname "$0")" && pwd); W=${1:?workdir}; NMFE=${NMFE:-$HOME/nm76/run/nmfe76}
mkdir -p "$W/bayes"; cp "$HERE/bayes_mmf.mod" "$W/post_mmf.csv" "$W/bayes/"
( cd "$W/bayes" && "$NMFE" bayes_mmf.mod bayes_mmf.lst > bayes_mmf.out 2>&1 ) &
"$HERE/run_bayes_ec.sh" "$W" &
wait
echo "=== C. MMF: app vs NONMEM BAYES ==="; node "$HERE/compare_bayes.mjs" "$W"
echo "=== C. EC-MPS 3-sample: app vs NONMEM (BAYES per subgroup + exact IMP weights) ==="; node "$HERE/compare_bayes_ec.mjs" "$W"
