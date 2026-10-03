#!/bin/bash
# NONMEM cross-check of the everolimus Model 3 structure.  tools/nonmem_verify/evr/run_evr.sh [workdir]
# Result of record (3 October 2026, NONMEM 7.6): closed form vs NONMEM 4.7e-9 over 584 predictions; see docs/HANDOFF_EVEROLIMUS_M3.md
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
W=${1:-/tmp/evr_nonmem_verify}
NMFE=${NMFE:-$HOME/nm76/run/nmfe76}
[ -x "$NMFE" ] || { echo "nmfe not found at $NMFE (set NMFE=...)"; exit 1; }
mkdir -p "$W"
node "$HERE/make_evr.js" "$W"
cp "$HERE/struct_evr.mod" "$W/"
cd "$W"
echo "NONMEM: struct_evr"; "$NMFE" struct_evr.mod struct_evr.lst > struct_evr.out 2>&1
[ -f struct_evr.tab ] || { echo "no table written; see $W/struct_evr.lst"; exit 1; }
node "$HERE/compare_evr.js" "$W"
# B. POSTHOC: the app's MAP against NONMEM's empirical Bayes estimates
node "$HERE/make_posthoc_evr.mjs" "$W"
cp "$HERE/../evr/model3.ctl" "$W/" 2>/dev/null || true
echo "NONMEM: posthoc_evr"; "$NMFE" posthoc_evr.mod posthoc_evr.lst > posthoc_evr.out 2>&1
[ -f post_evr.tab ] || { echo "no table written; see $W/posthoc_evr.lst"; exit 1; }
node "$HERE/compare_posthoc_evr.mjs" "$W"
