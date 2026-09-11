#!/usr/bin/env bash
# Runs EVERY test-*.mjs and reports which are red.
#
# It exists because the suite list was hand-maintained in my head, and that has now
# failed three times: test-acq-render sat red for several commits unnoticed, and a
# sweep on 2026-09-11 found SIX tests red on main that nobody was watching. A suite
# nobody can run in one command is a suite nobody runs.
#
#   ./run-tests.sh              every test
#   ./run-tests.sh site         only those matching "site"
#   BASE=https://kaizenevol.com ./run-tests.sh   against production
#
# Exits non-zero if anything is red, so it can gate a push.
set -uo pipefail
cd "$(dirname "$0")"
filter="${1:-}"
red=(); green=0

# Preflight. Most of these tests drive a browser against BASE, and when that is not
# up they die with an uncaught exception — 14 of them at once on 2026-09-11, every
# one reading like a fresh site defect rather than a missing server. That is exactly
# the failure verification.md now bans: a check that cannot run must SAY so, never
# report a verdict. So the runner answers it once, up front, instead of 14 tests
# each answering it wrong.
BASE="${BASE:-http://localhost:8899}"
if ! curl -fsS -o /dev/null --max-time 10 "$BASE/index.html" 2>/dev/null; then
  echo "CANNOT RUN — nothing is serving $BASE"
  echo "  The suite was not run. This is the harness, not the site."
  echo "  Local:  npx --yes http-server -p 8899 -s ."
  echo "  Or:     BASE=https://kaizenevol.com ./run-tests.sh"
  exit 2
fi
echo "serving $BASE"

for t in test-*.mjs; do
  [ -n "$filter" ] && [[ "$t" != *"$filter"* ]] && continue
  out=$(timeout 300 node "$t" 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then
    green=$((green+1))
    printf '  ok   %-32s %s\n' "$t" "$(echo "$out" | tail -1)"
  else
    red+=("$t")
    printf '  RED  %-32s rc=%s  %s\n' "$t" "$rc" "$(echo "$out" | tail -1)"
    echo "$out" | grep -E '^FAIL' | sed 's/^/         /'
  fi
done

echo
echo "$green green, ${#red[@]} red"
[ ${#red[@]} -eq 0 ] || { printf 'red: %s\n' "${red[*]}"; exit 1; }
