#!/bin/bash
# Renders a 3D preview to a PNG without a phone (Chromium + swiftshader, preinstalled in the cloud container).
# Usage: bash lockin/apercu/apercu.sh <script> <name> [hash]
#   bash lockin/apercu/apercu.sh scripts/real/preview.ts snake snake          (snake at every stage)
#   bash lockin/apercu/apercu.sh scripts/real/preview.ts cat0 cat0:0-19       (species 0..19)
#   bash lockin/apercu/apercu.sh scripts/real/island-preview.ts ile g,n,c     (normal, snow, cloud islands)
#   bash lockin/apercu/apercu.sh scripts/real/decor-houses-preview.ts maisons
# Output: /tmp/lockin-apercu/<name>.png (use a new name each time, image viewers cache files).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
OUT=/tmp/lockin-apercu
mkdir -p $OUT
cp $HERE/index.html $HERE/shot.js $OUT/
cd $REPO && npx esbuild "$1" --bundle --format=iife --outfile=$OUT/real.js --log-level=warning
command -v playwright >/dev/null || npm root -g | xargs -I{} test -d {}/playwright || npm i -g playwright >/dev/null
node $OUT/shot.js $OUT "$2" "$3"
echo "$OUT/$2.png"
