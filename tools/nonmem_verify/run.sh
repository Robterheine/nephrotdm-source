#!/bin/bash
# NONMEM cross-check of the MPA TDM app (structural model + POSTHOC estimates).
#   tools/nonmem_verify/run.sh [workdir]        NMFE=/path/to/nmfe76 overrides the default
# Needs a working NONMEM (nmfe) and node. Writes everything under <workdir>, not into the repo.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
W=${1:-/tmp/mpa_nonmem_verify}
NMFE=${NMFE:-$HOME/nm76/run/nmfe76}
[ -x "$NMFE" ] || { echo "nmfe not found at $NMFE (set NMFE=...)"; exit 1; }
mkdir -p "$W"
node "$HERE/make_structural.mjs" "$W"
node "$HERE/make_posthoc.mjs" "$W" 50
cp "$HERE"/*.mod "$W"/
cd "$W"
for m in struct_mmf struct_ecmps posthoc_mmf posthoc_ecmps; do
  echo "NONMEM: $m"; "$NMFE" $m.mod $m.lst > $m.out 2>&1
  tab=${m/posthoc_/post_}.tab                       # posthoc_mmf -> post_mmf.tab; struct_* keep their name
  [ -f "$tab" ] || { echo "  no table written — see $W/$m.lst"; exit 1; }
done
echo; echo "=== A. structural model ==="; node "$HERE/compare_structural.mjs" "$W"
echo; echo "=== B. POSTHOC estimates ==="; node "$HERE/compare_posthoc.mjs" "$W"
echo; echo "=== B. why they differ ==="; node "$HERE/classify_posthoc.mjs" "$W"
