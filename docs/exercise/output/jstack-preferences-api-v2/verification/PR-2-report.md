# Verification report PR-2

## PR

PR: PR-2
Branch: jstack/preferences-api-v2/pr-2
SHA: 86357d7cd91f0f46d6b9d2c11c7bb46cb9626bad
Base: 64e006f01b34e78f3fd3a4ea9e432e55b57d8673
Parent branch: jstack/preferences-api-v2/pr-1

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `./gradlew check --no-daemon --rerun-tasks` on head (fresh detached worktree at SHA, JDK 21) | 0 | artifacts/test-head.log |
| 2 | `./gradlew check --no-daemon` on base (fresh detached worktree at Base, JDK 21) | 0 | artifacts/test-base.log |
| 3 | `bash artifacts/summary.sh` (repo-profile `test summary` one-liner) in each worktree | 0 | artifacts/summary.sh |
| 4 | `python3 -I artifacts/reduce-junit.py <worktree>` on head and base | 0 | artifacts/test-summary-head.txt |
| 5 | `python3 -I artifacts/coverage.py build/reports/jacoco/test/jacocoTestReport.xml` on head and base | 0 | artifacts/coverage-head.txt |
| 6 | `pr-size.sh 64e006f 86357d7 --budget 500` | 0 | artifacts/size.txt |
| 7 | `git diff --exit-code jstack/preferences-api-v2/plan 86357d7 -- src/test/java/com/pass/acme/controller/CustomerControllerPreferencesTest.java` (PR Verify, second half) | 0 | artifacts/verify-test-untouched.txt |
| 8 | `git diff 64e006f...86357d7 -- src/main` | 0 | artifacts/diff-main.txt |
| 9 | `./rerun.sh` | 0 | - |

No install step: Gradle resolves dependencies inside `check`; dependency resolution is part of both test logs. Steps 1 and 7 together are the PR's `Verify.` line; both exited 0.

## Test summary

Head: passed=1914 failed=0 skipped=0
Baseline: passed=1914 failed=0 skipped=0
New failures: 0

The head run was forced fresh with `--rerun-tasks`; artifacts/test-head.log ends with `6 actionable tasks: 6 executed` (no task UP-TO-DATE or FROM-CACHE). Both runs ended `BUILD SUCCESSFUL`, which includes `jacocoTestCoverageVerification` at the 0.98 floor (artifacts/test-base.log, artifacts/test-head.log).

Per-file counts and failing test names are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. Both have 258 result files and are byte-identical: same per-file counts, no failures. The PR adds and changes no tests, so the `CustomerControllerPreferencesTest` `CreateNewPreference` and `SaveLikedPreference` groups pass unchanged against the delegating bodies.

Coverage (jacoco report-level LINE counter, extra evidence, not part of the verdict rule):
- Base: covered=7392 missed=81 percent=98.92 (artifacts/coverage-base.txt)
- Head: covered=7384 missed=81 percent=98.91 (artifacts/coverage-head.txt)

Head has 8 fewer covered lines and the same 81 missed lines: the two old bodies leave `CustomerController` and the moved bodies in `PreferenceRequestHandler` reuse `authorize`, so the duplicated guard lines are gone. Coverage stays above the 0.98 floor.

## Baseline

Baseline cache: docs/jstack/preferences-api-v2/verification/baseline-64e006f/ (created by this run from a fresh worktree at Base; holds test-base.log, summary.txt, test-summary-base.txt, coverage-base.txt; copied into this bundle as artifacts/test-base.log, artifacts/test-summary-base.txt and artifacts/coverage-base.txt)

Pre-existing failures: 0
- none

New failures: 0
- none

## Size

Changed lines: 93 of 500 (OK)

Source: artifacts/size.txt. Added 46, deleted 47, across `CustomerController.java` (3 added, 47 deleted) and `PreferenceRequestHandler.java` (43 added). The bundle under `docs/` is excluded.

## Plan conformance

All evidence is in artifacts/diff-main.txt.

| Change | Present | Note |
|---|---|---|
| C-7 | yes | `PreferenceRequestHandler.createNewPreference(HttpSession, String, PreferenceAccess, String, List<String>)` added; resolves the id, calls `authorize`, then `savePreferenceByName(data, preferenceName, customerId, true)`; message `"Success to create preference."`, log texts and both catch blocks kept, 400 becomes `ResponseEntity.status(access.statusFor(e))` |
| C-8 | yes | `PreferenceRequestHandler.saveLikedPreference(HttpSession, String, PreferenceAccess, String, Map<String, Object>)` added; `requestData.getOrDefault("data", new ArrayList<>())` with `replace = false`; message `"Success to save liked preference."`, log texts and both catch blocks kept, status from `access.statusFor(e)` |
| C-14 | yes | `CustomerController.createNewPreference` body is one delegating line with `PreferenceAccess.SESSION_THEN_CUSTOMER` (plus a one-line comment); mapping, signature and path variables unchanged. `authorize` runs `requireAccess` before `requireCustomer` for this mode, matching the old session-first order |
| C-15 | yes | `CustomerController.saveLikedPreference` body is one delegating line with `PreferenceAccess.CUSTOMER_THEN_SESSION`; mapping, signature and path variables unchanged. `authorize` runs `requireCustomer` before `requireAccess` for this mode, matching the old customer-first order |

PR Verify step, second half: `git diff --exit-code jstack/preferences-api-v2/plan -- src/test/java/com/pass/acme/controller/CustomerControllerPreferencesTest.java` exits 0 (file untouched since the plan branch), recorded in artifacts/verify-test-untouched.txt.

Review focus confirmed in artifacts/diff-main.txt: old `createNewPreference` passes `SESSION_THEN_CUSTOMER`, not the default mode; POST/PUT keeps `replace = true`; PATCH keeps the `data` key or empty list with `replace = false`.

Reviewer notes, not blocking: as in PR-1, `resolveCustomerId` runs before the `try`, which is pure for the path modes so old behaviour is unchanged; log lines move to the `PreferenceRequestHandler` logger category.

## Live evidence

Live: unavailable (the default `local` profile needs MySQL on localhost:3306, Redis on 6379 and MongoDB with credentials from properties; docker, mysql, redis-server and mongod are not installed on this machine and 3306/6379 refuse connections)

## Rerun

rerun.sh exit code: 0
Ran at: 2026-10-31T06:22:05Z

Output: `RERUN MATCH (head failed=0, recorded failed=0)`, head `passed=1914 failed=0 skipped=0`, head exit code 0. Run with JDK 21 on `JAVA_HOME` (repo-profile Caveats) and `TMPDIR` set to the session scratch directory; the one bundle-side change to the template's body is that the temporary directory is named `rerun-PR-2-XXXXXX` so parallel verifiers cannot collide. `SUMMARY_CMD` calls artifacts/summary.sh, the repo-profile one-liner verbatim, because the one-liner contains single quotes. The rerun output directory under `artifacts/` is gitignored (artifacts/.gitignore) and not committed.

## Verdict

Verdict: PASS
