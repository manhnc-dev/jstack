# Verification report {{PR_ID}}

## PR

PR: {{PR_ID}}
Branch: {{BRANCH}}
SHA: {{HEAD_SHA}}
Base: {{BASE_SHA}}
Parent branch: {{PARENT_BRANCH}}

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `{{INSTALL_CMD}}` | {{INSTALL_EXIT}} | artifacts/install.log |
| 2 | `{{TEST_CMD}}` on head | {{TEST_HEAD_EXIT}} | artifacts/test-head.log |
| 3 | `{{TEST_CMD}}` on base | {{TEST_BASE_EXIT}} | artifacts/test-base.log |
| 4 | `pr-size.sh {{BASE_SHA7}} {{HEAD_SHA7}} --budget {{BUDGET}}` | {{SIZE_EXIT}} | artifacts/size.txt |
| 5 | `{{COMPONENT_TEST_CMD}}` on head | {{CT_EXIT}} | artifacts/test-component-head.log |
| 6 | `{{BLACKBOX_TEST_CMD}}` on head | {{BB_EXIT or "-" when not run}} | artifacts/test-blackbox-head.log |
| 7 | `{{LIVE_CMD}}` | {{LIVE_EXIT}} | artifacts/live-{{LIVE_NAME}}.txt |
| 8 | `./rerun.sh` | {{RERUN_EXIT}} | - |

## Test summary

Head: passed={{HEAD_PASSED}} failed={{HEAD_FAILED}} skipped={{HEAD_SKIPPED}}
Baseline: passed={{BASE_PASSED}} failed={{BASE_FAILED}} skipped={{BASE_SKIPPED}}
New failures: {{NEW_FAILURES}}
Component: passed={{CT_PASSED}} failed={{CT_FAILED}} skipped={{CT_SKIPPED}}
Blackbox: {{passed=<n> failed=<n> skipped=<n>, or "not run (<reason>)"}}

Per-file counts and failing test names are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. New failures by name are in artifacts/new-failures.txt. Raw logs named in the Commands table are local to the machine that ran them and are not committed.

## Baseline

Baseline cache: docs/jstack/{{SLUG}}/verification/baseline-{{BASE_SHA7}}/ ({{REUSED_OR_CREATED}})

Pre-existing failures: {{PREEXISTING_COUNT}}
- {{PREEXISTING_TEST_NAME}}

New failures: {{NEW_FAILURES}}
- {{NEW_FAILURE_TEST_NAME}}

## Size

Changed lines: {{CHANGED_LINES}} of {{BUDGET}} ({{OK_OR_OVER}})

Source: artifacts/size.txt.

## Plan conformance

| Change | Present | Note |
|---|---|---|
| {{CHANGE_ID}} | {{YES_OR_NO}} | {{NOTE}} |

## Live evidence

{{LIVE_LINE_OR_CITATIONS}}

## Audits

A1: findings={{A1_FINDINGS}} block={{A1_BLOCK}} should={{A1_SHOULD}} nit={{A1_NIT}}
A2: findings={{A2_FINDINGS}} block={{A2_BLOCK}} should={{A2_SHOULD}} nit={{A2_NIT}}

{{one bullet per finding: - [A1|A2] [block|should|nit] <path>:<line> (<id>) <finding>; <fix | park: <owner> | dismissed: <reason>>}}

## Rerun

rerun.sh exit code: {{RERUN_EXIT}}
Ran at: {{RERUN_RAN_AT}}

## Verdict

Verdict: {{PASS_OR_FAIL}}
Blocking: {{FIRST_BLOCKING_FINDING}}
