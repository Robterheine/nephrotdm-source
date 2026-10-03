#!/bin/bash
# EC-MPS Bayesian cross-check with the morning-lag subgroup FIXED per run (unambiguous NONMEM output):
# BAYES gives the within-subgroup eta posterior, IMP (EONLY) gives each subgroup's marginal -2LL, so
# P(m|data) ∝ p_m exp(-OBJ_m/2). Uses the 50 EC-MPS 3-sample subjects (IDs 1-50).  tools/nonmem_verify/run_bayes_ec.sh <workdir>
set -e
HERE=$(cd "$(dirname "$0")" && pwd); W=${1:?workdir}; NMFE=${NMFE:-$HOME/nm76/run/nmfe76}
mkdir -p "$W/fixedm"; cd "$W/fixedm"
for m in 1 2 3; do
  awk -F, -v m=$m 'NR==1{print $0",MX"; next} $1<=50{print $0","m}' "$W/post_ecmps.csv" > post_ecmps_m$m.csv
  for kind in bayes imp; do
    mkdir -p ${kind}_m$m; cp post_ecmps_m$m.csv ${kind}_m$m/
    sed "s/MM/$m/g; s/SEEDMM/$((20260 + m))/" "$HERE/${kind}_ecmps_fixedm.mod.tmpl" | sed "s/SEED=SEED$m/SEED=$((20260 + m))/" > ${kind}_m$m/${kind}_m$m.mod
    ( cd ${kind}_m$m && "$NMFE" ${kind}_m$m.mod ${kind}_m$m.lst > ${kind}_m$m.out 2>&1 ) &
  done
done
wait; echo "fixed-subgroup runs finished"
