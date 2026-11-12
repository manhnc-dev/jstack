# Exercise: jstack and pstack on the same feature

Date: 2026-10-31. Repo: acme-pass at master `c2b2d58b` (Java 21, Spring Boot 2.7.18, Gradle 8.10.2, JaCoCo floor 0.98 enforced by `./gradlew check`). Feature: move the six customer-preference endpoints to `/api/v1/preferences` with the customer id taken from the access-token session, old endpoints unchanged, one shared implementation. Requirement text: the same 48-line file for both runs.

## Method

Two clean worktrees from the same commit, two coordinating agents started in the same minute, same machine, same JDK, same requirement, same hard rules (never push, never open a PR, never ask the user, run to completion).

| | pstack run | jstack run |
|---|---|---|
| Worktree | `/home/orca/src/acme-pass-worktrees/compare-pstack` | `/home/orca/src/acme-pass-worktrees/compare-jstack` |
| Start branch | `compare/pstack/preferences-api` | `compare/jstack/base` (jstack creates `jstack/preferences-api-v2/*`) |
| Tool version | pstack 0.15.36 from `cursor/plugins`, installed into Claude Code via its Claude adapter | jstack 0.1.0 from the local repo |
| How it was driven | coordinator reads `docs/harness/claude-code.md`, then `skills/poteto-mode/SKILL.md`, matches a playbook, follows it, spawns subagents as the playbooks say | coordinator follows `commands/init.md`, `plan.md`, `pr-plan.md`, `build.md --no-gate` in order, spawns the six jstack agents as the commands say |
| Human gates | pstack hands back after the plan for an explicit go; waived | jstack stops after plan and PR plan; waived |
| Guards | gh and git push forbidden in the brief; the session permission classifier also gates outward actions | same |

What this does not control: pstack was written for Cursor and ran through its adapter, so some steps were skipped with a `Skipped in Claude Code` line. jstack ran natively, except that the Agent tool did not expose the `jstack:jstack-*` subagent types, so each jstack agent was emulated by a general-purpose agent with the agent file pasted into its brief and the model taken from the file's frontmatter. Both coordinators were general-purpose subagents of the same session, on the same model, and neither was supervised during the run. Earlier the same feature had been built with jstack interactively (branches `jstack/preferences-api/*`); those branches were off limits to both runs.

## Criteria

Scored from the artifacts on disk and the agents' final reports, not from either tool's self-description.

1. **Plan reviewability.** Lines a lead must read before code is written, whether method-level detail is present (signatures, call order), and whether a checker refused anything.
2. **Decomposition.** Number of units (branches or commits a reviewer would review), changed lines per unit including tests, dependency order, whether any unit exceeded 500 lines.
3. **Tests.** Test files and cases added, whether the failing-before state was shown, coverage on head versus the 0.98 floor.
4. **Verification evidence.** Base and head suite results recorded, raw logs kept, a report a reviewer can read, a re-run script that was executed, whether the verifier was an agent that did not write the code.
5. **Correctness against the requirement.** The seven handlers (six endpoints, one of them POST and PUT), the admin and missing-session cases, the "No customer for this id" case, interceptor path coverage for the new routes.
6. **Process cost.** Wall-clock time, number of subagents spawned, rounds of rework, steps skipped.
7. **What a human would still have to do.** Open items, decisions made where the requirement was silent, anything left unfinished.

## Results

Both runs finished with every unit verified and nothing pushed. Every number below was re-read from the worktrees after the hand-backs; where a self-report and the disk disagreed, the disk wins and the disagreement is noted.

### pstack

**Route taken.** `poteto-mode` matched the multi-phase plan playbook, then autopilot-stack for execution, and "Opening a PR" per unit stopping at ready-to-open. Leaf skills run: how, architect (arena with two design candidates and a judge), swarm (three verifiers per PR), show-me-your-work, no-comments (Comment Sicko per PR), unslop, technical-writing.

**Plan.** `docs/pstack/preferences-api-plan.md`, 278 lines, three PR sections each with Files, Build, You see, Verify unit, Verify live (ten lanes), Verify perf, Merge boxes. `check-plan.mjs` exit 0, "3 PR sections, 0 problems". Written after a 52-line grounding file, a 117-line synthesized design, and two arena candidates (560 and 374 lines) plus an 18-line judge verdict. A lead who reads only plan and design reads 395 lines; the arena material is 952 more. The Build boxes name classes and methods (`ofPathCustomer(String, HttpSession)`, the `Authorized` operations) and the order to convert handlers in, but carry no sequence diagrams and no per-method test rows; the live lanes carry exact expected statuses and messages.

**Decomposition.** Three stacked code branches plus one docs commit.

| Unit | Branch | Code lines changed (excl. docs) | Commits |
|---|---|---|---|
| PR1 extract core | `pstack/preferences/pr1-core` `bbfdb14e` | 3 files, +128 / -116 = 244 | 1 |
| PR2 root routes | `pstack/preferences/pr2-root-routes` `ea56e71c` | 5 files, +288 / -1 = 289 | 1 |
| PR3 named routes | `pstack/preferences/pr3-named-routes` `75a037fe` | 4 files, +419 / -5 = 424 | 1 |
| docs | `compare/pstack/preferences-api` `ed9a36f0` | 238 files, +15,727, all under `docs/pstack/` (1.3 MB of evidence, added with `git add -f`) | 1 |

Whole stack +831 / -118 across 8 product and test files. Strict chain. No unit over 500. One commit per PR, so a reviewer reviews the PR as a whole.

**Tests.** PR1 adds none; the 27 existing tests in `CustomerControllerPreferencesTest` on the seven moved handlers pass with the file byte-identical at every head. PR2 adds `PreferencesControllerTest` (7 cases) and one case in `WebAndSecurityConfigTest`. PR3 adds 14 cases to `PreferencesControllerTest` and a new `PreferencesRoutesTest` (8 cases, standalone MockMvc, the repo's first). Suite grows 1901 to 1931. Failing-before was shown by red replay per PR: mutate the guard, record the exact tests that go red, restore (6 of 44 and 2 of 44 on PR1; 2 on PR2; the PUT mapping on PR3). The plan's prediction of which tests go red on PR1 was wrong and was corrected afterwards. Coverage LINE 0.9892 at the stack head, missed lines 81 at every head.

**Verification.** Three fresh workers per PR who did not write the code: L runs the gate in a detached worktree plus ten live lanes and a perf lane, A1 and A2 audit contract and design. Live lanes are a MockMvc probe over the real controllers and the real interceptor patterns with mocked services, sampled trunk, head, trunk, and each probe was mutated once to show it can fail. Verdicts CLEAN, CLEAN, CLEAN. Base and every head recorded with tests, failures, LINE covered and missed. Report `docs/pstack/verification-report.md`, 58 lines, with a re-run table. Lever `docs/pstack/verify.sh` re-runs the gate and the probes at every head; a fresh agent that wrote none of it ran it, `RESULT PASS`, exit 0, 11m 18s, output under `evidence/rerun/`. Trail `docs/pstack/decisions.tsv`, 95 rows, every decision with why, evidence and result. Weak points the audit itself logged: owner per-class counts rest on logs that print only `BUILD SUCCESSFUL`; swarm reports live in chat, not on disk; perf wall-time ratios were measured under concurrent gradle runs.

**Correctness.** Six handlers on `PreferencesController` at `api/v1/preferences`, `{preference-name}` mapped to POST and PUT. Interceptor pattern `/api/v1/preferences/**` added and asserted in `WebAndSecurityConfigTest` and in live lane 9. Admin session and blank or missing session are refused before any lookup; unknown customer gets `BadRequestException("No customer for this id")`. Deviation from the requirement's Done line: the refusal answers HTTP 400 with `AUTHORIZATION_ERROR`, not 401, on the reasoning that the requirement also says "the existing UnauthorizedException response" and the old handlers turn that exception into 400. Recorded with the words to reverse it. Scope beyond the table: the seventh old handler `retrieveLikedPreference` was moved onto the core in PR1 (no new route). `PreferencesRoutesTest` has no missing-session row.

**Cost.** 05:16:41Z to 07:16:11Z, 1h 59m 30s. 22 subagents: 1 explorer, 1 how explainer, 2 arena runners, 1 judge, 3 owners, 9 swarm workers, 1 fresh re-runner, 1 trail reviewer, and 3 Comment Sicko agents spawned by the owners. Owners ran one at a time because PR1/PR2 share one file; PR2 and PR3 were started before the verdict on the PR below landed. Rework: a PR2 class-wide `@SuppressWarnings` was replaced inside PR3; three doc sentences corrected by audits. Four `Skipped in Claude Code` lines: `/deslop`, Bugbot triage and babysit, the `/loop 1h` tick, the control-skill lookup.

**Left for a human.** Confirm 400 versus 401 on the new routes. Decide on the seventh endpoint. Decide whether a 15,727-line evidence commit belongs in the product repo. Parked follow-ups: duplicate session read in `CustomerPreferences`, `assertNoCustomer` does not check the error type, routes test lists the seven routes twice and lacks a missing-session row, the `ExceptionHandlerAspect` opt-in and typed PATCH body reshapes, a staging smoke test with real tokens. Three PR bodies (32 to 33 lines each, Why / What changed / Scope / Tradeoffs / Blast Radius / Verification) are ready to paste.

### jstack

**Route taken.** `/jstack:init`, `/jstack:plan --slug preferences-api-v2`, `/jstack:pr-plan`, `/jstack:build --no-gate`, in order, with the agent roles emulated as described under Method.

**Plan.** `docs/jstack/preferences-api-v2/implementation-plan.md`, 421 lines: 8 sequence diagrams, 25 change rows (C-1 to C-25) each with file, signature and the diagram it serves, 25 test rows naming class, case and assertion. `pr-plan.md`, 126 lines, four PR sections with change list, test list, and a Verify line. Repo profile 55 lines with the baseline line `Run on 2026-10-31 at c2b2d58b: passed=1901 failed=0 skipped=0`. A lead reads 602 lines. Both checkers exit 0 first round. Reviewer on the plan: 7 findings, 0 block, 2 should, 5 nit. Reviewer on the PR plan: 4 findings, 0 block, 2 should, 2 nit. The should findings (PR-1 ships the new access mode with its tests only in PR-4; the interceptor returns 400 before the controller when the header is missing; PR-3 claims old tests cover a path no test stubs; PR-1 is titled refactor but adds policy) were never acted on, because the commands revise only on block.

**Decomposition.** Four stacked branches, each followed by a bundle commit.

| Unit | Branch | Code lines changed (excl. docs) | Code commits |
|---|---|---|---|
| PR-1 move collection handlers | `jstack/preferences-api-v2/pr-1` `57f7aa6a` | 5 files, +364 / -54 = 418 | 5 |
| PR-2 delegate named handlers | `jstack/preferences-api-v2/pr-2` `86357d7c` | 2 files, +46 / -47 = 93 | 2 |
| PR-3 delegate item handlers | `jstack/preferences-api-v2/pr-3` `62c5453b` | 2 files, +45 / -53 = 98 | 2 |
| PR-4 new controller and interceptor | `jstack/preferences-api-v2/pr-4` `0e3387ea` | 4 files, +489 / -1 = 490 | 7 |

Plan and PR plan 602 lines in the plan branch; bundles add 75 files and 5,831 lines under `docs/jstack/` across the four PRs. Strict chain. No unit over 500; PR-4 sits at 490 with ten lines of headroom, 420 of them tests. One commit per change row, so a reviewer can follow the stack method by method.

**Tests.** PR-1 adds `PreferenceRequestHandlerTest` (13 cases) and one line to the test support class. PR-2 and PR-3 add none, each move bracketed by the untouched `CustomerControllerPreferencesTest` (44 pass before and after). PR-4 adds `PreferencesControllerTest` (24 cases, 14 of them refusal cases: no session, admin, unknown customer) and extends one case in `WebAndSecurityConfigTest`. Suite grows 1901 to 1938. Failing-before: red-then-green per test row on PR-1 and PR-4 (the plan's test rows), none on PR-2 and PR-3 because their test rows named PR-4's file. Coverage LINE 0.9891 at the stack head, missed lines 81 at every head. Case mix uneven, as the PR-4 verifier noted.

**Verification.** One verifier per PR, a separate agent from the implementer. Base and head suites both run in fresh detached worktrees, head forced with `--rerun-tasks`, JUnit XML reduced per class, JaCoCo read from XML. Per PR a bundle under `docs/jstack/preferences-api-v2/verification/PR-n/` with `report.md` (commands table with exit codes, test summary, baseline, size, a plan-conformance table with one row per change row, live evidence, rerun), `rerun.sh`, and raw logs for base and head. All four `check-verification.mjs` exit 0, all four `rerun.sh` exit 0 when the verifier ran them. Independent check for this log: PR-4's `rerun.sh` copied out of the repo and run again by the coordinating session, `RERUN MATCH`, head `passed=1938 failed=0 skipped=0`, exit 0. Live: unavailable at every PR (no database on this machine), recorded with the profile's reason. What is missing: no executed check of the HTTP route table. `PreferencesControllerTest` calls the controller methods directly; the mappings are confirmed by reading the diff into the conformance table, not by a request. Verdicts PASS, PASS, PASS, PASS.

**Correctness.** Six handlers on `PreferencesController` at `api/v1/preferences`, `{preference-name}` mapped to POST and PUT. Interceptor pattern added and asserted for two paths. Shared `PreferenceRequestHandler` with a `PreferenceAccess` mode enum: old handlers keep their two guard orders and their 400s; the session mode refuses a null session, blank id or `ADMIN` with `UnauthorizedException` and answers 401, unknown customer answers 400 "No customer for this id". That matches the Done line literally and is flagged as an open question in the plan, since the old handlers answer 400 for the same exception. Seventh old handler left in place, flagged. A null `HttpSession` is handled in every mode.

**Cost.** 05:16:43Z to 07:03:33Z, 1h 46m 50s (init 5m, plan 17m, PR plan 5m, build 1h 18m). 16 subagents: 4 explorers, 1 planner, 2 reviewers, 1 splitter, 4 implementers, 4 verifiers (one extra failed call for the unregistered `jstack:jstack-explorer` type). Strictly serial. Rework: none, no block findings. Deviations the coordinator reported: agent types emulated; `rerun.sh` template lacked `BUNDLE_DIR`; the profile's summary one-liner had to live in a helper script because of its quotes; verifier briefs asked for coverage as extra evidence.

**Left for a human.** Confirm 401 versus 400. Decide on the seventh endpoint. Act or not on the four should findings and seven nits, which the artifacts carry but nobody addressed. Even out the PR-4 case mix. Write PR bodies, since jstack produces a PR plan section and a verification report per PR but no paste-ready body. Fix the two template gaps in the plugin.

## Comparison

| Criterion | pstack | jstack | Edge |
|---|---|---|---|
| 1 Plan reviewability | 395 lines plan plus design, 952 more of arena material; methods named, no diagrams or test rows; checker clean | 602 lines; 8 diagrams, 25 change rows with signatures, 25 test rows; checkers clean; reviewer findings recorded but not acted on | jstack for detail, pstack for brevity |
| 2 Decomposition | 3 PRs of 244 / 289 / 424, one commit each; plus a 15,727-line docs commit | 4 PRs of 418 / 93 / 98 / 490, 16 small commits; bundles 5,831 lines | jstack (smaller units, per-method commits, a third of the committed evidence) |
| 3 Tests | +30 cases incl. an executed MockMvc route test; red shown by mutating the guard after the fact | +37 cases, 14 refusal cases; red-then-green on the test rows for PR-1 and PR-4; no route test | jstack for test-first on new code, pstack for executing the route table |
| 4 Verification evidence | 3 verifiers per PR, live probes on trunk/head/trunk with a red check, one `verify.sh` re-run by a fresh agent, 95-row trail | 1 verifier per PR, base and head in fresh worktrees, per-PR report with conformance table, `rerun.sh` re-run by the verifier and again here | pstack (independent re-runner, executed routing, trail); jstack's per-PR bundle is easier to read |
| 5 Correctness | six routes, guards, interceptor correct; refusal is 400, against the Done line; seventh handler moved | six routes, guards, interceptor correct; refusal is 401 per the Done line; old routes unchanged | jstack on the literal requirement; both flagged the same ambiguity |
| 6 Cost | 1h 59m, 22 subagents, 4 skipped steps, 1 cross-PR fix | 1h 47m, 16 subagents, 0 skipped, 0 rework | jstack (12 minutes and 6 agents fewer) |
| 7 Human work left | one product call, one scope call, six parked follow-ups, PR bodies ready | one product call, one scope call, 11 unaddressed findings, no PR bodies | pstack hands over more finished |

What the run shows that the deep dive could not:

- **Both tools made the same two judgment calls** where the requirement was silent or inconsistent (400 or 401 on the new routes; whether to touch the seventh handler) and both recorded them. pstack decided and wrote the sentence that reverses the decision; jstack decided and wrote an open question. The pstack form is the one a lead can act on without re-deriving the context.
- **pstack verified what the code does over HTTP, jstack verified what the code is.** jstack's plan-conformance table is a careful read of the diff, and the handler tests prove the shared logic, but nothing in the jstack run sent a request to `/api/v1/preferences/{name}`. pstack's MockMvc probe and `PreferencesRoutesTest` did, and the PR3 red replay caught that a wrong mapping annotation turns PUT into a 405. That is the single largest gap in jstack's evidence.
- **jstack's reviewer findings are correct and ignored.** Four should-level findings were accurate (PR-1 does ship an untested access mode; PR-3's test claim was wrong). Because the commands revise only on block, they went straight into the artifacts as decoration. pstack's audits produced similar findings and the coordinator fixed the doc ones on the spot and parked the code ones in the trail with an owner.
- **jstack's plan is the more reviewable artifact; pstack's is the cheaper one.** Sequence diagrams and change rows with signatures let a lead check a design in minutes, and they let the implementer commit one row at a time. But 602 lines before code, and 1,347 lines on the pstack side when the arena is included, are both more than a lead reads for a 831-line change. pstack's two arena candidates were useful once and are now dead weight in the repo.
- **Evidence volume is a problem on both sides, worse for pstack.** Committing 1.3 MB of logs and lane JSON into the product repository is what the `git add -f` and the gitignore exception were for. A reviewer will not read it. The re-run scripts are the durable part; the logs could live in a release artifact.
- **Neither run could boot the service**, and both said so. pstack substituted a composed MockMvc probe and labelled it a risk; jstack wrote `Live: unavailable` and moved on. The pstack substitute is strictly more evidence.
- **Independence of the re-run.** pstack had a fresh agent run `verify.sh`; jstack's `rerun.sh` was run by the same verifier that wrote it. Run from outside the repo for this log, jstack's script worked first time, so the gap is procedural, not a defect.
- **Harness fit.** jstack's own agent types were not available to the Agent tool in this session and had to be emulated; pstack's Claude adapter skipped four Cursor-only steps. Both ran to completion anyway, which says the markdown is the product and the registration is a convenience.

## What this changes in the adoption plan

Reorder and sharpen the research doc's waves (`docs/research/2026-10-31-pstack-deep-dive.md`, section 4) on the strength of this run:

1. **Promote to wave one: an executed route check when live is unavailable.** The verifier gets a rule: when the repo profile's live row is unavailable and the PR adds or changes an HTTP mapping, the bundle must hold one executed request per mapping (MockMvc or the framework's equivalent, no Spring context) on base and head, or the verdict is INCONCLUSIVE. This is the "Observable on base and head" item from wave two, narrowed to the gap this run exposed.
2. **Promote to wave one: should findings get a disposition.** The reviewer's should-level findings are not discarded on PASS. The planner, splitter or implementer must answer each one with fix, dismiss with a reason, or park with an owner, written into the plan or PR plan before the next command runs. That is pstack's fix/dismiss/ask triage, moved up from wave three and applied to jstack's own reviewers rather than to Bugbot.
3. **Keep in wave one, confirmed by the run: the "decided, say X to reverse" form.** Every open question in the plan becomes a decision plus the sentence that reverses it. Both runs hit the 400/401 and seventh-handler questions; only one form of recording them is actionable.
4. **Keep in wave one: PR body Why / What changed / Scope / Blast Radius / Verification.** jstack produced no paste-ready body; pstack's 32-line bodies were the most reusable artifact of its run.
5. **Add to wave two: evidence hygiene.** Commit `report.md`, `rerun.sh` and the two summary files; keep raw logs and reduced XML out of the product repo (bundle `.gitignore`), with the rerun regenerating them. jstack committed 5,831 lines of evidence; pstack 15,727. Both are too many.
6. **Add to wave two: a fresh re-runner.** `/jstack:verify` already writes `rerun.sh`; `build` should hand it to an agent that wrote neither code nor bundle before recording the verdict, as pstack did.
7. **Keep in wave two: the decisions trail.** pstack's 95-row trail let this log reconstruct the run without reading 400k tokens of transcript. jstack has the report per PR but no cross-PR record of why.
8. **Demote: the arena.** Two 400-to-500-line design candidates plus a judge cost about 20 minutes and 952 lines for a choice the planner could have written in a paragraph. Not adopting.
9. **Fix now, not a wave item:** register the jstack agents so the Agent tool exposes them (the emulation worked but defeats the `tools` restriction), add `BUNDLE_DIR` to the rerun template, and allow the profile's summary command to be a script path.
