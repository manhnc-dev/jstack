# jstack design

Date: 2026-10-30. Author: Jacob Nguyen with Claude. Status: draft for builder check.

## Intent

jstack is a Claude Code plugin, inspired by pstack, that turns a requirement and a solution design into work an agent team can execute and a human can review in minutes. It covers the gap between "we agreed what to build" and "a stack of small, verified PRs exists".

pstack's bet is depth before speed: plan, verify against the real artifact, sequence work into verifiable units. jstack keeps that bet and specialises it to three artifacts the Acme team reviews every day.

1. An implementation plan an agent codes from and a human reviews from. Concise text, detailed Mermaid sequence diagrams down to class and method level.
2. A PR plan that splits a feature or epic into small, reviewable, independently verifiable changes, each under 500 changed lines including its tests.
3. A verification bundle per PR. Raw test artifacts, a human-readable test report, and a deterministic re-run script a reviewer can execute to reproduce the evidence.

## Goals

- A requirement plus solution design in, three reviewable artifacts out, with human gates between stages.
- Every artifact has a machine check (a script) so the agent cannot hand back a half-filled template.
- The plan is traceable end to end. Every method in a sequence diagram appears in the change table, every change row lands in exactly one PR, every PR has tests, every PR's verification report cites artifacts that exist on disk.
- Works on Acme's real repos (acme-pass first, acmefnb second) with no per-repo code, only a generated repo profile.
- Agent roles are separated. The agent that writes code is never the agent that signs off verification.

## Non-goals

- Not a replacement for pstack's full playbook catalogue (babysit, shipping, perf, forensics). jstack is the planning and verification spine; pstack or superpowers can still be installed alongside.
- Not a merge bot. jstack opens PRs on request but never merges.
- Not Cursor-first. Claude Code is the primary harness. A Cursor manifest can be added later without changing skill content.
- Not a UI test driver. Live verification uses what the repo already has (HTTP, CLI, existing e2e). jstack records evidence, it does not invent a browser harness.

## Anti-goals

- A plan that reads like annotated source. If the human needs more than ten minutes to review the plan for a one-week feature, the plan failed.
- A PR split that is small on paper and 1,200 lines in practice. Budgets are measured after implementation with `git diff --shortstat` and reported, not just estimated.
- A verification report that says "tests pass" with no file a reviewer can open. The report without artifacts is a failed check.
- Verification done by the implementer. Self-report is not evidence.

## Users and the moment

The principal engineer or tech lead has a requirement and a solution design, often in a ticket or a doc. They want to start several agents in parallel without babysitting each one, and review the result in small pieces. The moment jstack exists for is "I have a design, I want a plan I can read over coffee and a stack of PRs by tomorrow, each proven".

## Constraints

- Claude Code plugin format. `.claude-plugin/plugin.json`, `commands/*.md`, `skills/*/SKILL.md`, `agents/*.md`. The repo is also its own marketplace so it installs with `claude plugin marketplace add <path>` and `claude plugin install jstack@jstack`.
- Skills and commands are prose plus small Node scripts with no dependencies beyond Node 20 built-ins, so the plugin runs anywhere Claude Code runs.
- Artifacts live in the target repo under `docs/jstack/<slug>/`, so they are versioned with the code and reviewable in the same PR.
- Line budget is 500 changed lines (additions plus deletions, tests included, generated files and lockfiles excluded).
- Mermaid is the diagram language. Sequence diagrams are the primary form. Participants are classes, modules, or external systems. Messages are method calls with real signatures.

## Architecture

### Pipeline

```
requirement + design
   │  /jstack:init  (once per repo) → docs/jstack/repo-profile.md
   ▼
/jstack:plan      → docs/jstack/<slug>/implementation-plan.md   [human gate]
   ▼
/jstack:pr-plan   → docs/jstack/<slug>/pr-plan.md               [human gate]
   ▼
/jstack:implement <pr-id>  → branch + commits, implementer agent, TDD
   ▼
/jstack:verify <pr-id>     → docs/jstack/<slug>/verification/<pr-id>/{report.md, rerun.sh, artifacts/}
   ▼
/jstack:build     → runs implement + verify for every PR in dependency order, stops at any red
```

Each stage has a check script under the owning skill's `scripts/` and the command refuses to hand back until the check is clean.

### Commands (user entry points)

| Command | Input | Output | Agents used |
|---|---|---|---|
| `/jstack:init` | repo | `docs/jstack/repo-profile.md` | jstack-explorer |
| `/jstack:plan <requirement text or path>` | requirement, design, repo profile | `implementation-plan.md` | jstack-explorer (grounding), jstack-planner (write), jstack-reviewer (plan review) |
| `/jstack:pr-plan [plan path]` | implementation plan | `pr-plan.md` | jstack-splitter, jstack-reviewer |
| `/jstack:implement <pr-id>` | pr-plan + implementation plan | branch, commits | jstack-implementer |
| `/jstack:verify <pr-id>` | branch, pr-plan | verification bundle | jstack-verifier |
| `/jstack:build [pr-ids]` | pr-plan | all of the above in order | coordinator in main chat, delegates above |
| `/jstack:help` | question | which command fits | none |

### Skills (how each artifact is made)

| Skill | Owns |
|---|---|
| `implementation-plan` | Plan template, sequence diagram rules, `scripts/check-plan.mjs` |
| `pr-plan` | PR plan template, split heuristics, `scripts/check-pr-plan.mjs`, `scripts/pr-size.sh` |
| `verification-bundle` | Report template, `rerun.sh` template, `scripts/check-verification.mjs` |
| `sequence-diagrams` | Mermaid conventions to class and method level, shared by plan and review |
| `repo-profile` | How to interview a repo and write `repo-profile.md` |
| `jstack-principles` | The short principle set every agent reads (sequence verifiable units, prove it works, never self-verify, small diffs, model the domain) |

### Agents (the team)

| Agent | Model intent | Tools | Role |
|---|---|---|---|
| `jstack-explorer` | fast, read-only | Read, Grep, Glob, Bash (no edits) | Grounds a plan in real file paths, signatures, call chains, test commands |
| `jstack-planner` | strongest | Read, Write, Bash | Writes the implementation plan from grounding + design |
| `jstack-splitter` | strong | Read, Write, Bash | Writes the PR plan |
| `jstack-implementer` | code model | all | Implements one PR slice with TDD, commits small |
| `jstack-verifier` | strong, independent | all except editing product code | Runs tests, captures artifacts, writes report and rerun script, never edits source |
| `jstack-reviewer` | strongest | read-only | Reviews a plan or a diff against the plan, returns findings only |

Model choice per role is the `model` field in each agent's frontmatter, so a user changes it by editing one file. Defaults: `opus` for planner, splitter, reviewer, and verifier; `sonnet` for explorer; `inherit` (the session model) for the implementer. A rules file like pstack's `setup` step is deferred; it adds a moving part before the pipeline has proven itself.

### Artifact 1. Implementation plan

Path: `docs/jstack/<slug>/implementation-plan.md`. Sections, in order, all mandatory:

1. **Summary.** Under 12 lines. Who it is for, what changes for them, the smallest change that meets the requirement.
2. **Scope.** In, out, assumptions. Each assumption marked as from the design or the planner's call.
3. **Grounding.** File pointers with line numbers for every touched module, the conventions found (DI style, error handling, test layout), the exact test, lint, build commands from the repo profile.
4. **Data shapes.** New or changed types, enums, DB columns, API payloads. The organising structure chosen (state machine, table, typed model) and why.
5. **Sequence diagrams.** One Mermaid `sequenceDiagram` per user-visible flow or error path. Participants are classes or modules by their real name. Each message is `method(args): ReturnType`. Alt and loop blocks for branches. A diagram id `SD-n` and a one-line caption.
6. **Change table.** One row per class and method. Columns: id `C-n`, file, class, method with signature, change type (add, modify, delete), responsibility in one line, diagrams it appears in.
7. **Test plan.** One row per change row. Columns: change id, test file, test case names, kind (unit, integration, e2e), what observable behaviour it asserts.
8. **Risks and rollbacks.** Each with the change id it lands in.
9. **Open questions.** Only product or preference calls. Anything observable is settled by reading code or a prototype first.

`check-plan.mjs` verifies: all headings present in order, every `C-n` referenced by at least one `SD-n` and vice versa, every `C-n` has a test row, every file path in the change table exists for modify and delete rows, summary under 12 lines, no empty placeholders (`<...>`).

### Artifact 2. PR plan

Path: `docs/jstack/<slug>/pr-plan.md`. Sections:

1. **Stack overview.** Table of PRs in merge order. Columns: id `PR-n`, title (Conventional Commits), depends on, change ids, estimated LOC, kind (scaffold, logic, wiring, cleanup).
2. **Dependency graph.** Mermaid `graph TD`.
3. **One section per PR.** Goal in one sentence, change ids, files, tests included, verification command, review focus (what the reviewer should look at), what is observable after merge, rollback.
4. **Sequencing rationale.** Why this order proves itself. Types and scaffold first, failing test then fix, wiring and flag flip last.

Split heuristics the splitter follows: group by dependency layer, then by file ownership, never split a method from its unit test, keep a PR to one reason to change, keep every PR green and deployable on its own, put the feature flag or route wiring in the last PR.

`check-pr-plan.mjs` verifies: every `C-n` from the plan appears in exactly one PR, every PR has at least one test, estimated LOC under 500, dependency graph is a DAG and matches the per-PR `depends on`, titles are Conventional Commits. `pr-size.sh <base> <head>` reports actual changed lines excluding lockfiles and generated files, used by verify.

### Artifact 3. Verification bundle

Path: `docs/jstack/<slug>/verification/<pr-id>/`.

- `report.md`. Sections: PR and SHA verified, commands run with exit codes, test summary (passed, failed, skipped), coverage for touched files when the repo produces it, actual LOC against budget, plan conformance (each change id present, deviations listed), live check evidence (request and response or CLI transcript) when the PR exposes behaviour, verdict `PASS` or `FAIL` with the first blocking finding.
- `rerun.sh`. Executable. Checks out the SHA, installs with the repo's lockfile command, runs the same test and live commands, writes fresh output next to the recorded artifacts, and exits non-zero on any mismatch in pass or fail status. Idempotent and safe to run on a clean clone.
- `artifacts/`. Raw stdout and stderr of every command, JUnit or JSON reporter output when available, coverage summary, response bodies, screenshots when a UI exists.

`check-verification.mjs` verifies: report cites every file in `artifacts/` and every cited file exists, `rerun.sh` is executable and passes `bash -n`, report records a SHA that exists in the repo, verdict line present, and the verifier recorded one actual execution of `rerun.sh` with its exit code.

The verifier agent never edits product code. If a test fails, the report says FAIL and the coordinator hands the finding to a fresh implementer.

### Human gates

`/jstack:plan` and `/jstack:pr-plan` stop after their check script passes and print the path plus a five-line summary. `/jstack:build` starts only on explicit go and stops at the first FAIL. The operator can pass `--no-gate` to run the whole pipeline (used for overnight runs).

## Decisions made in this design

- Claude Code plugin, repo doubles as marketplace. Chosen so install is one command on any machine.
- Mermaid, not PlantUML. Renders in GitHub, GitLab, and Claude Code's markdown.
- Artifacts in the target repo under `docs/jstack/`, not in the plugin or home dir. Reviewable in the same PR, survives machine changes.
- 500 lines counts tests and excludes lockfiles and generated code. Measured with `git diff --numstat` filtered by a small deny list.
- Verifier is a separate agent with no write access to product code. This is the single most important role separation.
- Check scripts are plain Node, no dependencies, tested with `node --test`.

## Decisions from the builder check

A reviewer read this document cold and asked eight questions. The answers are decisions, marked as the author's call.

1. **Where the design comes from.** `/jstack:plan` takes `--design <path>` when one exists. When none is given, the planner drafts the `Design` section of the plan (approach, alternatives rejected) from the requirement and the code, and labels it `Source: planner's draft`. The human gate after `/jstack:plan` then reviews the design and the plan together. Bare TODOs in the exercise repos are therefore usable inputs.
2. **Git topology.** The stack is branch based. `/jstack:plan` and `/jstack:pr-plan` commit their artifacts on `jstack/<slug>/plan`, branched from trunk. That branch is the stack root and is itself a reviewable docs-only PR. `PR-1` branches from the plan branch. `PR-n` branches from the tip of the branch it depends on, or from the plan branch when it depends on nothing. `base` for `pr-size.sh`, the verifier's baseline, and `rerun.sh` is always the parent branch tip, recorded as a SHA in the report. The verification bundle for `PR-n` is committed on `PR-n`'s own branch and excluded from its line count.
3. **Live checks without an environment.** The repo profile declares a `live` row: a boot command, or `unavailable` with a reason. When unavailable, the report's `Live evidence` section states `Live: unavailable (<reason>)` and the verdict may still be PASS. The human sees the gap in the report. The checker accepts either that line or at least one cited artifact in the section.
4. **Baseline cost.** The baseline run is cached per base SHA at `docs/jstack/<slug>/verification/baseline-<sha7>/` and reused by every PR on that base. `rerun.sh` re-runs the head suite by default and compares with the recorded head summary. `rerun.sh --with-baseline` re-runs both. The judged run is the full suite the profile marks as required. Focused runs on touched modules are extra evidence, never the verdict.
5. **Artifact size.** Artifacts are committed. Raw stdout and stderr are kept. Reporter output (JUnit XML, Jest JSON) is reduced to `artifacts/test-summary-<base|head>.txt` holding per-file counts and the names of failing tests, and the raw reporter files are not committed. The checker warns on any artifact over 200 KB.
6. **Addressing a PR.** `/jstack:implement` and `/jstack:verify` take `PR-n` when the repo has exactly one slug under `docs/jstack/`, otherwise `<slug>/PR-n` or `--slug <slug>`. With several slugs and no qualifier, the command lists the slugs and stops.
7. **Enforcing the verifier boundary.** The verifier's prompt forbids edits outside `docs/jstack/`. The `/jstack:verify` command enforces it after the fact. If `git status --porcelain` on the PR branch shows a change outside `docs/jstack/`, the command reverts those paths, marks the verdict FAIL with `Blocking: verifier modified product code`, and reports it. A `PreToolUse` hook that blocks the edit mechanically is a follow-up.
8. **Opening PRs.** `/jstack:verify --open-pr` and `/jstack:build --open-pr` open a PR with `gh pr create --base <parent branch>` after a PASS verdict. The plan branch PR targets trunk. Nothing merges.

## Left to the builder

- Exact wording of agent system prompts and skill prose.
- How `repo-profile.md` detects test runners for monorepos (start with package.json scripts, Makefile, CI yaml).
- Whether `/jstack:build` uses Claude Code's `Agent` fan-out or runs sequentially. Sequential by default, fan-out only for PRs with no shared dependency.
- The eval suite under `evals/` for `claude plugin eval`. Seed with one case per command.

## Baseline, not all-green

A real repo is rarely all green. acme-pass today has 334 unit tests, 232 of which fail in one parameterised `CommonUtilsTest` for reasons unrelated to any feature (country-name lookup). The verifier therefore records a baseline run on the merge base first, then the head run, and judges the PR on the delta. New failures block. Pre-existing failures are listed as such and never hidden. `rerun.sh` reproduces both runs.

## Exercise plan

Target: acme-pass (`/home/orca/src/acme-pass`, Java 11, Spring Boot 2.4, Gradle, JUnit 5, `./gradlew test --offline` works on this machine, master at `c2b2d58`). acmefnb is the second target once the first pass is clean. It is larger (4,833 files), needs Artifactory credentials and Docker for integration tests, so it is a better stress test than a first run.

After the plugin passes `claude plugin validate --strict`, install it from the local path and run the pipeline on acme-pass with a requirement taken from the repo's own TODOs. Candidates, in order of preference: the preferences endpoint move noted at `CustomerController.java:1233` (realistic multi-PR epic) and the customer cache on OTP verify noted at `OTPController.java:309` (small, all layers). Deliverables: the three artifacts committed on a branch in acme-pass, the check scripts green, at least PR-1 implemented and verified, and `rerun.sh` executed once by the verifier with its exit code in the report. Nothing is pushed.
