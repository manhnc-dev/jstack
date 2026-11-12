# Exercise: jstack and pstack on the same feature, second run

Date: 2026-11-05 to 2026-11-06. Repo: reserve-backend at `develop` `52a62a299` (NestJS 8, TypeORM 0.2.28, Jest 29, Node 22.23.2). Feature: three routes under `/api/v1/operation-notes` (range read, per-date PUT, per-date soft DELETE) sharing the existing upsert, old routes unchanged, no schema change. Requirement text: the same 41-line file for both runs, with a rules table, a Done line, and an out-of-scope list. First run on acme-pass: `2026-10-31-jstack-vs-pstack.md`.

## Method

Same shape as the first run: two clean worktrees from one commit, two coordinating agents started in the same minute, same machine, same requirement, same hard rules (no push, no `gh`, no questions, worktree only, commit everything, numbers only from runs). Differences from the first run:

| | pstack run | jstack run |
|---|---|---|
| Worktree | `/home/orca/src/reserve-backend-worktrees/compare-pstack` | `…/compare-jstack` |
| Branches | `pstack/operation-notes/1-pin-reservation-routes` … `4-delete-note`, record on `5-run-record` | `jstack/operation-notes-v1/plan` → `pr-1` … `pr-6` |
| Tool | pstack 0.15.36 through its Claude Code adapter, `pstack:poteto-agent` and `pstack:comment-sicko` native | jstack 0.1.0 at `32d2a68` (three-worker verify), all six `jstack:jstack-*` agent types native this time |
| Verification | gates lane running `verify-pr.sh`, audit A1 (contract, HTTP probes, mutants), audit A2 (design), comment-sicko, per PR | gates lane `jstack-verifier`, audit A1 and A2 as `jstack-reviewer`, per PR |

**What went wrong with the method.** The machine has 11 GB of memory and 6 cores. `npm test` spawns five jest workers of about 1.5 GB each. Two full suites at once exhausted memory, and the Claude Code session died three times (2026-11-05 about 14:55Z, 2026-11-06 about 10:05Z and about 12:05Z), killing every in-flight worker each time. Both coordinators were resumed from their transcripts after each restart. After the third restart, pstack finished within 43 minutes; jstack's coordinator handed back at PR-3 of six when the harness started killing shells for memory, and was resumed alone after pstack ended, so jstack's last four PRs ran with the machine to itself. Wall-clock time is therefore reported per stretch, not as one number, and the tools were not under equal load for the whole run. The baseline measured before the start: 25 failed tests in 4 suites on the untouched base (a pre-existing mock gap in the acme-eats tests plus one load-sensitive PDF test), 188 s.

**Lost workers.** pstack reported 12 of 36 subagents lost to restarts, including 5 of 8 gates lanes; its coordinator ran the PR 3 and PR 4 gates script itself. jstack reported 3 of 34 lost plus 2 discarded, all in PR-2 verification; its coordinator ran PR-2's `rerun.sh` itself once. Both disclosed this in their reports and on disk.

**One permission event.** The classifier refused pstack's `git commit --no-verify` (the repo's husky hook runtime file is absent). pstack copied `node_modules/husky/husky.sh` into `.husky/_/` so the hook could run as written, which its own trail reviewer flagged as equivalent to the refused bypass. Nothing under `.husky` was committed and the hook's only step is commented out. jstack's `--no-verify` commits were not refused. The two runs were therefore not gated identically on commits, and the pstack workaround is left for the human to judge.

## Criteria

The seven from the first run: plan reviewability, decomposition, tests, verification evidence, correctness against the requirement, process cost, what a human still has to do. Scored from the disk and from re-runs I made after both runs ended, not from either self-report; where they disagree the disk wins and the disagreement is noted.

## Results

### pstack

**Route taken.** `poteto-mode` → `figure-it-out` composing the Feature playbook with Autopilot-stack. Leaf skills: how (one explainer), architect (arena, two candidates, cross-judge skipped because the other-family pool is `grok-*` slugs the Agent tool cannot run), a prototype that measured the global `ValidationPipe` answering 422 before any route pipe, swarm (gates plus A1 plus A2 per PR), comment-sicko per PR, show-me-your-work, a cross-model trail review (same family, disclosed).

**Plan.** `docs/pstack/operation-notes/` on the record branch, 22 files, 1,627 lines. A lead reads `README.md` 27, `playbook.md` 84 (todo list with `skip:` lines and a definition of done revised after the trail review), `grounding.md` 60, `arena/synthesis.md` 37: 208 lines. The two arena candidates add 977. PR bodies 27 to 33 lines each, `verification.md` 53, `decisions.tsv` 49 rows. No sequence diagrams, no change table, no checker. The design (parse functions producing branded `CalendarDate` and `DateRange` types, controller params typed `unknown`, one-statement handlers) was picked by a six-criterion rubric in the synthesis.

**Decomposition.** Four stacked PR branches, each leaving a callable route, plus a docs-only record branch.

| Unit | Head | Code lines (excl. docs) | Commits |
|---|---|---|---|
| PR 1 pin old routes over HTTP | `3b66e665e` | 1 file, +112 | 1 |
| PR 2 GET range | `7e8e13dea` | 6 files, +200 / -8 = 208 | 2 |
| PR 3 PUT | `15052ca92` | 3 files, +125 / -3 = 128 | 1 |
| PR 4 DELETE and old-route pins | `fb8cef2d5` | 4 files, +138 / -8 = 146 | 2 |
| record | `491b73adb` | 22 files, +1,627, all under `docs/pstack/` | 3 |

Whole stack +561 / -5 across 6 files, all under `src/modules/operation-notes/`. PR 1 was amended after PR 2 and PR 3 had branched, so a restack happened after the first restart. The old-route pin tests ride PR 4 rather than PR 1 (decision 8, reversible sentence recorded).

**Tests.** 50 module cases at the head (my run, 2 suites, 22 s), 8 → 22 → 36 → 50 per PR. One HTTP spec, `operation-notes.routes.spec.ts`, with the real module, the real service over a mocked repository, the production global pipe and filter, the real permission guard, pins on the old routes' behaviour (permission set, whitelist stripping, lenient dates, `{}` body as raw text), 403 on a token outside basic and pro. Coverage 100 on all four columns for the service, the helper, and the v1 controller at every head (my re-run confirms at the stack head). Failing-before shown by mutants in A1: 9 mutants on PR 1 (6 caught, the 3 survivors pinned in PR 4), 3 on PR 2, 5 on PR 4, each mutation failing exactly the test that guards it.

**Verification.** Per PR: gates lane running `verify-pr.sh` (module tests, three coverage files, eslint and prettier on changed files, build, scope and untouched checks, full suite with a failing-test delta against the base log and a solo rerun of any delta suite), A1 with HTTP probes (51, 76, 51, 35 per PR) and mutants, A2 rerunning every PR body claim, comment-sicko (zero kills, one comment kept under the vendor exception). Verdicts CLEAN on all four. Weak points, all disclosed by the run itself: 5 of 8 gates lanes were lost to restarts and the coordinator ran the script for PR 3 and PR 4; the coordinator had edited one `@ApiQuery` line and one assertion, so it is not fully separate from the code; the committed `verify-pr.sh` postdates the recorded runs; about ten trail rows rest on reports that exist only in the transcript. My independent run of the committed `verify-pr.sh` at `fb8cef2d5` with `--full` on the idle machine: every gate PASS, full suite 25 failed / 8,091 passed with the delta suite passing alone, `verdict: PASS`, exit 0, 6 min 2 s.

**Correctness.** All three routes, the 400 rules with bodies naming the parameter or rule, 204 on a missing note, trim at the boundary, the shared upsert called with a literal, soft delete guarded with `deletedTimestamp: IsNull()` so a repeated DELETE never re-stamps a deleted row, old controller and DTOs byte-identical. The 31-day rule is implemented as a strict 30-day span. Open question recorded: no migration creates `operation_notes`, so a unique key on `(outlet_id, date)` would make rule 4 (PUT after DELETE inserts) fail with a duplicate key. Lint gate narrowed to changed files because the base has 121 eslint errors elsewhere (jstack counted 69 with `npm run lint`; the two counts come from different invocations).

**Cost.** Start 13:32:34Z, end 16:41:54Z the next day across four stretches: about 80 min before the first restart, 29 and 7 min in the two short stretches, 43 min after the third resume. About 2 h 40 min active. 36 subagents (12 lost): 1 explainer, 2 arena runners, 5 implementers, 4 comment-sicko, 8 gates lanes, 8 A1, 7 A2, 1 trail reviewer. Models: opus xhigh for prose and judgment roles, session model for code (pstack's default `grok-4.7-xhigh-fast` does not exist here). Skipped in Claude Code: `/deslop`, `/loop 1h`, Bugbot and babysit, control skills; skipped by judgment: arena cross-judge, interrogate (candidates converged).

**Left for a human.** Open four PRs bottom-up (bodies ready), decide whether the record branch opens as a fifth; land PR 4 even if DELETE is held because the pins ride it; check the live schema for the unique key; judge the husky restoration and the narrowed lint gate; optionally rerun `verify-pr.sh` from a fresh checkout; ten non-blocking follow-ups from the lanes (UTF-16 length versus code points, year 0000 accepted, a lone zero-width space passes trim, missing path date is a 404, no 403 test on PUT or DELETE, brand JSDoc dropped, and four more).

### jstack

**Route taken.** `/jstack:init`, `/jstack:plan --slug operation-notes-v1`, `/jstack:pr-plan`, `/jstack:build --no-gate`, all agent types native. Reviewer at the plan gate: 3 should, 4 nit, 0 block. Reviewer at the PR-plan gate: 4 should, 2 nit, 0 block, one of them that the six-PR split over-splits. Both gates passed as written because the commands revise only on block.

**Plan.** `docs/jstack/operation-notes-v1/implementation-plan.md` 283 lines: 4 sequence diagrams, 22 change rows (C-1 to C-22) with file and signature, 11 test rows keyed by change with cases and assertions, data shapes, risks, one open question (the unique key, the same one pstack found). `pr-plan.md` 178 lines, six PR sections each with Goal, Files, Tests, Verify and Rollback. Repo profile 58 lines with the baseline line. A lead reads 519 lines. Both checkers exit 0 first round. The plan has no "decided, say X to reverse" lines; the coordinator's report has fourteen.

**Decomposition.** Six stacked branches, each followed by a bundle commit.

| Unit | Head (incl. bundle) | Code lines (excl. docs) | Code commits |
|---|---|---|---|
| PR-1 calendar date helper | `773e6f4ce` | 2 files, +68 | 2 |
| PR-2 calendar date pipe | `018702f8e` | 2 files, +51 | 1 |
| PR-3 v1 controller with GET range | `77fa7e022` | 4 files, +268 / -4 = 272 | 2 |
| PR-4 PUT | `d39e169fb` | 4 files, +162 / -3 = 165 | 2 |
| PR-5 DELETE | `7ba0f73c1` | 4 files, +74 / -4 = 78 | 2 |
| PR-6 register the controller | `f422b1c00` | 2 files, +13 / -1 = 14 | 1 |

Whole stack +629 / -5 across 9 files, all under `src/modules/operation-notes/`. One commit per change row. Bundles: 154 files and 15,311 lines under `docs/jstack/` at the stack head, about 2,400 lines and 1.7 MB per PR (full test logs for base and head, lint and build logs, reduced summaries) plus six `baseline-<sha7>/` caches. The controller is not registered until PR-6, so PR-3, PR-4 and PR-5 add routes that no request can reach until the 14-line last PR lands; the reviewer's should finding said so and was not acted on.

**Tests.** 84 module cases at the head (my run, 4 suites, 22 s): helper spec, pipe spec, service spec (6 new cases per route plus the existing three), and `operation-notes-v1.controller.spec.ts` through `Test.createTestingModule`, `app.init()` and supertest with `overrideGuard`, in a `describe.each` over two setups (a bare app and a mirror of `main.ts` with the global pipe and filter), asserting status and body for every rule, 403 with a bad permission, excluded keys absent. Red-then-green per change row was reported by every implementer (the spec seen failing with a compile error before the code). Coverage 100 on all four columns for the service and the v1 controller at every head from PR-3 on. No pin tests on the old routes; their unchanged behaviour is proven by the verifier's byte-identical check on the old controller and DTOs instead.

**Verification.** Six bundles, each `report.md` (97 to 145 lines), `rerun.sh` (109 lines), `artifacts/`, and the `Audits` section with twelve lane lines. `check-verification.mjs` exits 0 on all six (my run). Gates lane per PR: base and head suites in detached worktrees with `node_modules` symlinked, lint on base and head, build, coverage, size, plan conformance, `rerun.sh` run once. `rerun.sh` printed `RERUN MATCH` on PR-2, PR-4 and PR-6 and `RERUN MISMATCH` with exit 2 on PR-1, PR-3 and PR-5, every mismatch the same load-sensitive PDF timeout, settled by solo runs on base and head and recorded as such; the verdicts stayed PASS. Audits: 17 findings over 12 lanes, 0 block, 2 should (PR-6 A1: no module-level smoke test, no pro-token case; parked to the human), 15 nit, each with a disposition, and two parked nits were applied by the next PR's implementer. Baseline caches were reused across PRs when the base differed from the previous head by docs only (D10, stated per report). My independent run of PR-6's `rerun.sh` at `f422b1c00` on the idle machine: `Head: passed=8126 failed=24`, `RERUN MATCH`, exit 0, 2 min 59 s.

**Correctness.** All three routes, 400 bodies naming the parameter, 204 on a missing note, trim then the shared upsert, `OperationNote` instances through the serializer, old files byte-identical. Soft delete is `softDelete({ outletId, date })` without a live-row guard, so a second DELETE after a PUT re-stamps the earlier deleted row; the requirement does not forbid it, pstack guarded it anyway. The R3 message reads `range from from to to must not exceed 31 days`, a reviewer nit kept as the contract string. Same open question on the unique key; same lint impossibility (69 pre-existing errors by `npm run lint`), judged on the delta.

**Cost.** Start 13:32:34Z, end 18:28:22Z the next day across five stretches: about 80 min before the first restart, 29 and 7 min, 30 min to the forced handback at PR-3, then 104 min alone for PR-3 verification through PR-6. About 4 h 10 min active, the last 104 min with the machine to itself. 34 subagents listed (3 lost, 2 discarded): 2 explorers, 1 planner, 2 reviewers at the gates, 1 splitter, 6 implementers, 8 verifiers, 12 audit reviewers. Models from the agent files. Strictly serial. Rework: none; `--fix` never ran.

**Left for a human.** Open six PRs plus the plan branch (no PR bodies); the unique-key question; a real-MySQL check that `find` excludes soft-deleted rows; the two parked should findings and the nits (module smoke test, pro-token case, `C-n` labels in test titles, the R3 wording); the pre-existing eslint errors; the PDF test's timeout.

## Comparison

| Criterion | pstack | jstack | Edge |
|---|---|---|---|
| 1 Plan reviewability | 208 lines plus 977 of arena material; rubric-scored design; no diagrams, rows, or checker | 519 lines; 4 diagrams, 22 change rows, 11 test rows, checkers clean; reviewer findings recorded, two gates passed with should findings unaddressed | jstack for detail, pstack for brevity (same as run 1) |
| 2 Decomposition | 4 PRs of 112 / 208 / 128 / 146, each a callable slice; pins ride PR 4; 1,627-line record branch | 6 PRs of 68 / 51 / 272 / 165 / 78 / 14, routes dark until the last PR; 15,311 lines of bundles | pstack |
| 3 Tests | 50 cases, one HTTP spec with the real module and guard, old-route pins, mutants prove the tests can fail | 84 cases, two app setups, unit specs for helper and pipe, red-then-green per row, no old-route pins | jstack for count and layering, pstack for proving the old routes and for mutation evidence |
| 4 Verification evidence | probes and mutants per PR, a committed gates script that re-runs clean, 49-row trail; 5 of 8 gates lanes lost, coordinator ran two | 6 structured bundles with audits and dispositions, checker-enforced, rerun scripts that re-run clean; evidence volume ten times pstack's; baseline reuse across PRs | pstack for depth, jstack for consistency; both re-run green independently |
| 5 Correctness | all rules; soft delete guarded on live rows | all rules; unguarded repeat DELETE; awkward R3 text | pstack, narrowly |
| 6 Cost | 36 agents, about 2 h 40 min active, 12 lost | 34 agents, about 4 h 10 min active (104 min solo), 3 lost | pstack, with the caveat that jstack ran its second half alone |
| 7 Human work left | 4 bodies ready, trail, follow-ups listed; husky and lint decisions | no bodies, 2 should and 13 nits parked, same schema and lint questions | pstack |

What this run shows that the first did not:

- **Both tools converged on the same design from the same measurement.** Both found that the production global `ValidationPipe` answers 422 before any route pipe, both dropped DTOs on the new routes, both validate dates with a regex plus a round-trip check, both call the unchanged upsert with a trimmed literal, both soft-delete through the entity's date column. pstack reached it by a prototype and an arena; jstack's planner reached it by reading `main.ts`. The arena cost 977 lines to confirm a choice one reader made.
- **Six PRs was too many, and jstack knew.** The reviewer said the split over-splits; the command passed it because the finding was a should. The result is three PRs that add unreachable routes and a 14-line final PR. The first run's finding, that should findings are correct and ignored, is now reproduced. This is the single change jstack needs most.
- **Evidence volume reversed.** In the first run jstack committed a third of pstack's evidence; here it committed ten times more. The cause is mechanical: six PRs times a base and head log plus six baseline caches. pstack kept logs in the scratchpad and committed the script that regenerates them. jstack should do the same.
- **Mutation evidence is the gap on the jstack side this time.** pstack's A1 lanes broke the code and showed which test went red; jstack's A1 lanes read the diff and reported nits. jstack's implementers did show red-then-green per change row, which is the same proof at write time, but nothing re-proved it at verify time.
- **Independence under failure.** When restarts killed gates lanes, pstack's coordinator ran the gates itself and said so; jstack's coordinator ran one `rerun.sh` itself and said so. Both reports are honest. jstack's structure held up better under interruption because every step commits a checked artifact, which is why its second-half resumes were cheap and pstack's needed a reconcile step and a restack.
- **The machine is part of the method.** Neither tool checks whether the suite it is about to run fits beside another one. jstack's `build` runs one PR at a time but its three workers each start jest; pstack's swarm ran the full suite in several lanes at once. Both repo profiles should record the suite's memory footprint and both builds should serialize suites.
- **Flaky suites are handled by scripts on one side and by prose on the other.** pstack's `verify-pr.sh` reruns any delta suite alone and counts it only if it fails alone; jstack's verifier did the same by hand and wrote three `RERUN MISMATCH` exits into reports that still say PASS. The rule should be in `rerun.sh`.

## What this changes in the adoption plan

Ranked, replacing the list at the end of the first exercise log where they overlap.

1. **Should findings get a disposition before the next command runs** (was item 2 of the first log; now reproduced twice). The splitter must answer "over-splits" with fix, dismiss with a reason, or park with an owner, and a fix re-runs the splitter.
2. **Splitter rule: a PR that adds a route must make it reachable.** A registration-only PR is folded into the PR that adds the thing it registers; a PR under 40 code lines needs a stated reason in its section. This would have made the stack four PRs.
3. **Evidence hygiene is now wave 1.** Commit `report.md`, `rerun.sh`, `size.txt`, the reduced summaries and `new-failures.txt`; keep full logs, lint and build logs out of the product repo behind the bundle `.gitignore`; one baseline cache per base SHA, never six.
4. **Flaky-suite handling in `rerun.sh`.** Any suite failing at head and not at base is rerun alone once and counts only if it fails alone; the script prints `RERUN MATCH` on that rule, so a PASS report never carries an exit 2.
5. **Mutation step in audit lane A1.** For each new branch the PR adds, break it once and name the test that went red; a branch with no red test is a `should`.
6. **Resource guard.** `init` records the suite's worker count and memory; `build` and `verify` never start a second full suite while one runs, and the three workers share one head run instead of each starting jest.
7. **PR body per PR** (unchanged from the first log; still missing).
8. **Old-route pin tests when a requirement says "unchanged".** A test row that asserts the old behaviour over HTTP, not only a byte-identical check.

Not changing: the plan's diagrams and change rows (again the more reviewable artifact), the per-row commits, the checker-enforced bundle, three workers per PR.

## Sources

- pstack: `docs/pstack/operation-notes/` on `pstack/operation-notes/5-run-record` `491b73adb` in `/home/orca/src/reserve-backend-worktrees/compare-pstack`; my re-run log and gate outputs in the session scratchpad `compare2/rerun-check/pstack-out/`.
- jstack: `docs/jstack/` on `jstack/operation-notes-v1/pr-6` `f422b1c00` in `/home/orca/src/reserve-backend-worktrees/compare-jstack`; my re-run log in `compare2/rerun-check/jstack-rerun-PR-6.log`.
- Requirement, briefs, baseline log and timestamps: session scratchpad `compare2/`.
- Coordinator final reports: in this session's transcript; numbers above that come only from them are marked as self-reported (subagent counts, per-PR probe counts, pstack's per-PR test counts).
