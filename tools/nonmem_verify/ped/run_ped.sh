#!/bin/bash
# NONMEM structural cross-check of the pediatric MPA and tacrolimus models against the independent oracle (ped_oracle.mjs).
#   tools/nonmem_verify/ped/run_ped.sh [workdir]            A. structure (G1): NONMEM vs the independent oracle, seconds
#   POSTHOC=1 tools/nonmem_verify/ped/run_ped.sh [workdir]  also B. MAP vs NONMEM POSTHOC (G2), about a minute
#   BAYES=1  tools/nonmem_verify/ped/run_ped.sh [workdir]   also C. posterior vs NONMEM BAYES (L3), about 15 minutes (NONMEM samples 6 500 times per patient)
# The app engines are held to the same NONMEM results by tests/test_pediatric.js (fixtures tests/nonmem_ped_*, exported by export_golden_*.mjs).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
W=${1:-/tmp/ped_nonmem_verify}
NMFE=${NMFE:-$HOME/nm76/run/nmfe76}
[ -x "$NMFE" ] || { echo "nmfe not found at $NMFE (set NMFE=...)"; exit 1; }
mkdir -p "$W"
node "$HERE/make_ped.mjs" "$W"
cp "$HERE/struct_mpaped.mod" "$HERE/struct_tacped.mod" "$W/"
cd "$W"
for d in mpaped tacped; do
  echo "NONMEM: struct_$d"; "$NMFE" struct_$d.mod struct_$d.lst > struct_$d.out 2>&1 || true
  [ -f struct_$d.tab ] || { echo "no table written; see $W/struct_$d.lst"; exit 1; }
done
node "$HERE/compare_ped.mjs" "$W"

if [ -n "$POSTHOC" ] || [ -n "$BAYES" ]; then
  node "$HERE/make_posthoc_ped.mjs" "$W" 30
fi
if [ -n "$POSTHOC" ]; then
  for d in mpaped tacped; do
    echo "NONMEM: posthoc_$d"; "$NMFE" posthoc_$d.mod posthoc_$d.lst > posthoc_$d.out 2>&1 || true
    [ -f post_$d.tab ] || { echo "no table written; see $W/posthoc_$d.lst"; exit 1; }
  done
  echo; echo "=== B. POSTHOC estimates (G2) ==="; node "$HERE/compare_posthoc_ped.mjs" "$W"
fi
if [ -n "$BAYES" ]; then
  for d in tacped mpaped; do     # one after the other: two NONMEM runs in one directory overwrite each other's work files
    echo "NONMEM: bayes_$d"; "$NMFE" bayes_$d.mod bayes_$d.lst > bayes_$d.out 2>&1 || true
    [ -f bayes_$d.iph ] || { echo "no samples written; see $W/bayes_$d.lst"; exit 1; }
  done
  echo; echo "=== C. posterior vs NONMEM BAYES (L3) ==="; node "$HERE/compare_bayes_ped.mjs" "$W"
fi
