#!/usr/bin/env bash
# jstack rerun script. Filled from skills/verification-bundle/references/rerun-template.sh.
#
# Usage: ./rerun.sh [--with-baseline]
#
# Re-runs the head test suite in a fresh worktree and compares the failed
# count with the "Head: failed=<n>" line recorded in report.md next to this
# script. With --with-baseline it also re-runs the base suite.
# Output goes to artifacts/rerun-<timestamp>/ beside this script.
# Exit 0 on RERUN MATCH, 2 on RERUN MISMATCH.
set -euo pipefail

# Filled values. REPO may be "." to mean the git toplevel of this script.
REPO='.'
BASE_SHA='HEAD~1'
HEAD_SHA='HEAD'
# TEST_CMD runs inside the worktree. It may fail. Its exit code is recorded.
TEST_CMD='echo "3 tests, 0 failed, 0 skipped"'
# SUMMARY_CMD runs inside the worktree with the test log on stdin and in
# $TEST_LOG. It must print one line: passed=<n> failed=<n> skipped=<n>
SUMMARY_CMD='echo "passed=3 failed=0 skipped=0"'
# LIVE_CMDS runs inside the head worktree when not empty. Output goes to live.log.
LIVE_CMDS=''

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BUNDLE_DIR="$SCRIPT_DIR"
REPORT="$SCRIPT_DIR/report.md"
WITH_BASELINE=0
for arg in "$@"; do
  case "$arg" in
    --with-baseline) WITH_BASELINE=1 ;;
    -h|--help)
      sed -n '2,10p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 64
      ;;
  esac
done

if [ "$REPO" = "." ]; then
  REPO="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
fi
if [ ! -f "$REPORT" ]; then
  echo "report.md not found next to rerun.sh: $REPORT" >&2
  exit 1
fi

# Resolved under other names, so a fill that rewrites the two assignments above cannot touch these.
BASE_COMMIT="$(git -C "$REPO" rev-parse --verify "$BASE_SHA^{commit}")"
HEAD_COMMIT="$(git -C "$REPO" rev-parse --verify "$HEAD_SHA^{commit}")"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$SCRIPT_DIR/artifacts/rerun-$STAMP"
mkdir -p "$OUT"
SUMMARY="$OUT/summary.txt"
: > "$SUMMARY"

TMP="$(mktemp -d)"
cleanup() {
  git -C "$REPO" worktree remove --force "$TMP/head" >/dev/null 2>&1 || true
  git -C "$REPO" worktree remove --force "$TMP/base" >/dev/null 2>&1 || true
  git -C "$REPO" worktree prune >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# run_suite <sha> <head|base> <Label>
# Writes test-<name>.log and appends "<Label>: passed= failed= skipped=" to summary.txt.
run_suite() {
  local sha="$1" name="$2" label="$3"
  local dir="$TMP/$name" log="$OUT/test-$name.log" code=0 line
  git -C "$REPO" worktree add --detach "$dir" "$sha" >/dev/null 2>&1
  (cd "$dir" && bash -c "$TEST_CMD") >"$log" 2>&1 || code=$?
  echo "$label exit code: $code" >> "$SUMMARY"
  line="$(cd "$dir" && TEST_LOG="$log" bash -c "$SUMMARY_CMD" < "$log" | grep -E 'passed=[0-9]+ failed=[0-9]+ skipped=[0-9]+' | head -n 1 || true)"
  if [ -z "$line" ]; then
    echo "$label summary: SUMMARY_CMD printed no passed=/failed=/skipped= line" >&2
    line="passed=0 failed=0 skipped=0"
  fi
  echo "$label: $line" >> "$SUMMARY"
}

run_suite "$HEAD_COMMIT" head Head
if [ "$WITH_BASELINE" -eq 1 ]; then
  run_suite "$BASE_COMMIT" base Baseline
fi

if [ -n "$LIVE_CMDS" ]; then
  live_code=0
  (cd "$TMP/head" && bash -c "$LIVE_CMDS") >"$OUT/live.log" 2>&1 || live_code=$?
  echo "Live exit code: $live_code" >> "$SUMMARY"
fi

recorded="$(grep -E '^Head: passed=[0-9]+ failed=[0-9]+ skipped=[0-9]+' "$REPORT" | head -n 1 | sed -E 's/.*failed=([0-9]+).*/\1/' || true)"
actual="$(grep -E '^Head: passed=[0-9]+ failed=[0-9]+ skipped=[0-9]+' "$SUMMARY" | head -n 1 | sed -E 's/.*failed=([0-9]+).*/\1/' || true)"

echo "Rerun output: $OUT"
cat "$SUMMARY"
if [ -z "$recorded" ]; then
  echo "RERUN MISMATCH (report.md has no 'Head: passed= failed= skipped=' line)"
  exit 2
fi
if [ "$recorded" = "$actual" ]; then
  echo "RERUN MATCH (head failed=$actual, recorded failed=$recorded)"
  exit 0
fi
echo "RERUN MISMATCH (head failed=$actual, recorded failed=$recorded)"
exit 2
