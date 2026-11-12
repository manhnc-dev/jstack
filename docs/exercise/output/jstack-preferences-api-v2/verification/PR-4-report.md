# Verification report PR-4

## PR

PR: PR-4
Branch: jstack/preferences-api-v2/pr-4
SHA: 0e3387ea0bbccb5f1dc6c054493a464871f40643
Base: 2f2c9139df3c3aec76f4548ee0eef23f84b179ce
Parent branch: jstack/preferences-api-v2/pr-3

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `./gradlew check --no-daemon --rerun-tasks` on head (fresh detached worktree at SHA, JDK 21) | 0 | artifacts/test-head.log |
| 2 | `./gradlew check --no-daemon` on base (fresh detached worktree at Base, JDK 21) | 0 | artifacts/test-base.log |
| 3 | `bash artifacts/summary.sh` (repo-profile `test summary` one-liner) in each worktree | 0 | artifacts/summary.sh |
| 4 | `python3 -I artifacts/reduce-junit.py <worktree>` on head and base | 0 | artifacts/test-summary-head.txt |
| 5 | `python3 -I artifacts/coverage.py build/reports/jacoco/test/jacocoTestReport.xml` on head and base | 0 | artifacts/coverage-head.txt |
| 6 | `pr-size.sh 2f2c913 0e3387e --budget 500` | 0 | artifacts/size.txt |
| 7 | `git diff --exit-code jstack/preferences-api-v2/plan -- src/test/java/com/pass/acme/controller/CustomerControllerPreferencesTest.java` (run in the PR worktree checked out at SHA) | 0 | artifacts/verify-old-test-untouched.txt |
| 8 | `git diff 2f2c913...0e3387e` | 0 | artifacts/diff.txt |
| 9 | `./rerun.sh` | 0 | - |

No install step: Gradle resolves dependencies inside `check`; dependency resolution is part of both test logs. Steps 1 and 2 ran at the same time in separate worktrees. The PR's `Verify.` line ends with `./gradlew check --no-daemon`, which step 1 covers; its focused first half (`--tests PreferencesControllerTest --tests WebAndSecurityConfigTest`) is a subset of the full run, and both classes pass there (artifacts/test-summary-head.txt).

## Test summary

Head: passed=1938 failed=0 skipped=0
Baseline: passed=1914 failed=0 skipped=0
New failures: 0

The head run was forced fresh with `--rerun-tasks`; artifacts/test-head.log ends with `6 actionable tasks: 6 executed` (no task UP-TO-DATE or FROM-CACHE). Both runs ended `BUILD SUCCESSFUL`, which includes `jacocoTestCoverageVerification` at the 0.98 floor (artifacts/test-base.log, artifacts/test-head.log).

Per-file counts and failing test names are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. Head has 264 result files, base 258. The only difference is six new files, the `PreferencesControllerTest` nested groups: `RetrievePreferences` 5, `SavePreferences` 5, `CreateNewPreference` 4, `SaveLikedPreference` 4, `AppendToPreferenceList` 3, `RemoveLikedPreference` 3. That is 24 cases, all passing, which is the +24 between base and head. Every other file has the same counts on both sides. `WebAndSecurityConfigTest$WebMvc` passes 3 of 3 on head with the two added assertions inside an existing case. All `CustomerControllerPreferencesTest` groups pass on head with the same counts as base.

Coverage (jacoco report-level LINE counter, extra evidence, not part of the verdict rule):
- Base: covered=7376 missed=81 percent=98.91 (artifacts/coverage-base.txt)
- Head: covered=7382 missed=81 percent=98.91 (artifacts/coverage-head.txt)

Head adds 6 covered lines (the new controller's six delegating calls) and no missed lines. Coverage stays above the 0.98 floor.

## Baseline

Baseline cache: docs/jstack/preferences-api-v2/verification/baseline-2f2c913/ (created by this run from a fresh worktree at Base; holds test-base.log, summary.txt, test-summary-base.txt, coverage-base.txt; copied into this bundle as artifacts/test-base.log, artifacts/test-summary-base.txt and artifacts/coverage-base.txt)

Pre-existing failures: 0
- none

New failures: 0
- none

## Size

Changed lines: 490 of 500 (OK)

Source: artifacts/size.txt. Added 489, deleted 1, across `PreferencesController.java` (68 added), `WebMvcConfig.java` (1 added, 1 deleted), `PreferencesControllerTest.java` (418 added) and `WebAndSecurityConfigTest.java` (2 added). The bundle under `docs/` is excluded. 10 lines of headroom; tests make up 420 of the 490.

## Plan conformance

All evidence is in artifacts/diff.txt.

| Change | Present | Note |
|---|---|---|
| C-18 | yes | `PreferencesController` added with `@RestController`, `@RequestMapping("api/v1/preferences")`, `@RequiredArgsConstructor` and one `private final PreferenceRequestHandler` field |
| C-19 | yes | `retrievePreferences(HttpSession)` with `@GetMapping("")`, delegates `(session, null, PreferenceAccess.SESSION_CUSTOMER)` |
| C-20 | yes | `savePreferences(HttpSession, @RequestBody Map<String, Object>)` with `@PostMapping("")`, delegates with `null` and `SESSION_CUSTOMER` |
| C-21 | yes | `createNewPreference(HttpSession, preference-name, @RequestBody List<String>)` with `@RequestMapping(value = "/{preference-name}", method = {POST, PUT})`, delegates with `null` and `SESSION_CUSTOMER`; no GET mapping on `/{preference-name}` |
| C-22 | yes | `saveLikedPreference(HttpSession, preference-name, @RequestBody Map<String, Object>)` with `@PatchMapping("/{preference-name}")`, delegates with `null` and `SESSION_CUSTOMER` |
| C-23 | yes | `appendToPreferenceList(HttpSession, preference-name, preference-id)` with `@PostMapping("/{preference-name}/{preference-id}")`, delegates with `null` and `SESSION_CUSTOMER` |
| C-24 | yes | `removeLikedPreference(HttpSession, preference-name, preference-id)` with `@DeleteMapping("/{preference-name}/{preference-id}")`, delegates with `null` and `SESSION_CUSTOMER` |
| C-25 | yes | `WebMvcConfig.addInterceptors` adds `"/api/v1/preferences/**"` to the `requestHeaderInterceptor` path patterns; the exclude list is unchanged. `WebAndSecurityConfigTest` asserts both `/api/v1/preferences` and `/api/v1/preferences/favouriteRestaurants/r1` match |

Test rows: `PreferencesControllerTest extends CustomerControllerTestSupport` and builds `new PreferencesController(new PreferenceRequestHandler(customerService, customerExternalDataService))` in a `@BeforeEach`, with the six nested groups named in the plan (artifacts/diff.txt). Each group has an own-session parity case against the old endpoint plus refusal cases (`admin_is401`, and `noSession_is401` in five of the six groups) and `unknownCustomer_is400` in four. `RemoveLikedPreference` also has `nothingStored_is400WithServiceMessage`, and `SavePreferences` has `unexpectedFailure_becomesAnAppException`.

Old endpoints unchanged: `git diff --exit-code jstack/preferences-api-v2/plan -- src/test/java/com/pass/acme/controller/CustomerControllerPreferencesTest.java` exits 0 (artifacts/verify-old-test-untouched.txt). The old-endpoint test file is untouched since the plan branch, and all of it passes on head (artifacts/test-summary-head.txt). The same command in SHA form (`plan 0e3387e`) also exits 0. This PR does not touch `CustomerController` (artifacts/diff.txt).

Reviewer notes, not blocking: the per-group case mix is uneven. `SaveLikedPreference` has no `noSession` case, and `AppendToPreferenceList` and `RemoveLikedPreference` have no `unknownCustomer` case. All six share the same `authorize` and catch path in `PreferenceRequestHandler` (SD-2), which the other groups already exercise.

## Live evidence

Live: unavailable (the default `local` profile needs MySQL on localhost:3306, Redis on 6379 and MongoDB with credentials from properties; docker, mysql, redis-server and mongod are not installed on this machine and 3306/6379 refuse connections)

## Rerun

rerun.sh exit code: 0
Ran at: 2026-10-31T07:00:38Z

Output: `RERUN MATCH (head failed=0, recorded failed=0)`, head `passed=1938 failed=0 skipped=0`, head exit code 0. Run with JDK 21 on `JAVA_HOME` (repo-profile Caveats) and `TMPDIR` set to the session scratch directory. The template body has two bundle-side changes, carried over from the PR-2 and PR-3 bundles. `BUNDLE_DIR` is exported so `SUMMARY_CMD` can find artifacts/summary.sh. The temporary directory is named `rerun-PR-4-XXXXXX` so parallel verifiers cannot collide. `SUMMARY_CMD` calls artifacts/summary.sh, which holds the repo-profile one-liner verbatim, because the one-liner contains single quotes. The rerun output directory under `artifacts/` is gitignored (artifacts/.gitignore) and is not committed.

## Verdict

Verdict: PASS
