# jstack plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the jstack Claude Code plugin: commands, skills, agents, and check scripts that turn a requirement plus design into an implementation plan, a PR plan, and per-PR verification bundles, then prove it on acme-pass.

**Architecture:** A standard Claude Code plugin directory that is also its own marketplace. Prose lives in `commands/`, `skills/`, `agents/`. Each artifact-producing skill ships a dependency-free Node check script that fails on a half-filled template. A small shared markdown parser under `scripts/lib/` keeps the three checkers consistent. Artifacts are written into the target repo under `docs/jstack/<slug>/`.

**Tech Stack:** Markdown with YAML frontmatter, Node 20 (ESM, `node:test`), bash, Mermaid. No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-jstack-design.md`

## Global Constraints

- Plugin manifest at `.claude-plugin/plugin.json`, marketplace at `.claude-plugin/marketplace.json`, `claude plugin validate --strict .` must pass.
- No npm dependencies. Scripts use only `node:` built-ins. Node 20 or newer.
- Line budget default is 500 changed lines (additions plus deletions), tests included, lockfiles, generated files, and `docs/jstack/**` excluded.
- Template placeholders use `{{...}}`. A checker fails on any remaining `{{`.
- Every artifact is Markdown. Diagrams are Mermaid `sequenceDiagram` or `graph TD`.
- Artifact paths inside a target repo: `docs/jstack/<slug>/implementation-plan.md`, `docs/jstack/<slug>/pr-plan.md`, `docs/jstack/<slug>/verification/<pr-id>/{report.md,rerun.sh,artifacts/}`.
- The verifier agent never edits product code.
- Prose style for agent and user facing text: short declarative sentences, no long dashes, no mid-sentence colons.

## Review Focus

1. A change table row whose method name never appears in any referenced sequence diagram. The checker must report it; a plan with orphan methods is unreviewable. Test in Task 3.
2. A PR plan where one change id is listed in two PRs or in none. The checker must fail both ways. Test in Task 4.
3. A dependency cycle in the PR plan (`PR-2` depends on `PR-3`, `PR-3` depends on `PR-2`). Must fail with the cycle named. Test in Task 4.
4. A verification bundle whose `report.md` cites `artifacts/test.log` that does not exist, or whose `artifacts/` holds a file the report never cites. Both fail. Test in Task 5.
5. `pr-size.sh` counting a lockfile or `docs/jstack/**` toward the budget. Must exclude them. Test in Task 4.

---

### Task 1: Plugin scaffold and validation

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `package.json`
- Create: `LICENSE`
- Create: `README.md` (short placeholder, finished in Task 9)
- Create: `.gitignore`

**Interfaces:**
- Produces: plugin name `jstack`, version `0.1.0`, marketplace name `jstack` with one plugin entry `source: "./"`. Commands are reachable as `/jstack:<name>`, agents as `jstack:<name>`.

- [ ] **Step 1: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "jstack",
  "version": "0.1.0",
  "description": "Requirement and design in, reviewable implementation plan, sub-500-line PR plan, and verified PRs out. Agent teams with evidence.",
  "author": { "name": "Jacob Nguyen" },
  "homepage": "https://github.com/manhnc-dev/jstack",
  "repository": "https://github.com/manhnc-dev/jstack",
  "license": "MIT",
  "keywords": ["jstack", "planning", "pr-stack", "verification", "sequence-diagrams", "agent-teams"]
}
```

- [ ] **Step 2: Write `.claude-plugin/marketplace.json`**

```json
{
  "name": "jstack",
  "owner": { "name": "Jacob Nguyen" },
  "metadata": { "description": "jstack marketplace", "version": "0.1.0" },
  "plugins": [
    { "name": "jstack", "description": "Plan, split, implement, verify.", "version": "0.1.0", "author": { "name": "Jacob Nguyen" }, "source": "./" }
  ]
}
```

- [ ] **Step 3: Write `package.json` with `"type": "module"` and `"scripts": { "test": "node --test scripts/ skills/" }`, `"engines": { "node": ">=20" }`, no dependencies.**

- [ ] **Step 4: Write `LICENSE` (MIT, 2026, Jacob Nguyen), `.gitignore` (`node_modules/`, `.DS_Store`), and a two-line `README.md`.**

- [ ] **Step 5: Validate**

Run: `claude plugin validate --strict .`
Expected: exit 0, no errors. (Warnings about empty `commands/` are acceptable until Task 8.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore(jstack): scaffold plugin manifest and marketplace"
```

---

### Task 2: Shared markdown parser

**Files:**
- Create: `scripts/lib/markdown.mjs`
- Test: `scripts/lib/markdown.test.mjs`

**Interfaces:**
- Produces (all exported from `scripts/lib/markdown.mjs`):
  - `parseDocument(text: string): { lines: string[], headings: Heading[], tables: Table[], fences: Fence[] }` where `Heading = { level: number, text: string, line: number }`, `Table = { line: number, headers: string[], rows: string[][] }`, `Fence = { line: number, lang: string, body: string, headingText: string }` (`headingText` is the nearest heading above).
  - `sectionBetween(doc, headingText: string): { start: number, end: number }` lines of a section (1-indexed start of heading, end exclusive).
  - `findPlaceholders(doc): number[]` line numbers containing `{{`, ignoring fenced code.
  - `tableByHeaders(doc, required: string[]): Table | null` first table whose headers include all `required` (case-insensitive, trimmed).
  - `idsIn(text: string, prefix: 'C' | 'SD' | 'PR'): string[]` all `PREFIX-<digits>` tokens, deduplicated, in order.
  - `mermaidMessages(body: string): { from: string, to: string, text: string }[]` parses `A->>B: text`, `A-->>B: text`, `A-)B: text`, `A->B: text` lines.
  - `problem(file, line, msg): string` formats `file:line: msg`.
- Consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write failing tests in `scripts/lib/markdown.test.mjs`**

Cases: `parseDocument` finds two headings with levels and lines; a table with 3 columns and 2 rows is parsed with trimmed cells; a mermaid fence records its `headingText`; `findPlaceholders` ignores `{{` inside a fence and reports it outside; `tableByHeaders` is case-insensitive; `idsIn('C-1, C-12 and C-1', 'C')` returns `['C-1','C-12']`; `mermaidMessages` parses `OTPController->>OTPApplicationService: verify(req): Outcome` into from, to, text.

- [ ] **Step 2: Run tests, expect failure**

Run: `node --test scripts/lib/`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/lib/markdown.mjs`**

Tables: a line starting with `|` whose next line matches `^\|?\s*:?-+`. Fences: triple backtick or tilde, track open and close. Headings: `^(#{1,6})\s+(.*)`.

- [ ] **Step 4: Run tests, expect pass**

Run: `node --test scripts/lib/`
Expected: all pass.

- [ ] **Step 5: Commit** `feat(jstack): add shared markdown parser for checkers`

---

### Task 3: implementation-plan skill, template, and checker

**Files:**
- Create: `skills/implementation-plan/SKILL.md`
- Create: `skills/implementation-plan/references/plan-template.md`
- Create: `skills/implementation-plan/references/example-plan.md` (a filled, passing example against a fictional `OrderService`)
- Create: `skills/implementation-plan/scripts/check-plan.mjs`
- Test: `skills/implementation-plan/scripts/check-plan.test.mjs`

**Interfaces:**
- Consumes: `scripts/lib/markdown.mjs` via `../../../scripts/lib/markdown.mjs`.
- Produces: CLI `node check-plan.mjs <plan.md> [--repo <path>]`. Exit 0 when clean, exit 1 and one `file:line: message` per problem. Repo defaults to the plan's enclosing git root (`git rev-parse --show-toplevel` from the plan's directory).
- Produces: the plan format other tasks rely on:
  - Required H2 headings, in order: `Summary`, `Scope`, `Design`, `Grounding`, `Data shapes`, `Sequence diagrams`, `Change table`, `Test plan`, `Risks and rollbacks`, `Open questions`.
  - `Design` holds `Source: given (<path>)` or `Source: planner's draft`, an `Approach` paragraph, and an `Alternatives rejected` table (`Alternative | Why not`). The checker requires the `Source:` line.
  - `Summary` body at most 12 non-empty lines.
  - Each sequence diagram is a `### SD-n: <caption>` heading followed by a ```` ```mermaid ```` fence starting with `sequenceDiagram`.
  - Change table headers: `ID | File | Class | Method | Change | Responsibility | Diagrams`. `ID` is `C-n`. `Change` is one of `add`, `modify`, `delete`. `Method` is `name(params): Return` or `-` for class-level or file-level rows. `Diagrams` is a comma list of `SD-n`.
  - Test plan table headers: `Change | Test file | Cases | Kind | Asserts`. `Kind` is `unit`, `integration`, or `e2e`.

- [ ] **Step 1: Write `references/plan-template.md`** with every heading above, `{{...}}` placeholders, the two tables with header rows, one `### SD-1: {{caption}}` block, and a short instruction comment under each heading (as HTML comments) on what belongs there.

- [ ] **Step 2: Write `references/example-plan.md`** for a fictional feature "add idempotency key to OrderService.place" with 2 diagrams, 4 change rows, 4 test rows, no placeholders, and file paths that exist in this plugin repo (use `scripts/lib/markdown.mjs` as the `modify` target so the existence check passes in tests).

- [ ] **Step 3: Write failing tests in `check-plan.test.mjs`**

Cases, each writing a temp plan under `os.tmpdir()` and running the checker via `child_process.spawnSync(process.execPath, [...])`:
- example-plan passes with exit 0 and empty stdout.
- missing `Test plan` heading → exit 1, message contains `missing heading "Test plan"`.
- `Design` section without a `Source:` line → `Design section has no "Source:" line`.
- headings out of order → message contains `out of order`.
- summary with 13 lines → message contains `Summary has 13 lines, max 12`.
- remaining `{{caption}}` → message contains `placeholder`.
- change row `C-3` whose `Diagrams` says `SD-9` (absent) → `C-3 references unknown diagram SD-9`.
- diagram `SD-2` referenced by no change row → `SD-2 is not referenced by any change row`.
- change row `C-2` method `applyKey(...)` not present in any message of its diagrams → `C-2 method "applyKey" does not appear in SD-1`.
- change row without a test row → `C-4 has no test row`.
- test row for unknown `C-7` → `test row references unknown change C-7`.
- `modify` row whose file does not exist → `C-1 file "src/nope.mjs" not found`.
- `Change` cell `update` → `C-1 change "update" must be add, modify, or delete`.

- [ ] **Step 4: Run tests, expect failure**

Run: `node --test skills/implementation-plan/scripts/`
Expected: FAIL.

- [ ] **Step 5: Implement `check-plan.mjs`** using the parser. Method name is the token before the first `(` in `Method`; a `-` method skips the diagram-message check. File existence check runs for `modify` and `delete` only. `--repo` overrides the git root.

- [ ] **Step 6: Run tests, expect pass**

Run: `node --test skills/implementation-plan/scripts/`
Expected: all pass. Also run `node skills/implementation-plan/scripts/check-plan.mjs skills/implementation-plan/references/example-plan.md` → exit 0.

- [ ] **Step 7: Write `SKILL.md`** (frontmatter `name: implementation-plan`, `description` naming when to use: turning a requirement and design into a reviewable plan with class and method level sequence diagrams). Body sections: Inputs (requirement, design, `docs/jstack/repo-profile.md`); Steps (1 ground with `jstack-explorer`, 2 settle observable questions by reading code, 3 fill the template, 4 run the checker and fix every line, 5 hand to `jstack-reviewer`, 6 reply with path, five-line summary, open questions); Diagram rules (link to `sequence-diagrams` skill); Reviewer load rule (the summary plus diagrams must be readable in ten minutes; prose explains only what the diagrams cannot); Output path `docs/jstack/<slug>/implementation-plan.md` where slug is kebab-case of the feature name.

- [ ] **Step 8: Commit** `feat(jstack): implementation-plan skill with checker`

---

### Task 4: pr-plan skill, template, checker, and size script

**Files:**
- Create: `skills/pr-plan/SKILL.md`
- Create: `skills/pr-plan/references/pr-plan-template.md`
- Create: `skills/pr-plan/references/example-pr-plan.md` (splits Task 3's example plan into 2 PRs)
- Create: `skills/pr-plan/scripts/check-pr-plan.mjs`
- Create: `skills/pr-plan/scripts/pr-size.sh`
- Test: `skills/pr-plan/scripts/check-pr-plan.test.mjs`
- Test: `skills/pr-plan/scripts/pr-size.test.mjs`

**Interfaces:**
- Consumes: plan format and `C-n` ids from Task 3; parser from Task 2.
- Produces: CLI `node check-pr-plan.mjs <pr-plan.md> [--plan <implementation-plan.md>] [--budget 500]`. Plan path defaults to `implementation-plan.md` beside the pr-plan.
- Produces: CLI `pr-size.sh <base-ref> <head-ref> [--budget 500] [--repo <path>]`. Prints `added=<n> deleted=<n> total=<n> budget=<n> status=OK|OVER` on one line, then one line per counted file `<added>\t<deleted>\t<path>`. Exit 0 when OK, exit 3 when OVER. Excludes: `*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `Cargo.lock`, `go.sum`, `gradle.lockfile`, `*.min.js`, `*.min.css`, `*.snap`, `**/generated/**`, `docs/jstack/**`.
- Produces: PR plan format:
  - Required H2 headings in order: `Stack overview`, `Dependency graph`, `PRs`, `Sequencing rationale`.
  - Stack overview table headers: `ID | Title | Depends on | Changes | Est. LOC | Kind`. `ID` is `PR-n`. `Depends on` is `-` or comma list of `PR-n`. `Changes` is a comma list of `C-n`. `Kind` is `scaffold`, `logic`, `wiring`, or `cleanup`.
  - Dependency graph is a ```` ```mermaid ```` fence starting `graph TD` with edges `PR-1 --> PR-2` meaning PR-2 depends on PR-1.
  - Under `## PRs`, one `### PR-n: <title>` per PR with bold labels on their own lines: `**Goal.**`, `**Changes.**`, `**Files.**`, `**Tests.**`, `**Verify.**`, `**Review focus.**`, `**Observable.**`, `**Rollback.**`.

- [ ] **Step 1: Write `references/pr-plan-template.md` and `references/example-pr-plan.md`.**

- [ ] **Step 2: Write failing tests in `check-pr-plan.test.mjs`**

Cases:
- example passes against `../../implementation-plan/references/example-plan.md` via `--plan`.
- `C-2` in two PRs → `C-2 assigned to PR-1 and PR-2`.
- `C-4` in no PR → `C-4 from the plan is not assigned to any PR`.
- `PR-2` depends on `PR-3`, `PR-3` on `PR-2` → `dependency cycle: PR-2 -> PR-3 -> PR-2`.
- `Est. LOC` 620 → `PR-1 estimated 620 lines exceeds budget 500`.
- title `Add key` → `PR-1 title "Add key" is not Conventional Commits`.
- `**Tests.**` line followed by `none` → `PR-2 has no tests`.
- graph edge `PR-1 --> PR-2` but table says PR-2 depends on `-` → `graph edge PR-1 --> PR-2 not in table`.
- missing `**Rollback.**` → `PR-1 missing "Rollback."`.
- depends on unknown `PR-9` → `PR-2 depends on unknown PR-9`.

- [ ] **Step 3: Write failing tests in `pr-size.test.mjs`**: create a temp git repo with two commits, the second adding 3 lines to `a.txt`, 100 lines to `package-lock.json`, 50 lines to `docs/jstack/x/plan.md`; expect `total=3 status=OK` and the counted-file list to contain only `a.txt`. A second case with `--budget 2` expects `status=OVER` and exit 3.

- [ ] **Step 4: Run both, expect failure.** `node --test skills/pr-plan/scripts/`

- [ ] **Step 5: Implement `check-pr-plan.mjs` and `pr-size.sh`.** Cycle detection by DFS with path reporting. Conventional Commits regex: `^(feat|fix|refactor|test|chore|docs|perf|build|ci)(\([a-z0-9._-]+\))?!?: \S.*[^.]$`. `pr-size.sh` uses `git -C "$repo" diff --numstat "$base...$head"` and filters with a `case` statement; binary files (`-` counts) count as 0.

- [ ] **Step 6: Run tests, expect pass.** `node --test skills/pr-plan/scripts/`

- [ ] **Step 7: Write `SKILL.md`** (`name: pr-plan`). Body: Inputs; Split heuristics (group by dependency layer, then file ownership; never separate a method from its unit test; one reason to change per PR; each PR green and deployable alone; types and scaffold first, failing test then fix, wiring and flag flip last; a PR over 500 estimated lines is split again before writing); LOC estimation rule (count method bodies in the change table at 8 lines per add, 4 per modify, plus 1.5x for tests, round up to tens; state the estimate's basis); Steps (read plan, group, estimate, write, run checker, hand to reviewer, reply with the stack table); Output path `docs/jstack/<slug>/pr-plan.md`.

- [ ] **Step 8: Commit** `feat(jstack): pr-plan skill with checker and size script`

---

### Task 5: verification-bundle skill, templates, and checker

**Files:**
- Create: `skills/verification-bundle/SKILL.md`
- Create: `skills/verification-bundle/references/report-template.md`
- Create: `skills/verification-bundle/references/rerun-template.sh`
- Create: `skills/verification-bundle/references/example-bundle/report.md`, `rerun.sh`, `artifacts/test-head.log`, `artifacts/test-base.log`, `artifacts/size.txt`
- Create: `skills/verification-bundle/scripts/check-verification.mjs`
- Test: `skills/verification-bundle/scripts/check-verification.test.mjs`

**Interfaces:**
- Consumes: parser from Task 2, `pr-size.sh` from Task 4.
- Produces: CLI `node check-verification.mjs <bundle-dir> [--repo <path>]`.
- Produces: bundle format:
  - `report.md` required H2 headings in order: `PR`, `Commands`, `Test summary`, `Baseline`, `Size`, `Plan conformance`, `Live evidence`, `Rerun`, `Verdict`.
  - `PR` section contains lines `PR: PR-n`, `Branch: <name>`, `SHA: <40 hex>`, `Base: <40 hex>`.
  - `Commands` is a table `Step | Command | Exit | Artifact` where `Artifact` is `artifacts/<file>`.
  - `Test summary` has lines `Head: passed=<n> failed=<n> skipped=<n>` and `Baseline: passed=<n> failed=<n> skipped=<n>` and `New failures: <n>`.
  - `Size` has a line `Changed lines: <n> of 500 (<OK|OVER>)` and cites `artifacts/size.txt`.
  - `Plan conformance` is a table `Change | Present | Note`.
  - `Live evidence` has either a line `Live: unavailable (<reason>)` or at least one `artifacts/...` citation.
  - `Rerun` has a line `rerun.sh exit code: <n>` and `Ran at: <ISO timestamp>`.
  - `Verdict` has `Verdict: PASS` or `Verdict: FAIL` followed by `Blocking: <first finding>` when FAIL.
  - `rerun.sh` is executable, passes `bash -n`, starts with `#!/usr/bin/env bash` and `set -euo pipefail`.
- Checks: headings; SHA format (and `git cat-file -e` when `--repo` given or git root found); every `artifacts/...` cited exists; every file in `artifacts/` is cited at least once; `New failures: 0` when verdict PASS, otherwise verdict must be FAIL; rerun exit code line present; `rerun.sh` mode and syntax; Live evidence rule; warning (not failure) for any artifact over 200 KB.

- [ ] **Step 1: Write `report-template.md`, `rerun-template.sh`, and the example bundle.** `rerun-template.sh` takes `{{REPO}}`, `{{BASE_SHA}}`, `{{HEAD_SHA}}`, `{{TEST_CMD}}`, `{{SUMMARY_CMD}}` (a command that prints `passed=<n> failed=<n> skipped=<n>` from test output), and optional `{{LIVE_CMDS}}`. It creates a git worktree for head under `$(mktemp -d)` (and for base too when called with `--with-baseline`), runs `TEST_CMD` in each, writes `artifacts/rerun-<timestamp>/{test-head.log,summary.txt}` (plus `test-base.log` with baseline), compares the head failed count with the recorded `Head: failed=` line in `report.md`, prints `RERUN MATCH` or `RERUN MISMATCH`, removes the worktrees, exits 0 on match and 2 on mismatch. Rerun output directories are gitignored by a `.gitignore` the verifier writes into `artifacts/`. The example bundle's rerun.sh is the template filled with `echo` commands so the test can execute it.

- [ ] **Step 2: Write failing tests in `check-verification.test.mjs`**

Cases (copy the example bundle to a temp dir, mutate, run):
- example passes (mock SHA check by passing `--repo` pointing at a temp git repo whose HEAD is the SHA in the report; the test rewrites the SHA lines to the temp repo's HEAD).
- report cites `artifacts/missing.log` → `cited artifact "artifacts/missing.log" not found`.
- extra `artifacts/stray.txt` → `artifact "artifacts/stray.txt" is not cited in report.md`.
- `rerun.sh` not executable → `rerun.sh is not executable`.
- `rerun.sh` with a syntax error → `rerun.sh failed bash -n`.
- `Verdict: PASS` with `New failures: 2` → `verdict PASS with 2 new failures`.
- missing `rerun.sh exit code:` line → `Rerun section has no "rerun.sh exit code:" line`.
- SHA not in repo → `SHA <sha> not found in repo`.
- `Verdict: FAIL` with no `Blocking:` line → `FAIL verdict needs a Blocking: line`.
- `Live evidence` section with neither `Live: unavailable` nor an artifact citation → `Live evidence needs "Live: unavailable (<reason>)" or a cited artifact`.
- artifact of 300 KB → stdout contains `warning: artifacts/big.log is 300 KB, over 200 KB`, exit stays 0.

- [ ] **Step 3: Run tests, expect failure.** `node --test skills/verification-bundle/scripts/`

- [ ] **Step 4: Implement `check-verification.mjs`.**

- [ ] **Step 5: Run tests, expect pass.** Also run the example bundle's `rerun.sh` once and confirm it prints `RERUN MATCH`.

- [ ] **Step 6: Write `SKILL.md`** (`name: verification-bundle`). Body: Role (run by `jstack-verifier`, never by the implementer, never edits product code); Inputs (PR id, branch, pr-plan, implementation plan, repo profile); Steps (1 record SHAs, 2 reuse `verification/baseline-<sha7>/` when it exists for the base SHA, else run the baseline suite on base in a worktree and save it there, then run head tests on head, saving raw logs, 3 parse summaries from the repo's reporter output, 4 run `pr-size.sh`, 5 check each change id of the PR is present in the diff, 6 run live checks when the PR exposes behaviour and save request and response, 7 fill `rerun.sh` from the template, make it executable, run it once, record the exit code, 8 write report, 9 run checker, 10 reply with verdict, path, and first blocking finding); Baseline rule (judge on delta, list pre-existing failures, never hide them); Live rule (the repo profile's `live` row decides; when unavailable say so in the report, never fake it); Evidence rule (every claim in the report cites a file in `artifacts/`; reporter XML or JSON is reduced to `test-summary-*.txt`, raw reporter files are not committed).

- [ ] **Step 7: Commit** `feat(jstack): verification-bundle skill with checker and rerun template`

---

### Task 6: Supporting skills: principles, sequence diagrams, repo profile

**Files:**
- Create: `skills/jstack-principles/SKILL.md`
- Create: `skills/sequence-diagrams/SKILL.md`
- Create: `skills/repo-profile/SKILL.md`
- Create: `skills/repo-profile/references/repo-profile-template.md`

**Interfaces:**
- Produces: `docs/jstack/repo-profile.md` format with H2 headings `Stack`, `Layout`, `Commands` (table `Purpose | Command | Notes` with rows for test, test single, lint, typecheck, build, test summary parser, and `live` whose Command is a boot command or `unavailable` with the reason in Notes; also a `trunk` row naming the default branch), `Conventions` (branch names, commit style, PR template, layering), `Test layout`, `Known baseline` (failing tests on trunk today), `Caveats`.

- [ ] **Step 1: Write `jstack-principles/SKILL.md`.** Eight principles, each one paragraph with when it applies: Sequence work into verifiable units; Prove it works against the real artifact; Never verify your own code; Small diffs are a feature (500 lines); Model the domain before writing logic; Diagrams carry the detail, prose carries the why; Never block on the human for an observable fact; Baseline before judging. Credit pstack for the first two and fifth.

- [ ] **Step 2: Write `sequence-diagrams/SKILL.md`.** Rules: one diagram per flow or error path; participants are real class or module names as `participant OTPController as OTPController`; external systems as `participant Redis`; every message is `method(params): Return` using real signatures from grounding; use `alt`/`else` for branches, `loop` for iteration, `opt` for optional, `Note over X: ` for a side effect (DB write, event emit); return arrows `-->>` only when the return value matters to the flow; keep under 25 messages, split otherwise; new methods appear with `(new)` suffix in the caption list, not in the arrow text; a minimal worked example.

- [ ] **Step 3: Write `repo-profile/SKILL.md` and its template.** Steps: detect build tool from files (`package.json`, `build.gradle`, `pom.xml`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `Makefile`), read CI config for the authoritative commands, find test dirs and reporter output locations (e.g. `build/test-results/test/*.xml` for Gradle, `junit.xml` or `--reporter=json` for Jest and Vitest, `pytest --junitxml`), run the test command once to capture the known baseline, write the profile, run `node skills/implementation-plan/scripts/check-plan.mjs --help`-style self test is not needed. Provide the summary parser snippets for JUnit XML (python3 one-liner) and Jest JSON (node one-liner) as reference blocks.

- [ ] **Step 4: Validate** `claude plugin validate --strict .` → exit 0.

- [ ] **Step 5: Commit** `feat(jstack): principles, sequence-diagram, and repo-profile skills`

---

### Task 7: Agents

**Files:**
- Create: `agents/jstack-explorer.md`
- Create: `agents/jstack-planner.md`
- Create: `agents/jstack-splitter.md`
- Create: `agents/jstack-implementer.md`
- Create: `agents/jstack-verifier.md`
- Create: `agents/jstack-reviewer.md`

**Interfaces:**
- Produces: agent names usable as `subagent_type: "jstack:jstack-<role>"`. Frontmatter fields: `name`, `description`, `model` (`sonnet` for explorer, `opus` for planner, splitter, verifier, reviewer, `inherit` for implementer), `tools` (explorer and reviewer: `Read, Grep, Glob, Bash`; verifier: `Read, Grep, Glob, Bash, Write`; others: unrestricted), `skills` listing the jstack skills each reads (`jstack-principles` for all, plus the role skill).
- Each agent body: role in two sentences, what it reads first (`${CLAUDE_PLUGIN_ROOT}/skills/<skill>/SKILL.md` and the repo profile), what it must never do, the exact shape of its report back to the parent.

- [ ] **Step 1: Write the six agent files.** Explorer report shape: `Files` (path:line, symbol, one line), `Call chain` (ordered list of `Class.method(sig)`), `Conventions`, `Test commands`, `Open facts` (things it could not observe). Planner returns the plan path and checker output. Splitter returns the pr-plan path and checker output. Implementer: TDD per change row, commits after each green unit with Conventional Commits, runs `pr-size.sh` before reporting, returns branch, SHA, size line, test summary line, deviations from plan. Verifier: follows `verification-bundle` skill, returns verdict line, bundle path, blocking finding. Reviewer: reads plan or diff plus plan, returns numbered findings each with severity (`block`, `should`, `nit`), file:line, and the plan id it concerns, nothing else.

- [ ] **Step 2: Validate** `claude plugin validate --strict .` → exit 0.

- [ ] **Step 3: Commit** `feat(jstack): agent team definitions`

---

### Task 8: Commands

**Files:**
- Create: `commands/init.md`
- Create: `commands/plan.md`
- Create: `commands/pr-plan.md`
- Create: `commands/implement.md`
- Create: `commands/verify.md`
- Create: `commands/build.md`
- Create: `commands/help.md`

**Interfaces:**
- Consumes: skills from Tasks 3 to 6, agents from Task 7.
- Produces: `/jstack:init`, `/jstack:plan <requirement text or file path> [--design <path>] [--slug <slug>]`, `/jstack:pr-plan [plan path]`, `/jstack:implement <PR-n | slug/PR-n> [--slug <slug>] [--fix "<finding>"] [--no-verify]`, `/jstack:verify <PR-n | slug/PR-n> [--slug <slug>] [--open-pr]`, `/jstack:build [--slug <slug>] [--only PR-n,PR-m] [--no-gate] [--open-pr]`, `/jstack:help [question]`.
- Slug resolution rule shared by implement, verify, build: explicit `slug/PR-n` or `--slug` wins; else if exactly one directory exists under `docs/jstack/` (excluding `repo-profile.md`) use it; else list the slugs and stop.
- Branch rule: plan and pr-plan are committed on `jstack/<slug>/plan` off trunk. `PR-n` branches as `jstack/<slug>/pr-n` from the tip of the branch of the PR it depends on, or from `jstack/<slug>/plan` when it depends on nothing. The verification bundle is committed on the PR's own branch.
- Each command frontmatter: `description`, `argument-hint`, `disable-model-invocation: true` for all except `help`. Body uses `$ARGUMENTS` and `${CLAUDE_PLUGIN_ROOT}`.

- [ ] **Step 1: Write `init.md`.** Spawn `jstack:jstack-explorer` with the `repo-profile` skill, write `docs/jstack/repo-profile.md`, run the test command once for the baseline, reply with the commands table and baseline line.

- [ ] **Step 2: Write `plan.md`.** Resolve the requirement (inline text or file), the design (`--design` path, or none, in which case the planner drafts the Design section and labels it `Source: planner's draft`), and the repo profile (run init if missing). Create or check out `jstack/<slug>/plan` from trunk before writing. Spawn explorer for grounding (file pointers, call chain). Spawn planner with grounding, requirement, design, template path, example path, checker path, and output path. Then spawn reviewer on the plan. Apply `block` findings via a fresh planner round, at most two rounds. Commit the plan on the plan branch. Stop and reply: path, checker output, five-line summary, open questions. Do not implement.

- [ ] **Step 3: Write `pr-plan.md`.** Resolve the plan path (argument, or the newest `docs/jstack/*/implementation-plan.md`). Spawn splitter, then reviewer, one fix round max. Commit on the plan branch. Reply with the stack overview table and checker output. Do not implement.

- [ ] **Step 4: Write `implement.md`.** Resolve slug and PR id per the slug rule. Create branch `jstack/<slug>/<pr-id-lowercase>` per the branch rule. With `--fix`, reuse the existing branch and pass the finding to a fresh implementer. Spawn implementer with the PR section, the change rows and test rows it owns, the repo profile, and the principle skill. On return, run `pr-size.sh` yourself and print the line. Reply with branch, SHA, size, test summary, deviations. Then invoke `/jstack:verify` unless `--no-verify`.

- [ ] **Step 5: Write `verify.md`.** Resolve slug, PR id, branch, and base (parent branch tip). Spawn `jstack:jstack-verifier`. On return, run `git status --porcelain` on the branch. Any change outside `docs/jstack/` is reverted with `git checkout -- <path>` and the verdict is forced to FAIL with `Blocking: verifier modified product code`. Then run the checker yourself on the bundle, commit the bundle on the PR branch. With `--open-pr` and a PASS verdict, run `gh pr create --base <parent branch>` with the report's Verdict and Size lines in the body. Reply with the verdict line, bundle path, and the first blocking finding. On FAIL, do not fix; state that `/jstack:implement <PR-n> --fix` with the finding is the next step.

- [ ] **Step 6: Write `build.md`.** Read the pr-plan, topologically order PRs, for each: implement then verify, stop at the first FAIL unless `--no-gate`, after each PR print one status line. Independent PRs (no shared ancestor in the graph) may run as parallel implementers in worktrees (`isolation: "worktree"`), verification always sequential. End with a table `PR | Branch | SHA | Size | Verdict | Bundle`.

- [ ] **Step 7: Write `help.md`.** A short router: which command for which situation, in a table, plus the artifact paths.

- [ ] **Step 8: Validate** `claude plugin validate --strict .` → exit 0. Then `claude plugin details ./` (or the path form the CLI accepts) to confirm 7 commands, 6 agents, 6 skills are inventoried.

- [ ] **Step 9: Commit** `feat(jstack): commands for init, plan, pr-plan, implement, verify, build, help`

---

### Task 9: README, guide, install, and full test run

**Files:**
- Modify: `README.md`
- Create: `docs/guide/README.md`
- Create: `evals/plan/prompt.md` and `evals/plan/graders/checker-passes.md` (one eval case; optional if `claude plugin eval` format differs, then document it as a follow-up)

- [ ] **Step 1: Write README.** Sections: What jstack is (three artifacts, one paragraph each), Install (`claude plugin marketplace add /path/or/git-url` then `claude plugin install jstack@jstack`), Quick start (the five commands in order with one example each on acme-pass), The team (agents table), Artifact formats (link to the three example files), Principles (link), Credits (pstack).

- [ ] **Step 2: Write `docs/guide/README.md`**: a first run walkthrough, ten minutes, with the human gates called out.

- [ ] **Step 3: Run everything.**

Run: `npm test` → all tests pass. `claude plugin validate --strict .` → exit 0.

- [ ] **Step 4: Install locally.**

Run: `claude plugin marketplace add /home/orca/orca/projects/jstack && claude plugin install jstack@jstack` → success. `claude plugin list` shows `jstack`.

- [ ] **Step 5: Commit** `docs(jstack): readme and guide`

---

### Task 10: Exercise on acme-pass

**Files (in `/home/orca/src/acme-pass`, on a new branch `jstack/exercise` off `master`, never pushed):**
- Create: `docs/jstack/repo-profile.md`
- Create: `docs/jstack/<slug>/implementation-plan.md`
- Create: `docs/jstack/<slug>/pr-plan.md`
- Create: `docs/jstack/<slug>/verification/PR-1/{report.md,rerun.sh,artifacts/}`
- Product changes for PR-1 on branch `jstack/<slug>/pr-1`.

- [ ] **Step 1: Run `/jstack:init` in acme-pass** (in this session, follow `commands/init.md` by hand with the Agent tool, since the plugin loads next session). Expected: profile with `./gradlew test --offline`, JUnit XML location, baseline `passed=102 failed=232` (CommonUtilsTest).

- [ ] **Step 2: Choose the requirement.** Read `CustomerController.java` around line 1233 and `OTPController.java` around line 309. Pick the preferences endpoint move if it maps to 2 to 4 PRs under 500 lines each, else the OTP customer cache. Write the requirement and a short design as `docs/jstack/<slug>/requirement.md`.

- [ ] **Step 3: Run `/jstack:plan`.** Expected: `check-plan.mjs` exit 0, reviewer findings resolved, plan with at least 2 sequence diagrams.

- [ ] **Step 4: Run `/jstack:pr-plan`.** Expected: `check-pr-plan.mjs` exit 0, 2 to 4 PRs, each under 500 estimated lines.

- [ ] **Step 5: Run `/jstack:implement PR-1` then `/jstack:verify PR-1`.** Expected: `pr-size.sh` status OK, `check-verification.mjs` exit 0, `rerun.sh exit code: 0`, `Verdict: PASS`, `New failures: 0`.

- [ ] **Step 6: Record findings.** Append `docs/exercise/2026-10-30-acme-pass.md` in the jstack repo: what the pipeline produced, timings, what broke in the skills, and the fixes applied. Fix skill prose and re-run checkers where the exercise exposed gaps. Commit `docs(jstack): acme-pass exercise log`.
