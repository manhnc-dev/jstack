# Verification report PR-3

## PR

PR: PR-3
Branch: jstack/preferences-api-v2/pr-3
SHA: 62c5453b33a8acadfa500abe91f7e62fd0a1a810
Base: f1553089ed6bf15f3e9ebc97e8a4d5dc9284e53a
Parent branch: jstack/preferences-api-v2/pr-2

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `./gradlew check --no-daemon --rerun-tasks` on head (fresh detached worktree at SHA, JDK 21) | 0 | artifacts/test-head.log |
| 2 | `./gradlew check --no-daemon` on base (fresh detached worktree at Base, JDK 21) | 0 | artifacts/test-base.log |
| 3 | `bash artifacts/summary.sh` (repo-profile `test summary` one-liner) in each worktree | 0 | artifacts/summary.sh |
| 4 | `python3 -I artifacts/reduce-junit.py <worktree>` on head and base | 0 | artifacts/test-summary-head.txt |
| 5 | `python3 -I artifacts/coverage.py build/reports/jacoco/test/jacocoTestReport.xml` on head and base | 0 | artifacts/coverage-head.txt |
| 6 | `pr-size.sh f155308 62c5453 --budget 500` | 0 | artifacts/size.txt |
| 7 | `git diff --exit-code jstack/preferences-api-v2/plan 62c5453 -- src/test/java/com/pass/acme/controller/CustomerControllerPreferencesTest.java` (PR Verify, second half) | 0 | artifacts/verify-test-untouched.txt |
| 8 | `git diff f155308...62c5453 -- src/main` | 0 | artifacts/diff-main.txt |
| 9 | `./rerun.sh` | 0 | - |

No install step: Gradle resolves dependencies inside `check`; dependency resolution is part of both test logs. Steps 1 and 7 together are the PR's `Verify.` line; both exited 0. Step 7 was also run in the PR worktree form given in the plan (working tree against the plan branch) and exited 0.

## Test summary

Head: passed=1914 failed=0 skipped=0
Baseline: passed=1914 failed=0 skipped=0
New failures: 0

The head run was forced fresh with `--rerun-tasks`; artifacts/test-head.log ends with `6 actionable tasks: 6 executed` (no task UP-TO-DATE or FROM-CACHE). Both runs ended `BUILD SUCCESSFUL`, which includes `jacocoTestCoverageVerification` at the 0.98 floor (artifacts/test-base.log, artifacts/test-head.log).

Per-file counts and failing test names are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. Both have 258 result files and are byte-identical: same per-file counts, no failures. The PR adds and changes no tests; `CustomerControllerPreferencesTest$AppendAndRemovePreferenceItem` passes 6 of 6 on head against the delegating bodies (artifacts/test-summary-head.txt).

Coverage (jacoco report-level LINE counter, extra evidence, not part of the verdict rule):
- Base: covered=7384 missed=81 percent=98.91 (artifacts/coverage-base.txt)
- Head: covered=7376 missed=81 percent=98.91 (artifacts/coverage-head.txt)

Head has 8 fewer covered lines and the same 81 missed lines: the duplicated guard lines in the two old bodies are replaced by the shared `authorize` call. Coverage stays above the 0.98 floor.

## Baseline

Baseline cache: docs/jstack/preferences-api-v2/verification/baseline-f155308/ (created by this run from a fresh worktree at Base; holds test-base.log, summary.txt, test-summary-base.txt, coverage-base.txt; copied into this bundle as artifacts/test-base.log, artifacts/test-summary-base.txt and artifacts/coverage-base.txt)

Pre-existing failures: 0
- none

New failures: 0
- none

## Size

Changed lines: 98 of 500 (OK)

Source: artifacts/size.txt. Added 45, deleted 53, across `CustomerController.java` (2 added, 53 deleted) and `PreferenceRequestHandler.java` (43 added). The bundle under `docs/` is excluded.

## Plan conformance

All evidence is in artifacts/diff-main.txt.

| Change | Present | Note |
|---|---|---|
| C-9 | yes | `PreferenceRequestHandler.appendToPreferenceList(HttpSession, String, PreferenceAccess, String, String)` added; resolves the id, calls `authorize`, then `savePreferenceByName(Collections.singletonList(preferenceId), preferenceName, customerId, false)`; message `"Success to add new item to preference"`, both four-argument log lines kept verbatim, 400 becomes `ResponseEntity.status(access.statusFor(e))` |
| C-10 | yes | `PreferenceRequestHandler.removeLikedPreference(HttpSession, String, PreferenceAccess, String, String)` added; calls `removeValueFromPreferences(customerId, preferenceName, preferenceId)`; message `"Success to remove liked preference."`, log lines kept verbatim; a service `BadRequestException(NON_EXIST_ERROR)` is an `AcmePassException` and is answered with `access.statusFor(e)`, which is 400 for every non-`SESSION_CUSTOMER` mode and for any non-Unauthorized exception |
| C-16 | yes | `CustomerController.appendToPreferenceList` body is one delegating line with `PreferenceAccess.CUSTOMER_THEN_SESSION`; mapping, signature and path variables unchanged. `authorize` runs `requireCustomer` before `requireAccess` for this mode, matching the old customer-first order |
| C-17 | yes | `CustomerController.removeLikedPreference` body is one delegating line with `PreferenceAccess.CUSTOMER_THEN_SESSION`; mapping, signature and path variables unchanged; same customer-first order |

PR Verify step, second half: `git diff --exit-code jstack/preferences-api-v2/plan -- src/test/java/com/pass/acme/controller/CustomerControllerPreferencesTest.java` exits 0 (file untouched since the plan branch), recorded in artifacts/verify-test-untouched.txt.

Review focus confirmed in artifacts/diff-main.txt: the four-argument log lines with `preferenceId` are copied verbatim, and append still sends `Collections.singletonList(preferenceId)` with `replace = false`.

Reviewer notes, not blocking: as in PR-1 and PR-2, `resolveCustomerId` runs before the `try`, which is pure for the path modes so old behaviour is unchanged; log lines move to the `PreferenceRequestHandler` logger category. The C-9 and C-10 parity rows in `PreferencesControllerTest` are planned for PR-4, so this PR's new handler methods are covered only through the old endpoint tests.

## Live evidence

Live: unavailable (the default `local` profile needs MySQL on localhost:3306, Redis on 6379 and MongoDB with credentials from properties; docker, mysql, redis-server and mongod are not installed on this machine and 3306/6379 refuse connections)

## Rerun

rerun.sh exit code: 0
Ran at: 2026-10-31T06:36:19Z

Output: `RERUN MATCH (head failed=0, recorded failed=0)`, head `passed=1914 failed=0 skipped=0`, head exit code 0. Run with JDK 21 on `JAVA_HOME` (repo-profile Caveats) and `TMPDIR` set to the session scratch directory. Two bundle-side changes to the template body, both carried over from the PR-2 bundle: `BUNDLE_DIR` is exported so `SUMMARY_CMD` can find artifacts/summary.sh, and the temporary directory is named `rerun-PR-3-XXXXXX` so parallel verifiers cannot collide. `SUMMARY_CMD` calls artifacts/summary.sh, the repo-profile one-liner verbatim, because the one-liner contains single quotes. The rerun output directory under `artifacts/` is gitignored (artifacts/.gitignore) and not committed.

## Verdict

Verdict: PASS
