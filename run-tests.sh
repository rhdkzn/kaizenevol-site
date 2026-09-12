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
red=(); green=0; skipped=()

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

# Second preflight, same rule one layer out (added 2026-09-12). The server check above
# was written on 2026-09-11 because 14 tests died at once and every one read as a fresh
# site defect. A fresh container then reproduced it EXACTLY — 25 RED lines, all
# "rc=1 Node.js v22.22.2" — for a reason the server check cannot see: `playwright` was
# not installed. 25 of the 47 tests import it, so 25 of them crashed at the import and
# the runner reported a red suite against a site that was entirely green.
#
# That is the SECOND instance of the failure verification.md bans by name — a check
# that CANNOT RUN returning something that reads as a verdict — so it gets a mechanical
# guard rather than another paragraph. A missing dependency is a SKIP that names itself,
# never a RED that names the site.
needs_browser() { grep -qE "from ['\"]playwright['\"]" "$1"; }
have_playwright=1
node -e "import('playwright')" >/dev/null 2>&1 || have_playwright=0
if [ "$have_playwright" -eq 0 ]; then
  echo "NOTE — playwright is not installed; browser tests will be SKIPPED, not failed."
  echo "  Install:  npm install playwright@1.56.0   (1.56.0 matches this image's chromium 1194)"
fi

for t in test-*.mjs; do
  [ -n "$filter" ] && [[ "$t" != *"$filter"* ]] && continue
  if [ "$have_playwright" -eq 0 ] && needs_browser "$t"; then
    skipped+=("$t")
    printf '  SKIP %-32s needs playwright — not installed (harness, not the site)\n' "$t"
    continue
  fi
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
if [ ${#skipped[@]} -gt 0 ]; then
  echo "$green green, ${#red[@]} red, ${#skipped[@]} SKIPPED (playwright missing — these were NOT run and say nothing about the site)"
else
  echo "$green green, ${#red[@]} red"
fi
[ ${#red[@]} -eq 0 ] || { printf 'red: %s\n' "${red[*]}"; exit 1; }
