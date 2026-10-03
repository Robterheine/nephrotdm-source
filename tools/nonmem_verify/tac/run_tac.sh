#!/bin/bash
# NONMEM cross-check of the tacrolimus model (structural + POSTHOC).  tools/nonmem_verify/tac/run_tac.sh [workdir]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
W=${1:-/tmp/tac_nonmem_verify}
NMFE=${NMFE:-$HOME/nm76/run/nmfe76}
[ -x "$NMFE" ] || { echo "nmfe not found at $NMFE (set NMFE=...)"; exit 1; }
mkdir -p "$W"
node "$HERE/make_tac.mjs" "$W"
cp "$HERE/struct_tac.mod" "$W/"
cd "$W"
for m in struct_tac posthoc_tac; do
  echo "NONMEM: $m"; "$NMFE" $m.mod $m.lst > $m.out 2>&1
done
[ -f struct_tac.tab ] && [ -f post_tac.tab ] || { echo "no table written — see $W/*.lst"; exit 1; }
node "$HERE/compare_tac.mjs" "$W"
