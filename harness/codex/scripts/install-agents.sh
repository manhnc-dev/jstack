#!/usr/bin/env bash
# Install the jstack agent definitions as Codex custom agents.
# Codex plugins cannot ship agents, so this copies agents/*.toml from the installed
# jstack plugin into ~/.codex/agents/ (default) or ./.codex/agents/ (--project),
# replacing the <jstack> placeholder with this plugin's absolute root.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
dest="${CODEX_HOME:-$HOME/.codex}/agents"
case "${1:-}" in
  --project) dest="$PWD/.codex/agents" ;;
  "") ;;
  *) echo "usage: install-agents.sh [--project]" >&2; exit 2 ;;
esac

if [ ! -d "$root/agents" ]; then
  echo "no agents/ directory under $root" >&2
  exit 2
fi

mkdir -p "$dest"
for f in "$root"/agents/*.toml; do
  out="$dest/$(basename "$f")"
  sed "s|<jstack>|$root|g" "$f" > "$out"
  echo "wrote $out"
done
echo "jstack agents installed from $root. Start a new Codex session to load them."
