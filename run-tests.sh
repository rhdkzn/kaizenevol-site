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
