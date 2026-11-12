#!/usr/bin/env bash
# Counts changed lines between two refs, excluding lockfiles, generated files,
# minified assets, snapshots, and docs/jstack/**.
#
# usage: pr-size.sh <base-ref> <head-ref> [--budget N] [--repo PATH]
#
# Output, first line:  added=<n> deleted=<n> total=<n> budget=<n> status=OK|OVER
# then one line per counted file:  <added><TAB><deleted><TAB><path>
# Exit 0 when OK, 3 when OVER, 2 on a usage or git error.
set -euo pipefail

usage() {
  if [ $# -gt 0 ]; then printf '%s\n' "$*" >&2; fi
  printf 'usage: pr-size.sh <base-ref> <head-ref> [--budget N] [--repo PATH]\n' >&2
  exit 2
}

budget=500
repo=.
positional=()
while [ $# -gt 0 ]; do
  case "$1" in
    --budget)
      [ $# -ge 2 ] || usage "--budget needs a number"
      budget=$2
      shift 2
      ;;
    --budget=*)
      budget=${1#--budget=}
      shift
      ;;
    --repo)
      [ $# -ge 2 ] || usage "--repo needs a path"
      repo=$2
      shift 2
      ;;
    --repo=*)
      repo=${1#--repo=}
      shift
      ;;
    -h|--help)
      usage
      ;;
    -*)
      usage "unknown option $1"
      ;;
    *)
      positional+=("$1")
      shift
      ;;
  esac
done

[ ${#positional[@]} -eq 2 ] || usage
base=${positional[0]}
head=${positional[1]}
[[ $budget =~ ^[0-9]+$ ]] || usage "budget must be a whole number, got \"$budget\""
[ -d "$repo" ] || usage "repo not found: $repo"

if ! numstat=$(git -C "$repo" diff --numstat "$base...$head"); then
  printf 'pr-size.sh: git diff %s...%s failed\n' "$base" "$head" >&2
  exit 2
fi

excluded() {
  case "$1" in
    *.lock|package-lock.json|*/package-lock.json|yarn.lock|*/yarn.lock|pnpm-lock.yaml|*/pnpm-lock.yaml) return 0 ;;
    Gemfile.lock|*/Gemfile.lock|Cargo.lock|*/Cargo.lock|go.sum|*/go.sum|gradle.lockfile|*/gradle.lockfile) return 0 ;;
    *.min.js|*.min.css|*.snap) return 0 ;;
    generated/*|*/generated/*) return 0 ;;
    docs/jstack/*) return 0 ;;
  esac
  return 1
}

added_total=0
deleted_total=0
files=()
while IFS=$'\t' read -r added deleted path; do
  [ -n "${path:-}" ] || continue
  if excluded "$path"; then continue; fi
  [ "$added" = "-" ] && added=0
  [ "$deleted" = "-" ] && deleted=0
  added_total=$((added_total + added))
  deleted_total=$((deleted_total + deleted))
  files+=("$added"$'\t'"$deleted"$'\t'"$path")
done <<< "$numstat"

total=$((added_total + deleted_total))
status=OK
code=0
if [ "$total" -gt "$budget" ]; then
  status=OVER
  code=3
fi

printf 'added=%s deleted=%s total=%s budget=%s status=%s\n' "$added_total" "$deleted_total" "$total" "$budget" "$status"
for line in "${files[@]+"${files[@]}"}"; do
  printf '%s\n' "$line"
done
exit "$code"
