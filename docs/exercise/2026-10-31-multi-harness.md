# Exercise: jstack on Claude Code, Cursor, and Codex

Date: 2026-10-31. Machine: the acme dev box, Claude Code with jstack installed from the repo path, Codex CLI 0.153.4 installed, Cursor not installed.

Goal: one repository installs into all three harnesses. Spec: `docs/superpowers/specs/2026-10-31-jstack-multi-harness-design.md`. Plan: `docs/superpowers/plans/2026-10-31-jstack-multi-harness.md`.

## 0. Format research

| Harness | Manifest read | Marketplace at repo root | Commands | Subagents |
|---|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` | `.claude-plugin/marketplace.json` | `commands/*.md` | `agents/*.md` with `model`, `tools`, `skills` |
| Cursor | `.cursor-plugin/plugin.json` | `.cursor-plugin/marketplace.json` | `commands/*.md` (or skills) | `agents/*.md` with `model`, `readonly`, `is_background` |
| Codex | `.codex-plugin/plugin.json`, root `plugin.json` | `.agents/plugins/marketplace.json`, legacy fallback `.claude-plugin/marketplace.json` | none, skills only | not shipped by plugins; `~/.codex/agents/*.toml` |

Sources: agent-plugins.org specification, Cursor plugins reference and subagents docs, OpenAI Codex plugin build page and `openai/plugins` repository, `cursor/plugin-template`, and pstack's `docs/harness/claude-code.md` plus its `generate-pstack-harness-trees.mjs`, which this design inverts.

## 1. Probe: Codex and the Claude-format root

Before writing any Codex files:

```
codex plugin marketplace add /home/orca/orca/projects/jstack   → marketplaceName jstack, read .claude-plugin/marketplace.json
codex plugin add jstack@jstack                                  → installed 0.1.0 at ~/.codex/plugins/cache/jstack/jstack/0.1.0 (whole checkout, .git included)
codex exec (read-only)                                          → listed jstack:implementation-plan, jstack:jstack-principles, jstack:pr-plan, jstack:repo-profile, jstack:sequence-diagrams, jstack:verification-bundle
```

So Codex reads the Claude manifest and the root `skills/`, prefixes plugin skills with `jstack:`, and lacks only the commands and the agents. Removed the install afterwards.

## 2. Builder check

A fresh reviewer read the spec and returned two questions. The first changed the design: installing Codex agent TOMLs into the target repo's `.codex/agents/` would collide with the root commands (`verify` flags any path outside `docs/jstack/`, `implement` commits leftovers, `plan` adds only `docs/jstack`). Decision: user scope `~/.codex/agents/` by default, `--project` opt-in, and `jstack-init` re-installs when the embedded root path no longer exists. The second asked which marketplace file Codex prefers; adding `.agents/plugins/marketplace.json` made `codex plugin list` switch to it and resolve the source to `harness/codex`.

## 3. Build

- `scripts/lib/harness.mjs`: frontmatter parser, six ordered transforms, Claude-term scan against the adapter, command-to-skill, agent-to-Cursor, agent-to-TOML, manifests, tree render, write, diff.
- `scripts/build-harness.mjs`: writes `harness/` or checks it with `--check`.
- `scripts/harness-assets/install-agents.sh`: copies `agents/*.toml` into `~/.codex/agents/` (or `./.codex/agents/` with `--project`) replacing `<jstack>` with the plugin root, which it also records on the first line of each file.
- `docs/harness/cursor.md`, `docs/harness/codex.md`: adapters with the same six sections.
- 94 generated files: 13 skills per tree (6 shared, 7 command skills), 6 agents per tree, manifests, adapter, guide, README, LICENSE, `scripts/lib/markdown.mjs` so the checkers' relative import resolves.

Tests: 96 pass (`npm test`), including the freshness check. Issues found while building:

- The TOML round-trip test fixture inherited a `skills` list and gained an "Also read" line; fixed the fixture, not the generator.
- The cache-path transform swallowed `<version>` in the guide's new plugin-root note, printing "`<jstack>` in Claude Code". Narrowed the rule to version segments that start with a digit and added the case to the tests.
- `pkill -f 'codex exec --json'` killed the shell that ran it, because the shell's own command line matched. Harmless here, worth remembering.

## 4. Acceptance

**Claude Code.** `claude plugin validate --strict .` passes with the new root directories (`.cursor-plugin/`, `.agents/`, `harness/`).

**Cursor.** `cursor/plugin-template`'s `scripts/validate-template.mjs`, run with the repo root as `cwd`, reads `.cursor-plugin/marketplace.json`, follows `source: ./harness/cursor`, checks the manifest and every skill, agent, and command frontmatter, and prints `Validation passed.` with two warnings, no hooks and no MCP, both expected.

**Codex install.**

```
codex plugin add jstack@jstack   → version 0.1.0, installedPath ~/.codex/plugins/cache/jstack/jstack/0.1.0
codex plugin list                → jstack@jstack installed, enabled, source /home/orca/orca/projects/jstack/harness/codex
cache contents                   → .codex-plugin LICENSE README.md agents docs plugin.json scripts skills   (no .git)
skills                           → implementation-plan jstack-build jstack-help jstack-implement jstack-init jstack-plan jstack-pr-plan jstack-principles jstack-verify pr-plan repo-profile sequence-diagrams verification-bundle
bash .../scripts/install-agents.sh → six files in ~/.codex/agents/, first line "# jstack root: /home/orca/.codex/plugins/cache/jstack/jstack/0.1.0", zero "<jstack>" left
```

**Codex dry run.** Three read-only `codex exec --sandbox read-only --ephemeral` sessions from a scratch git repo, stdin closed (an open stdin makes `codex exec` wait for more input forever; the first attempt hung that way for nine minutes).

Run 1, before the fix below, asked for the jstack skills in context, the exact invocation text, the `<jstack>` resolution, and the `jstack-*` agent types:

```
jstack:implementation-plan | /home/orca/.codex/plugins/cache/jstack/jstack/0.1.0/skills/implementation-plan/SKILL.md
jstack:jstack-principles   | .../skills/jstack-principles/SKILL.md
jstack:pr-plan             | .../skills/pr-plan/SKILL.md
jstack:repo-profile        | .../skills/repo-profile/SKILL.md
jstack:sequence-diagrams   | .../skills/sequence-diagrams/SKILL.md
jstack:verification-bundle | .../skills/verification-bundle/SKILL.md
$jstack-plan docs/req/x.md
<jstack> = /home/orca/.codex/plugins/cache/jstack/jstack/0.1.0
jstack-explorer jstack-implementer jstack-planner jstack-reviewer jstack-splitter jstack-verifier
```

Six skills, not thirteen: the seven command skills were missing. Hypothesis test: moving one `agents/openai.yaml` aside in the cache copy made `jstack:jstack-help` appear in the next listing. So `policy.allow_implicit_invocation: false` removes a skill from the model's list entirely rather than only stopping automatic use. Fix: the Codex `openai.yaml` keeps the interface metadata and drops the policy block (spec decision 5). After regenerating and reinstalling:

```
jstack:implementation-plan  jstack:jstack-build  jstack:jstack-help  jstack:jstack-implement  jstack:jstack-init
jstack:jstack-plan  jstack:jstack-pr-plan  jstack:jstack-principles  jstack:jstack-verify  jstack:pr-plan
jstack:repo-profile  jstack:sequence-diagrams  jstack:verification-bundle
Run `$jstack-init` first.
```

Thirteen skills. Asked to follow `jstack:jstack-help`, Codex gave the right first command but reported no SKILL.md path, so whether it read the file or answered from the listed description is not proven by this run. The pipeline run from Codex (open item below) is the real test of that.

## 5. Result

| Harness | Install path | Commands | Agents | Proof |
|---|---|---|---|---|
| Claude Code | repo root | `/jstack:<cmd>` | native | `claude plugin validate --strict .`, 96 tests, acme-pass exercise |
| Cursor | `harness/cursor` | `/jstack-<cmd>` skills | `agents/*.md`, `readonly` on explorer and reviewer | Cursor template validator, structural only |
| Codex | `harness/codex` | `$jstack-<cmd>` skills (`jstack:jstack-<cmd>` in the list) | `~/.codex/agents/*.toml` via installer | install, cache inventory, dry run |

## 6. Open items

- Cursor is unverified at runtime. First Cursor user: symlink `harness/cursor` into `~/.cursor/plugins/local/jstack`, run `/jstack-help`, then `/jstack-init` on a small repo, and report whether the `jstack-*` subagents appear in the Task tool and whether `<jstack>` resolves with the adapter's `ls` line.
- Codex is verified to load the skills and the agents, not to run the pipeline. Next: `$jstack-init` then `$jstack-plan` on acme-pass from Codex and compare the plan with the Claude Code one.
- Publishing to the Cursor marketplace or the Codex directory needs a logo under `assets/` and a public repository. Both trees are otherwise submission-shaped.
