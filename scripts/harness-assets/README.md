# jstack harness trees

This folder is generated from the Claude Code plugin at the repository root: `commands/`, `agents/`, `skills/`, `docs/harness/`, `docs/guide/`, `scripts/lib/markdown.mjs`, `LICENSE`, and `.claude-plugin/plugin.json`. Do not edit it by hand.

- `cursor/` is a Cursor Plugin. Commands are skills named `jstack-<cmd>`, agents keep their names with `model: inherit` and `readonly` where the role never writes.
- `codex/` is a Codex plugin. Commands are skills named `jstack-<cmd>` with implicit invocation off, agents are Codex custom-agent TOML files installed by `scripts/install-agents.sh`.

Claude Code installs the repository root directly. After editing the root, run `node scripts/build-harness.mjs` and commit the result. `npm test` fails while these trees are stale.
