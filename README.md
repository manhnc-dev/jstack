# jstack

Requirement and design in. A reviewable implementation plan, a stack of sub-500-line PRs, and independently verified branches out. jstack is an agent plugin for Claude Code, Cursor, and Codex that runs an agent team with evidence at every step. It is inspired by [pstack](https://github.com/cursor/plugins/tree/main/pstack) and keeps its bet: go deep first, sequence work into verifiable units, prove it works against the real artifact.

## The three artifacts

**Implementation plan.** `docs/jstack/<slug>/implementation-plan.md`. A summary under twelve lines, Mermaid sequence diagrams at class and method level, a change table with one row per method, and a three-tier test plan: a unit row for every change, an end-to-end scenario table derived from the diagrams and the requirement, and component tests (MockMvc or Nest TestingModule with supertest, outbound dependencies stubbed) and blackbox tests (the built app booted as its own process, every external system stubbed) that between them cover every scenario. A lead reviews it in ten minutes. An agent codes from it. A checker refuses a plan with an orphan method, a missing test, an uncovered scenario, or a leftover placeholder. `skills/test-tiers/` defines the tiers with a recipe for Java/Spring and one for NestJS.

**PR plan.** `docs/jstack/<slug>/pr-plan.md`. The plan split into an ordered stack, each PR one reason to change, under 500 changed lines with its tests, with a dependency graph that must be acyclic and must match the table. Every change row lands in exactly one PR or the checker fails.

**Verification bundle.** `docs/jstack/<slug>/verification/PR-n/`. `report.md` with the base and head test summaries, the delta, measured size, plan conformance, and a verdict. `rerun.sh` that reproduces the head run and compares it. `artifacts/` with the size output, the reduced test summaries and the new-failure names; raw logs are cited, stay on the machine that ran them, and come back with `rerun.sh`. Every audit finding carries a disposition (`fix`, `park`, `dismissed`). Three workers that never touched the code produce it: a gates lane runs the suites and writes the bundle, two audit lanes read the diff against the plan, and one verdict comes out. A reviewer can re-run it on a clean clone.

## Install

One repository, three harnesses. The root is the Claude Code plugin and the source of truth. `harness/cursor` and `harness/codex` are generated from it (see Develop) and the repository root doubles as a marketplace for all three.

**Claude Code**

```bash
claude plugin marketplace add /path/to/jstack      # or the git URL
claude plugin install jstack@jstack
```

Or in one step on Claude Code 2.1.275 or later: `/plugin install jstack --marketplace manhnc-dev/jstack`.

**Cursor**

```bash
git clone https://github.com/manhnc-dev/jstack ~/src/jstack
mkdir -p ~/.cursor/plugins/local
ln -s ~/src/jstack/harness/cursor ~/.cursor/plugins/local/jstack
```

Reload Cursor (Developer: Reload Window) and confirm the `jstack-*` skills and agents under Customize. A team marketplace can import the repository instead; `.cursor-plugin/marketplace.json` points at the tree.

**Codex**

```bash
codex plugin marketplace add manhnc-dev/jstack   # or /path/to/jstack
codex plugin add jstack@jstack
```

Start a new session and run `$jstack-init` in your repo once. Codex plugins cannot ship subagents, so that first run installs the six jstack agents into `~/.codex/agents/` and asks you to start one more session.

No npm install anywhere. The check scripts use Node 20 built-ins only.

## Quick start

Shown in Claude Code spelling. Cursor and Codex use the same commands as skills, with these names:

| Claude Code | Cursor | Codex |
|---|---|---|
| `/jstack:init` | `/jstack-init` | `$jstack-init` |
| `/jstack:plan` | `/jstack-plan` | `$jstack-plan` |
| `/jstack:pr-plan` | `/jstack-pr-plan` | `$jstack-pr-plan` |
| `/jstack:implement` | `/jstack-implement` | `$jstack-implement` |
| `/jstack:verify` | `/jstack-verify` | `$jstack-verify` |
| `/jstack:verify-stack` | `/jstack-verify-stack` | `$jstack-verify-stack` |
| `/jstack:build` | `/jstack-build` | `$jstack-build` |
| `/jstack:help` | `/jstack-help` | `$jstack-help` |

```
/jstack:init                                  # once per repo: docs/jstack/repo-profile.md
/jstack:plan docs/req/cache-otp-customer.md   # plan on branch jstack/<slug>/plan, stop for review
/jstack:pr-plan                               # stack of PRs, stop for review
/jstack:implement PR-1                        # fresh implementer, test first, then verify
/jstack:verify PR-1                           # three fresh workers, evidence bundle, one verdict
/jstack:verify-stack                          # the feature end to end at the stack head, one row per scenario
/jstack:build --no-gate                       # the whole stack, unattended, stops at first FAIL, ends with verify-stack
```

`/jstack:help` routes you when unsure.

## The team

| Agent | Model | Writes | Job |
|---|---|---|---|
| `jstack-explorer` | sonnet | nothing | file pointers, signatures, call chains, test commands |
| `jstack-planner` | opus | the plan | sequence diagrams and change table from grounding |
| `jstack-splitter` | opus | the PR plan | stack under budget with tests per PR |
| `jstack-implementer` | session model | product code on one branch | test first, small commits, one PR only |
| `jstack-verifier` | opus | `docs/jstack/**` only | gates lane: base and head runs, component and blackbox tiers, size, conformance, report, rerun script |
| `jstack-reviewer` | opus | nothing | numbered findings with severity against plan, PR plan, or diff; audit lanes A1 and A2 at verify |

Change a model by editing the `model` field in `agents/<name>.md`. In Cursor and Codex the agents run on the session model; `docs/harness/cursor.md` and `docs/harness/codex.md` say how to pin one there.

## Artifact formats

The exact formats, with passing examples the checkers accept:

- Plan: `skills/implementation-plan/references/example-plan.md`, checked by `skills/implementation-plan/scripts/check-plan.mjs`
- PR plan: `skills/pr-plan/references/example-pr-plan.md`, checked by `skills/pr-plan/scripts/check-pr-plan.mjs`, sized by `skills/pr-plan/scripts/pr-size.sh`
- Bundle: `skills/verification-bundle/references/example-bundle/`, checked by `skills/verification-bundle/scripts/check-verification.mjs`

## Git topology

```
trunk
└── jstack/<slug>/plan        plan + pr-plan (a docs-only PR, the stack root)
    └── jstack/<slug>/pr-1    code + verification/PR-1
        └── jstack/<slug>/pr-2
```

A PR branches from the branch it depends on. Size and baseline are measured against that parent. jstack opens PRs with `--open-pr` and never merges.

## Principles

`skills/jstack-principles/SKILL.md` holds the eight rules every agent reads. Three are pstack's: sequence verifiable units, prove it works, model the domain. The rest are jstack's: never verify your own code, small diffs are a feature, diagrams carry the detail, never block on an observable fact, baseline before judging.

## Develop

```bash
npm test                          # node --test over scripts/ and skills/, then the harness freshness check
npm run build:harness             # regenerate harness/cursor and harness/codex from the root
claude plugin validate --strict . # manifest, commands, agents, skills
```

Edit only the root: `commands/`, `agents/`, `skills/`, `docs/harness/`. The generator turns commands into `jstack-<cmd>` skills, rewrites agents for Cursor (`model: inherit`, `readonly` for roles that never write) and Codex (custom-agent TOML plus an installer), and refuses any Claude Code name a harness adapter does not map. Commit the regenerated trees; `npm test` fails while they are stale.

See `docs/guide/README.md` for a first run and `docs/superpowers/specs/` for the design.

## Credits

pstack by Lauren Tan (poteto) for the principles and the multi-phase plan shape. MIT.
