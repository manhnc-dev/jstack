# Stack verification {{SLUG}}

## Stack

Slug: {{SLUG}}
Head branch: {{HEAD_BRANCH}}
SHA: {{HEAD_SHA}}
Trunk base: {{TRUNK_SHA}}
Plan: docs/jstack/{{SLUG}}/implementation-plan.md

## PRs

| PR | Branch | SHA | Verdict |
|---|---|---|---|
| {{PR_ID}} | {{BRANCH}} | {{SHA7}} | {{PASS, FAIL, or missing}} |

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `{{TEST_CMD}}` on trunk base | {{EXIT}} | artifacts/test-base.log |
| 2 | `{{TEST_CMD}}` on head | {{EXIT}} | artifacts/test-head.log |
| 3 | `{{COMPONENT_TEST_CMD}}` on head | {{EXIT}} | artifacts/test-component-head.log |
| 4 | `{{BLACKBOX_BOOT_CMD}}` with stubs, ready on {{READY_PROBE}} | {{EXIT or "-" when not run}} | artifacts/boot.log |
| 5 | `{{BLACKBOX_TEST_CMD}}` against the booted app | {{EXIT or "-" when not run}} | artifacts/test-blackbox-head.log |

## Test summary

Head: passed={{N}} failed={{N}} skipped={{N}}
Baseline: passed={{N}} failed={{N}} skipped={{N}}
New failures: {{N}}
Component: passed={{N}} failed={{N}} skipped={{N}}
Blackbox: {{passed=<n> failed=<n> skipped=<n>, or "not run (<reason>)"}}

Per-file counts are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. New failures by name are in artifacts/new-failures.txt. Raw logs stay on the machine that ran them.

## Scenarios

One row per scenario of the plan. Results come from the test titles, which start with the scenario id, reduced to artifacts/scenarios.txt.

| Scenario | Component | Blackbox | Evidence |
|---|---|---|---|
| {{S-n and its Flow}} | {{CT-n pass or fail, one entry per covering row}} | {{BB-n pass, fail, or not run}} | artifacts/scenarios.txt |

## Verdict

Verdict: {{PASS, PARTIAL, or FAIL}}
{{PARTIAL only}} Not run: {{which BB-n for which scenarios, and what the machine lacks}}
{{FAIL only}} Blocking: {{first failing scenario with what was observed and what was expected}}
