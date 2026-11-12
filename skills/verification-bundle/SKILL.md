---
name: verification-bundle
description: Produce the per-PR verification bundle (report.md, rerun.sh, artifacts/) under docs/jstack/<slug>/verification/<pr-id>/ with a baseline delta, cited evidence, and a checked verdict.
---

# Verification bundle

## Role

This skill is run by the `jstack-verifier` agent as the gates lane (L) of a three-worker verification. The implementer of a PR never runs it on their own PR. The verifier never edits product code. The only paths the verifier writes are under `docs/jstack/`. If a test fails, the report says FAIL and the coordinator hands the finding to a fresh implementer.

## Three workers

Every PR is judged by three fresh agents that did not write it, spawned together at the code-ready head and all briefed with the same `HEAD_SHA` and `BASE_SHA`.

| Lane | Agent | Does | Writes |
|---|---|---|---|
| L, gates | `jstack-verifier` | base and head suites in fresh worktrees, size, plan conformance, live evidence, `rerun.sh`, `report.md` | the bundle |
| A1, contract and behaviour | `jstack-reviewer` | Goal lines to methods, signatures to change rows, test rows to cases that assert behaviour, moved code unchanged, `Verify` line true at head | nothing |
| A2, design and boundary | `jstack-reviewer` | diagrams and `Data shapes` honoured, no file outside the PR's list, every new branch reached by a named test, whole-stack view, no narrating comment or silencing suppression | nothing |

The coordinator writes the `Audits` section from A1 and A2 and sets the verdict. `FAIL` when L fails, when any audit finding is `block`, or when a lane returned no report at `HEAD_SHA`. `block` is only for a problem the lane can show: a failing run at head or a diff line next to the plan line it contradicts. `should` and `nit` are each recorded with a disposition (`fix`, `park: <owner>`, `dismissed: <reason>`); parked or dismissed they never change a PASS, and `fix` means a fix round, so the verdict is FAIL. Three agents of one model agreeing is not three times the evidence; the lanes earn their cost by looking at three different surfaces.

## Inputs

- PR id, for example `PR-2`.
- The PR branch and its parent branch. The parent branch tip is the base.
- `docs/jstack/<slug>/pr-plan.md` for the change ids the PR must contain.
- `docs/jstack/<slug>/implementation-plan.md` for what each change id means.
- `docs/jstack/repo-profile.md` for the install, test, test summary, `test component`, `test blackbox`, `blackbox boot`, size, and `live` commands.
- `${CLAUDE_PLUGIN_ROOT}/skills/test-tiers/SKILL.md` for what each tier must have stubbed, so a component test that mocks the service or a blackbox test that imports the app is a finding.

## Output

The bundle directory `docs/jstack/<slug>/verification/<pr-id>/` holds three things.

- `report.md` filled from `references/report-template.md`.
- `rerun.sh` filled from `references/rerun-template.sh`, executable.
- `artifacts/` with every file the report cites, plus a `.gitignore` containing the lines `rerun-*/` and `*.log`.

What is committed and what stays local. Committed: `report.md`, `rerun.sh`, `artifacts/size.txt`, `artifacts/test-summary-head.txt`, `artifacts/test-summary-base.txt`, `artifacts/new-failures.txt`, and live request and response files. Local only: every raw `*.log` (install, suites, lint, build) and `rerun-*/`. The report still cites the logs by name; a reader of a fresh clone gets them back with `./rerun.sh`.

A complete example lives in `references/example-bundle/`.

## Steps

1. Record the SHAs. `SHA` is the PR branch head. `Base` is the parent branch tip. Both are full 40 character SHAs from `git rev-parse`.
2. Get the baseline, once per base. Look for `docs/jstack/<slug>/verification/baseline-<sha7>/` where `sha7` is the first seven characters of the base SHA. When it exists for this base, reuse it. When the base is the previous PR's branch and `git diff --quiet <that PR's verified SHA> <BASE_SHA> -- . ':!docs/jstack'` exits 0, that PR's head run is this baseline: copy its `artifacts/test-summary-head.txt` and say so on the `Baseline cache:` line instead of running the suite again. Otherwise add a worktree on the base SHA, install with the lockfile command, run the required test suite from the repo profile, and save the raw log and the summary in the cache directory. Then run the same suite on head in a worktree and save `artifacts/test-head.log`. Never run two full suites at once.
3. Reduce reporter output. Parse the repo's reporter output (JUnit XML, Jest JSON, or the console log) with the summary parser from the repo profile. Write `artifacts/test-summary-head.txt` and `artifacts/test-summary-base.txt` holding the totals line, per-file counts, and the names of failing tests. Do not commit the raw reporter files. Compute `New failures` as the tests that fail on head and did not fail on base, and write their names to `artifacts/new-failures.txt`, one per line, empty when there are none.
4. Measure size. Run `skills/pr-plan/scripts/pr-size.sh <base> <head>` and save its output as `artifacts/size.txt`. Copy the total and the status into the `Size` section.
5. Check plan conformance. For each change id the PR plan assigns to this PR, confirm the file and method appear in `git diff <base>...<head>`. Fill one row per change id. A missing change is a blocking finding.
5b. Run the test tiers the PR carries, after the head summary of step 3 is written: a second test run replaces the reporter files of the first (Gradle's `build/test-results`, Jest's JSON), so a summary taken afterwards counts only the component tests. Run the profile's `test component` command on head and save `artifacts/test-component-head.log`; write `Component: passed=<n> failed=<n> skipped=<n>` from it. When the PR section's `Tests.` names a `BB-n` and the profile's `blackbox boot` row has a command, build, boot the app with the stub addresses the row names, wait for its ready probe, run `test blackbox`, stop the process you started by PID, and save `artifacts/test-blackbox-head.log`; write `Blackbox: passed=<n> failed=<n> skipped=<n>`. When the row is `unavailable`, or the PR carries no `BB-n`, write `Blackbox: not run (<reason>)`. A failing component or blackbox test counts as a new failure. A `CT-n` or `BB-n` the PR section names with no matching test in the diff is a blocking finding.
6. Run live checks when the PR exposes behaviour. The repo profile's `live` row decides. When it gives a boot command, boot the app in the head worktree, run the request or CLI call the PR exposes, and save the request and the response as files under `artifacts/`. When the row says `unavailable`, write `Live: unavailable (<reason>)` with the profile's reason. Never fake a live result.
7. Fill `rerun.sh` from the template. Set `REPO` to `.` so the script resolves the repo from its own location. Set `BASE_SHA` and `HEAD_SHA` to the recorded SHAs. Set `TEST_CMD` and `SUMMARY_CMD` from the repo profile. Values are placed inside single quotes, so a command must not contain a single quote. Edit only the six `'{{...}}'` assignments at the top. Make it executable with `chmod +x`. Write the lines `rerun-*/` and `*.log` into `artifacts/.gitignore`. Run `./rerun.sh` once, record its exit code and the UTC time in the `Rerun` section.
8. Write `report.md`. Fill every placeholder except those in the `Audits` section, which the coordinator fills from the two audit lanes. Every claim cites a file under `artifacts/`. Every file under `artifacts/` is cited at least once. Numbers cite the committed summaries, not a raw log. The verdict is `PASS` only when `New failures` is 0 and every change id is present; the coordinator may still turn it to `FAIL` on an audit `block`. A `FAIL` verdict names the first blocking finding on a `Blocking:` line.
9. Run the checker. `node skills/verification-bundle/scripts/check-verification.mjs docs/jstack/<slug>/verification/<pr-id> --lane L` (`--lane L` skips the `Audits` section, which the coordinator fills and then checks without the flag). Fix every reported line and run it again until it exits 0.
10. Do not commit. The coordinator commits the bundle on the PR's branch after folding the audits. The bundle is excluded from the PR's line count. Reply with the verdict, the bundle path, and the first blocking finding when there is one.

## Fresh runs

Build tools cache. A head run that reports every task up to date ran nothing and proves nothing. Force a fresh run and say so in the report: Gradle `--rerun-tasks`, Maven `-Dsurefire.rerunFailingTestsCount=0 clean test`, Jest and Vitest `--no-cache`, pytest `-p no:cacheprovider`, Go `-count=1`. The baseline worktree is always fresh, so only the head run needs the flag.

## Commands with quotes

`rerun.sh` holds each command in a single-quoted shell variable. A summary command that itself contains single quotes, such as a `python3 -c '...'` one-liner, cannot be pasted there. Write it to `artifacts/summary.sh` (executable, cited in the report) and set `SUMMARY_CMD='bash "$BUNDLE_DIR/artifacts/summary.sh"'`, or rewrite it as a one-line equivalent and say in the report that it computes the same counts.

## Parallel verifiers

Two verifiers can run at once on different PRs. The scratch directory is shared, so every temporary file and worktree you create carries the PR id and a random suffix, for example `mktemp -d "$TMPDIR/verify-PR-3-XXXXXX"`. Never write to a bare name such as `test-head.log` in scratch. Another verifier overwrote exactly that file during the acme-pass exercise and the run had to be repeated.

## Baseline rule

Judge the PR on the delta, never on an all green suite. Pre-existing failures are listed by name in the `Baseline` section and never hidden. A new failure blocks. The judged run is the full suite the repo profile marks as required. Focused runs on touched modules are extra evidence and never the verdict.

## Live rule

The repo profile's `live` row decides whether live checks run. When the row is `unavailable`, the report states `Live: unavailable (<reason>)` and the verdict may still be PASS. The human sees the gap in the report. Do not boot anything the profile does not describe.

## Evidence rule

Every number and every claim in the report points at a file in `artifacts/`. Raw stdout and stderr of every command are kept on disk as `*.log` and never committed; the checker fails on a tracked log or rerun directory and accepts a cited log that is absent. Reporter XML or JSON is reduced to `artifacts/test-summary-<base|head>.txt`. The checker requires the two summaries, `size.txt` and `new-failures.txt`, checks that `New failures: <n>` equals the names in `new-failures.txt`, and warns on any artifact over 200 KB.

## Report format

`report.md` has these H2 headings in this order. `PR`, `Commands`, `Test summary`, `Baseline`, `Size`, `Plan conformance`, `Live evidence`, `Audits`, `Rerun`, `Verdict`.

- `PR` has lines `PR: PR-n`, `Branch: <name>`, `SHA: <40 hex>`, `Base: <40 hex>`.
- `Commands` is a table `Step | Command | Exit | Artifact`. The artifact cell is `artifacts/<file>` or `-`.
- `Test summary` has `Head: passed=<n> failed=<n> skipped=<n>`, `Baseline: passed=<n> failed=<n> skipped=<n>`, `New failures: <n>`, `Component: passed=<n> failed=<n> skipped=<n>`, and `Blackbox: passed=<n> failed=<n> skipped=<n>` or `Blackbox: not run (<reason>)`.
- `Size` has `Changed lines: <n> of <budget> (OK|OVER)` and cites `artifacts/size.txt`.
- `Plan conformance` is a table `Change | Present | Note`.
- `Live evidence` has `Live: unavailable (<reason>)` or at least one `artifacts/...` citation.
- `Audits` has `A1: findings=<n> block=<n> should=<n> nit=<n>` and `A2: findings=<n> block=<n> should=<n> nit=<n>` (or `A<n>: missing (<reason>)`), then one bullet per finding, `- [A1|A2] [block|should|nit] <path>:<line> (<id>) <finding>; <fix | park: <owner> | dismissed: <reason>>`. The checker counts the bullets against the lane lines, refuses a bullet with no disposition and a `block` that is not `fix`. The coordinator fills it; the gates lane leaves the placeholders.
- `Rerun` has `rerun.sh exit code: <n>` and `Ran at: <ISO timestamp>`.
- `Verdict` has `Verdict: PASS` or `Verdict: FAIL`. FAIL adds `Blocking: <first finding>`. PASS is refused by the checker when `New failures` is above zero, when an audit lane reports a `block`, when a `should` or `nit` is disposed as `fix`, or when a lane is missing.

## Stack verification

A PASS on every PR says each slice is sound. It does not say the feature works: a route can be dark until the last PR, and a scenario can be covered by a test nobody ran. `/jstack:verify-stack` closes that. One gates worker, at the head of the stack, writes `docs/jstack/<slug>/verification/stack/` with `report.md` (from `references/stack-report-template.md`, example in `references/example-stack-bundle/`) and `artifacts/`.

1. Baseline is the trunk commit the plan branched from, so the delta is the whole feature. Run the full suite there once and cache its summary in `baseline-<first 7 of TRUNK_SHA>/` (reuse it when that exact directory exists; PR-1's cache is keyed by the plan branch tip and is not the trunk), then on the stack head. Never both at once.
2. Run the profile's `test component` command on head, then boot the app as the `blackbox boot` row says and run `test blackbox`. Start stubs first, wait for the ready probe, stop everything you started by PID. When the row is `unavailable`, do not improvise a boot: every blackbox result is `not run`.
3. Reduce the two tier runs to `artifacts/scenarios.txt`, one line per scenario per covering test: `S-n component CT-n pass|fail <test title>` and `S-n blackbox BB-n pass|fail|not run <test title>`. Generate the file with a script that reads the reporter output and commit the script beside it; never type it. The mapping is mechanical: a component or blackbox test's title starts with its scenario id (`S-3: ...`), and the plan's `CT-n` and `BB-n` rows say which file covers which scenario. A scenario with no test whose title carries its id is `fail` for that tier, with the title `S-n: no test with this id in <file>`.
4. Fill the `Scenarios` table from that file, one row per plan scenario, every covering `CT-n` and `BB-n` listed.
5. Verdict. `PASS`: no new failures, every PR `PASS`, every scenario `pass` in both tiers. `PARTIAL`: the same, except blackbox results are `not run`; add `Not run: <which and why>`. The feature is then proven in process and unproven as a deployable, and the report says so in its verdict rather than in a footnote. `FAIL`: anything else, with `Blocking:`.
6. Run `check-stack.mjs <bundle> --plan <plan> --pr-plan <pr-plan>`. It refuses a plan scenario with no row, a row that omits a covering test, a result with no matching line in `scenarios.txt` whose title starts with the scenario id, a `Head:` or `Baseline:` line that differs from the committed summary, PASS over a failure or a `not run`, and a committed raw log.

## rerun.sh

`./rerun.sh` re-runs the head suite in a fresh worktree and compares the failed count with the recorded `Head:` line. `./rerun.sh --with-baseline` re-runs the base suite too. Output goes to `artifacts/rerun-<timestamp>/` and is gitignored. It prints `RERUN MATCH` and exits 0, or prints `RERUN MISMATCH` and exits 2.
