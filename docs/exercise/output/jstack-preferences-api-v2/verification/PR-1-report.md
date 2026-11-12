# Verification report PR-1

## PR

PR: PR-1
Branch: jstack/preferences-api-v2/pr-1
SHA: 57f7aa6a7b32a6d0b7fed3a623cd90dc32f63c09
Base: 4b1d3d8732cfa63f0850ce4d3a688c6775a97681
Parent branch: jstack/preferences-api-v2/plan

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `./gradlew check --no-daemon --rerun-tasks` on head (fresh detached worktree at SHA, JDK 21) | 0 | artifacts/test-head.log |
| 2 | `./gradlew check --no-daemon` on base (fresh detached worktree at Base, JDK 21) | 0 | artifacts/test-base.log |
| 3 | `bash artifacts/summary.sh` (repo-profile `test summary` one-liner) in each worktree | 0 | artifacts/summary.sh |
| 4 | `python3 -I artifacts/reduce-junit.py <worktree>` on head and base | 0 | artifacts/test-summary-head.txt |
| 5 | `python3 -I artifacts/coverage.py build/reports/jacoco/test/jacocoTestReport.xml` on head and base | 0 | artifacts/coverage-head.txt |
| 6 | `pr-size.sh 4b1d3d8 57f7aa6 --budget 500` | 0 | artifacts/size.txt |
| 7 | `git diff --exit-code jstack/preferences-api-v2/plan 57f7aa6 -- .../CustomerControllerPreferencesTest.java` and `git diff 4b1d3d8...57f7aa6 -- src/main ...` | 0 | artifacts/diff-main.txt |
| 8 | `./rerun.sh` | 0 | - |

No install step: Gradle resolves dependencies inside `check`; dependency resolution is part of both test logs.

## Test summary

Head: passed=1914 failed=0 skipped=0
Baseline: passed=1901 failed=0 skipped=0
New failures: 0

The head run was forced fresh with `--rerun-tasks`; artifacts/test-head.log ends with `6 actionable tasks: 6 executed` (no task UP-TO-DATE or FROM-CACHE). Both runs ended `BUILD SUCCESSFUL`, which includes `jacocoTestCoverageVerification` at the 0.98 floor.

Per-file counts and failing test names are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. Head has 258 result files against 257 on base; the one added file is `PreferenceRequestHandlerTest` with 13 passing cases. The eight `CustomerControllerPreferencesTest` result lines are identical on base and head (same per-group pass counts, no failures).

Coverage (jacoco report-level LINE counter, extra evidence, not part of the verdict rule):
- Base: covered=7368 missed=81 percent=98.91 (artifacts/coverage-base.txt)
- Head: covered=7392 missed=81 percent=98.92 (artifacts/coverage-head.txt)

The PR adds 24 covered lines and no missed lines.

## Baseline

Baseline cache: docs/jstack/preferences-api-v2/verification/baseline-4b1d3d8/ (created by this run from a fresh worktree at Base; holds test-base.log, summary.txt, test-summary-base.txt, coverage-base.txt; copied into this bundle as artifacts/test-base.log, artifacts/test-summary-base.txt and artifacts/coverage-base.txt)

Pre-existing failures: 0
- none

New failures: 0
- none

## Size

Changed lines: 418 of 500 (OK)

Source: artifacts/size.txt. Added 364, deleted 54, across `CustomerController.java`, `PreferenceAccess.java`, `PreferenceRequestHandler.java`, `CustomerControllerTestSupport.java` and `PreferenceRequestHandlerTest.java`. The bundle under `docs/` is excluded.

## Plan conformance

All evidence is in artifacts/diff-main.txt.

| Change | Present | Note |
|---|---|---|
| C-1 | yes | `PreferenceAccess.java` adds the enum `CUSTOMER_THEN_SESSION`, `SESSION_THEN_CUSTOMER`, `SESSION_CUSTOMER` and `statusFor(AcmePassException)`: `UNAUTHORIZED` only for `SESSION_CUSTOMER` with `UnauthorizedException`, else `BAD_REQUEST`. Tested by the three `statusFor_*` cases |
| C-2 | yes | `PreferenceRequestHandler` is `@Component @Log4j2 @RequiredArgsConstructor` with final `CustomerService` and `CustomerExternalDataService`; `CustomerControllerTestSupport` gains the single planned `set("preferenceRequestHandler", ...)` line |
| C-3 | yes | `resolveCustomerId(HttpSession, String, PreferenceAccess)` returns the path id for old modes, the session customer id or null for `SESSION_CUSTOMER`. Tested by the three `resolveCustomerId_*` cases |
| C-4 | yes | `authorize(HttpSession, String, PreferenceAccess)` runs lookup-then-session, session-then-lookup, or null/blank/ADMIN (case-insensitive) refusal before lookup; `BadRequestException("No customer for this id")` for an unknown customer. Tested by the seven planned `sessionCustomer_*`, `sessionThenCustomer_*`, `customerThenSession_*` cases |
| C-5 | yes | `savePreferences(HttpSession, String, PreferenceAccess, Map)` keeps the old body, messages, log texts and both catch blocks verbatim; only the 400 becomes `ResponseEntity.status(access.statusFor(e))` |
| C-6 | yes | `retrievePreferences(HttpSession, String, PreferenceAccess)` keeps the old body including the `"Empty data."` branch and both catch blocks; status from `access.statusFor(e)` |
| C-11 | yes | `CustomerController` adds `@Autowired private PreferenceRequestHandler preferenceRequestHandler`; the `TODO` at the old `:1245` is replaced with a pointer to `PreferencesController` and `PreferenceRequestHandler` |
| C-12 | yes | `CustomerController.savePreferences` is one line delegating with `PreferenceAccess.CUSTOMER_THEN_SESSION`; mapping and signature unchanged |
| C-13 | yes | `CustomerController.retrievePreferences` is one line delegating with `PreferenceAccess.CUSTOMER_THEN_SESSION`; mapping and signature unchanged |

PR Verify step: `git diff --exit-code jstack/preferences-api-v2/plan -- .../CustomerControllerPreferencesTest.java` exits 0 (file untouched), recorded in artifacts/diff-main.txt.

Reviewer notes, not blocking: in the moved bodies `resolveCustomerId` now runs before the `try`, which is pure for the path modes so old behaviour is unchanged; log lines move to the `PreferenceRequestHandler` logger category, as the PR's Observable line states.

## Live evidence

Live: unavailable (the default `local` profile needs MySQL on localhost:3306, Redis on 6379 and MongoDB with credentials from properties; docker, mysql, redis-server and mongod are not installed on this machine and 3306/6379 refuse connections)

## Rerun

rerun.sh exit code: 0
Ran at: 2026-10-31T06:05:56Z

Output: `RERUN MATCH (head failed=0, recorded failed=0)`, head `passed=1914 failed=0 skipped=0`. Run with JDK 21 on `JAVA_HOME` (repo-profile Caveats). `SUMMARY_CMD` calls artifacts/summary.sh, the repo-profile one-liner verbatim, because the one-liner contains single quotes. The rerun output directory under `artifacts/` is gitignored and not committed.

## Verdict

Verdict: PASS
