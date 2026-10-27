#!/bin/sh
# Runs the logic-layer tests (tests/*.test.js, or the files given) from the repo root: with Node when it is installed
# (22.12+, for ES module detection), otherwise with macOS JavaScriptCore. Exits non-zero when any test fails.
cd "$(dirname "$0")/.." || exit 2
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
if command -v node >/dev/null 2>&1; then
  engine=node
elif [ -x "$JSC" ]; then
  engine=jsc
else
  echo "tests/run.sh: needs node or macOS JavaScriptCore ($JSC)" >&2
  exit 2
fi

run() {
  f=$1; shift
  if [ "$engine" = node ]; then node "$f" "$@"; else "$JSC" -m "$f" -- "$@"; fi
}

[ $# -gt 0 ] && tests="$*" || tests=$(ls tests/*.test.js)
pass=0; fail=0; failed=
for t in $tests; do
  echo "== $t"
  # the purity test compares its file list with what is really in src/sim/
  case $t in */purity.test.js) set -- src/sim/*.js ;; *) set -- ;; esac
  if run "$t" "$@"; then pass=$((pass + 1)); else fail=$((fail + 1)); failed="$failed $t"; fi
done
echo "== $engine: $pass passed, $fail failed${failed:+ ($failed )}"
[ "$fail" -eq 0 ]
