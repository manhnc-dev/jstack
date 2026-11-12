# jstack multi-harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One jstack repository installs into Claude Code (root, unchanged), Cursor (`harness/cursor`), and Codex (`harness/codex`), with the two trees generated from the root and kept fresh by a test.

**Architecture:** A dependency-free Node 20 ESM generator, `scripts/build-harness.mjs`, reads `commands/`, `agents/`, `skills/`, `docs/harness/`, and `.claude-plugin/plugin.json`, applies a fixed transform table, and writes both trees. Commands become `jstack-<cmd>` skills; agents become Cursor markdown with `readonly` or Codex TOML plus an install script. A term scan refuses any Claude-only name the harness adapter does not map. `--check` renders to a temp dir and diffs against the committed trees.

**Tech Stack:** Node 20 built-ins (`node:fs`, `node:path`, `node:test`, `node:os`), bash for `install-agents.sh`, JSON manifests.

**Spec:** `docs/superpowers/specs/2026-10-31-jstack-multi-harness-design.md`

## Global Constraints

- No npm dependencies. Node 20 built-ins only.
- Generated trees are written from scratch on every run (delete, then write) so removed source files disappear.
- Skill folder name equals its frontmatter `name` in every tree (Agent Skills rule).
- Command skills are named `jstack-<cmd>`; shared skills keep their names.
- Every agent in the Cursor tree has `model: inherit`; `readonly: true` only when the source `tools` list lacks `Write` and `Edit`.
- `<jstack>` is the only placeholder for the plugin root in generated text.
- Version, description, author, homepage, repository, license, keywords in every manifest come from `.claude-plugin/plugin.json`.

## Review Focus

1. A source file that mentions a Claude-only term the adapter does not cover must fail the build, not ship. Test: a temp source tree with `TodoWrite` in a command and an adapter without that word makes `build()` throw naming the file and the term.
2. A stale committed tree must fail `npm test`. Test: render to a temp dir, change one byte in a copy, run the check function, expect the differing path listed.
3. `argument-hint` quoting. Source hints are YAML double-quoted strings with inner `\"`. The usage line must show the unescaped text. Test: `"<PR-n> [--fix \"<finding>\"]"` renders as `Usage: /jstack-implement <PR-n> [--fix "<finding>"]`.
4. TOML escaping. An agent body containing `'''` or a backslash must still produce valid TOML. Test: a body with `'''` is written with a `"""` basic string and escaped, and a round-trip parse (a tiny TOML multi-line string reader in the test) recovers the body.
5. Executable bit. `install-agents.sh` and copied `pr-size.sh` must stay executable in both trees. Test: mode & 0o111 is non-zero after render.

---

### Task 1: Generator library with transforms

**Files:**
- Create: `scripts/lib/harness.mjs`
- Test: `scripts/lib/harness.test.mjs`

**Interfaces:**
- Produces: `readSource(root) -> {manifest, commands:[{name, description, argumentHint, body}], agents:[{name, description, model, tools, skills, body}], skills:[{name, files:[{rel, bytes, executable}]}], adapters:{cursor, codex}, guide}`; `transformText(text, harness) -> string` applying the five spec transforms with `harness` in `{cursor, codex}`; `scanTerms(text, adapterText, allowClaudeCode=false) -> string[]` returning unmapped terms; `commandToSkill(cmd, harness) -> {dir, files}`; `agentToCursor(agent) -> string`; `agentToToml(agent) -> string`; `renderTree(source, harness) -> Map<rel, {bytes, executable}>`.

- [ ] **Step 1: Write the failing tests** in `scripts/lib/harness.test.mjs` for: `transformText` (all five rules, both harnesses), `scanTerms` (returns `['TodoWrite']` when unmapped, `[]` when the adapter contains it, ignores `Claude Code` when `allowClaudeCode`), `commandToSkill` (name, description, usage line unescaped, `Arguments:` line rewritten, Cursor frontmatter has `disable-model-invocation: true`, Codex gets `agents/openai.yaml` with `allow_implicit_invocation: false`), `agentToCursor` (explorer readonly true, verifier absent, `model: inherit`, no `tools:`/`skills:`, read-first paragraph lists skills not already named), `agentToToml` (keys `name`, `description`, `developer_instructions`; `'''` body round-trips).
- [ ] **Step 2: Run `node --test scripts/lib/harness.test.mjs`**, expect failures for missing module.
- [ ] **Step 3: Implement `scripts/lib/harness.mjs`** with the interfaces above. Frontmatter parsing: reuse the simple `key: value` and `- item` list parser (write `parseFrontmatter(text) -> {data, body}` in the same file). YAML double-quoted `argument-hint` is unescaped with `JSON.parse` when it starts with `"`.
- [ ] **Step 4: Run the tests**, expect PASS.
- [ ] **Step 5: Commit** `feat(harness): generator library with cursor and codex transforms`.

### Task 2: Tree rendering, manifests, install script, CLI

**Files:**
- Create: `scripts/build-harness.mjs` (CLI: no args writes trees; `--check` diffs; `--out <dir>` for tests)
- Create: `scripts/harness-assets/install-agents.sh` (copied into the Codex tree as `scripts/install-agents.sh`)
- Create: `scripts/harness-assets/README.md` (becomes `harness/README.md`)
- Modify: `scripts/lib/harness.mjs` (`renderTree`, `writeTree`, `diffTree`)
- Test: `scripts/lib/harness.test.mjs` (extend), `scripts/build-harness.test.mjs`

**Interfaces:**
- Produces: `renderTree(source, 'cursor')` contains `.cursor-plugin/plugin.json`, `skills/jstack-<cmd>/SKILL.md` for the seven commands, `skills/<shared>/**`, `scripts/lib/markdown.mjs`, `agents/jstack-<role>.md`, `docs/harness/cursor.md`, `README.md`, `LICENSE`. `renderTree(source, 'codex')` contains `.codex-plugin/plugin.json`, `plugin.json`, `skills/jstack-<cmd>/SKILL.md` + `agents/openai.yaml`, `skills/<shared>/**`, `agents/jstack-<role>.toml`, `scripts/install-agents.sh` (executable), `docs/harness/codex.md`, `README.md`, `LICENSE`. `diffTree(rendered, dir) -> string[]` of relative paths that differ, are missing, or are extra.
- `install-agents.sh [--project]`: resolves `<jstack>` as the script's grandparent directory, copies `agents/*.toml` to `~/.codex/agents/` (or `./.codex/agents/` with `--project`) replacing `<jstack>`, prints one line per file, exits 0; exits 2 when `agents/` is missing.

- [ ] **Step 1: Write failing tests**: `renderTree` path inventory for both harnesses against the real root; `.cursor-plugin/plugin.json` fields equal root manifest fields plus `skills`, `agents`, `category`; Codex `plugin.json` has `$schema` and `extensions['com.openai'].interface.displayName === 'jstack'`; `scripts/install-agents.sh` executable; `pr-size.sh` executable in both trees; no generated markdown has unmapped terms (`scanTerms` over the tree is empty); `diffTree` reports a changed file; CLI `--check` exits 1 on a stale copy and 0 on a fresh one (spawn `node scripts/build-harness.mjs --check --out <tmp>` with `execFileSync`).
- [ ] **Step 2: Run tests**, expect failures.
- [ ] **Step 3: Implement** rendering, the CLI, the install script, and the harness README text.
- [ ] **Step 4: Run tests**, expect PASS. Run `bash -n scripts/harness-assets/install-agents.sh`.
- [ ] **Step 5: Commit** `feat(harness): render cursor and codex trees, freshness check, agent installer`.

### Task 3: Generate, wire npm, commit the trees

**Files:**
- Modify: `package.json` (`build:harness`, `test` runs `node scripts/build-harness.mjs --check` after the test glob)
- Create: `harness/**` (generated)

- [ ] **Step 1:** `node scripts/build-harness.mjs` then `git status --short harness | head`.
- [ ] **Step 2:** `npm test`, expect all tests pass and the check exits 0.
- [ ] **Step 3:** `claude plugin validate --strict .` still passes.
- [ ] **Step 4: Commit** `feat(harness): generated cursor and codex trees`.

### Task 4: Documentation

**Files:**
- Modify: `README.md` (intro sentence, Install with three subsections, Quick start command table, Develop mentions `build:harness`)
- Modify: `docs/guide/README.md` (checker path uses `<jstack>`, one line per harness on resolving it; install block per harness)
- Modify: `docs/superpowers/specs/2026-10-31-jstack-multi-harness-design.md` (Decisions from the builder check)

- [ ] **Step 1:** Edit the three files.
- [ ] **Step 2:** Regenerate (`node scripts/build-harness.mjs`) because the README is copied into the trees. `npm test`.
- [ ] **Step 3: Commit** `docs(harness): install and use jstack from claude code, cursor, and codex`.

### Task 5: Acceptance on this machine

**Files:**
- Create: `docs/exercise/2026-10-31-multi-harness.md`

- [ ] **Step 1: Cursor structural check.** Download `scripts/validate-template.mjs` from `cursor/plugin-template` into the scratchpad and run it with `cwd` = repo root. Expect `0 errors`. Record the output.
- [ ] **Step 2: Codex install.** `codex plugin add jstack@jstack --json` (marketplace already registered), `codex plugin list` shows `installed, enabled`, version `0.1.0`, source `harness/codex`. `ls ~/.codex/plugins/cache/jstack/jstack/*/` shows `skills agents scripts` and no `.git`.
- [ ] **Step 3: Codex dry run.** From a scratch git repo: `codex exec --sandbox read-only --ephemeral "<prompt>"` asking for every `jstack:` skill name with its SKILL.md path and the exact `$` mention for `jstack-plan`, plus how it would resolve `<jstack>` by following the adapter, without running shell. Expect 13 skills (6 shared + 7 commands) and the cache path. Record the output.
- [ ] **Step 4: Codex agents install.** `bash ~/.codex/plugins/cache/jstack/jstack/*/scripts/install-agents.sh`, expect six files under `~/.codex/agents/` and `grep -c '<jstack>' ~/.codex/agents/jstack-*.toml` all `0`. Then a second `codex exec` that asks which custom agent types are available expects the six `jstack-*` names.
- [ ] **Step 5:** Write the exercise log with the commands and outputs, and the gaps found. Fix generator issues found, regenerate, `npm test`.
- [ ] **Step 6: Commit** `docs(harness): multi-harness acceptance log`.

### Task 6: Memory

- [ ] Update `/home/orca/.claude/projects/-home-orca-orca-projects-jstack/memory/jstack-exercise-layout.md` with the harness facts (Codex marketplace registered from the repo path, cache path, install commands) and keep the `MEMORY.md` pointer current.
