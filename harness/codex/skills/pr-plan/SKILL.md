---
name: pr-plan
description: Split a checked implementation plan into a stack of dependent PRs under 500 changed lines each, with a Conventional Commits title, tests, a verify command, and a rollback for every PR, then prove the split with the checker.
---

# pr-plan

Turn `docs/jstack/<slug>/implementation-plan.md` into `docs/jstack/<slug>/pr-plan.md`. Every change row `C-n` from the plan lands in exactly one PR. Every PR is green and deployable on its own.

## Inputs

- The implementation plan at `docs/jstack/<slug>/implementation-plan.md`. It must already pass `check-plan.mjs`.
- `docs/jstack/repo-profile.md` for the test command and the line budget when the repo overrides the default of 500.
- The template at `references/pr-plan-template.md`. A filled example is at `references/example-pr-plan.md`.

## Split heuristics

1. Group by dependency layer first, then by file ownership. A PR that touches one module is easier to review than one that touches three.
2. Never separate a method from its unit test. The unit row for `C-n` travels with `C-n`. A component test `CT-n` or blackbox test `BB-n` travels with the PR that makes its scenarios reachable: the route registered, the module wired, the flag on. A blackbox test cannot pass against a route the booted app does not serve, so the registration lands in the same PR as the first route it serves, never in a PR of its own.
3. One reason to change per PR. If the goal sentence needs "and", split again.
4. Each PR is green and deployable alone. No PR may depend on a later PR.
5. Order the stack as types and scaffold first, failing test then fix, wiring and flag flip last. New units with no caller go early. The change that alters a request path goes last.
6. A PR over 500 estimated lines is split again before anything is written. When an estimate is within 50 lines of the budget, name a fallback in the PR section, and make it move work forward only, into this PR's own split or a later PR: by the time the fallback is needed every earlier PR is implemented and verified, so a fallback that reshapes one is unusable.
7. Kinds are `scaffold` for new units with no caller, `logic` for behaviour inside existing units, `wiring` for the change that connects the behaviour to callers, routes, or flags, and `cleanup` for removals after the flip.

## LOC estimation rule

Calibrate against the repo, never against a fixed number. Open one existing method of the same shape as each change row (a handler, a service method, a mapper) and count its lines. Open one existing test case of the same style and count its lines. Use those counts per row. Add the file header, imports, and class declaration for each new file (about 25 lines in Java, 5 in TypeScript). Round up to the nearest ten.

When the repo has no comparable code, the floor is 8 lines per `add`, 4 per `modify`, 2 per `delete`, times 1.5 for tests, plus 10 per new file. That floor fits terse languages. Verbose languages such as Java and C# run two to three times higher, which is why the calibration step comes first.

Write the basis under the stack table as `Estimate basis:` with the reference methods you counted, so a reviewer can redo the arithmetic. The estimate is a planning number. `pr-size.sh` measures the real diff later and the verifier compares the two.

## Branch rule

Plan artifacts live on the branch `jstack/<slug>/plan`, branched from trunk. `PR-n` branches as `jstack/<slug>/pr-n` from the tip of the branch it depends on, or from the plan branch when it depends on nothing. The stack overview therefore lists PRs in a valid topological order, so each row appears after every row it depends on. Implementers read the table top to bottom and branch in that order.

## Steps

1. Read the implementation plan. List every `C-n` with its file, change kind, test row, and diagrams.
2. Group the rows with the heuristics above. Give each group a kind and a Conventional Commits title with no trailing period.
3. Estimate lines per group with the rule above. Split any group over budget.
4. Fill `references/pr-plan-template.md`. Write the stack overview, the `graph TD` dependency graph, one `### PR-n: <title>` section per PR with all eight bold labels, and the sequencing rationale. Leave no `{{...}}` placeholder.
5. Run the checker and fix every reported line until it exits 0.
   `node scripts/check-pr-plan.mjs docs/jstack/<slug>/pr-plan.md --plan docs/jstack/<slug>/implementation-plan.md`
6. Hand the plan to `jstack-reviewer`. Apply its findings and run the checker again. Every finding, `should` and `nit` included, ends in `docs/jstack/<slug>/findings.md` with a disposition (`fixed:`, `park:`, `dismissed:`); a `should` about the shape of the stack gets a fresh split, not a note.
7. Reply with the artifact path, the stack overview table, and any question the split could not settle.

## Format

- Required H2 headings in order are `Stack overview`, `Dependency graph`, `PRs`, `Sequencing rationale`.
- Stack overview table headers are `ID | Title | Depends on | Changes | Est. LOC | Kind`. `Depends on` is `-` or a comma list of `PR-n`. `Changes` is a comma list of `C-n`.
- The dependency graph is a `mermaid` fence starting `graph TD`. An edge `PR-1 --> PR-2` means PR-2 depends on PR-1. The edge set must equal the table's dependencies. A plan with no dependencies lists only nodes.
- Each PR section carries `**Goal.**`, `**Changes.**`, `**Files.**`, `**Tests.**`, `**Verify.**`, `**Review focus.**`, `**Observable.**`, and `**Rollback.**`, each at the start of its own line. `Tests.` may not be empty or `none`, and it names the `CT-n` and `BB-n` ids the PR delivers, each with its file. The `Verify.` command of a PR that carries `CT-n` or `BB-n` runs them.

## What the checker enforces

`scripts/check-pr-plan.mjs <pr-plan.md> [--plan <implementation-plan.md>] [--budget 500]` exits 1 with one `file:line: message` per problem. It fails on a remaining placeholder, a missing or misordered heading, a change id in two PRs or in none, a change id the plan does not have, a title that is not Conventional Commits, an estimate over budget, an unknown kind, a dependency on an unknown PR, a dependency cycle named as a path, a graph that disagrees with the table in either direction, a PR without a section or a section without a table row, a missing bold label, an empty `Tests.` label, and, when the plan has component and blackbox tables, a `CT-n` or `BB-n` in two PRs or in none, or one the plan does not have.

`scripts/pr-size.sh <base-ref> <head-ref> [--budget N] [--repo PATH]` measures the real diff. It prints `added=<n> deleted=<n> total=<n> budget=<n> status=OK|OVER` and then one `<added>\t<deleted>\t<path>` line per counted file. Lockfiles, minified assets, snapshots, generated directories, and `docs/jstack/**` are excluded. It exits 0 when OK and 3 when OVER. The verifier runs it against the parent branch tip.

## Output path

`docs/jstack/<slug>/pr-plan.md`, where `<slug>` is the same kebab-case slug the implementation plan uses.
