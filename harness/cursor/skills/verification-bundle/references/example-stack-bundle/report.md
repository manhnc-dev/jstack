# Stack verification idempotent-order-placement

## Stack

Slug: idempotent-order-placement
Head branch: jstack/idempotent-order-placement/pr-2
SHA: 3d76cfd3cd23540a3c277d0597e2afe23972fd39
Trunk base: 4f2795b4853bce79e6ea10a35b394f594dcf3174
Plan: docs/jstack/idempotent-order-placement/implementation-plan.md

## PRs

| PR | Branch | SHA | Verdict |
|---|---|---|---|
| PR-1 | jstack/idempotent-order-placement/pr-1 | 9a1c2e7 | PASS |
| PR-2 | jstack/idempotent-order-placement/pr-2 | 3d76cfd | PASS |

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `node --test "scripts/**/*.test.mjs"` on head | 0 | artifacts/test-head.log |
| 2 | `node --test "scripts/**/*.test.mjs"` on trunk base | 0 | artifacts/test-base.log |
| 3 | `node --test "scripts/**/*.component.test.mjs"` on head | 0 | artifacts/test-component-head.log |
| 4 | `node scripts/orders-app.mjs` booted with `KEY_STORE_URL` and `ORDERS_DB`, ready on `GET /health` | 0 | artifacts/boot.log |
| 5 | `node --test "scripts/blackbox/*.bb.test.mjs"` against the booted app | 0 | artifacts/test-blackbox-head.log |

## Test summary

Head: passed=14 failed=0 skipped=0
Baseline: passed=1 failed=0 skipped=0
New failures: 0
Component: passed=4 failed=0 skipped=0
Blackbox: passed=4 failed=0 skipped=0

Per-file counts are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. New failures by name are in artifacts/new-failures.txt, which is empty. Raw logs stay on the machine that ran them.

## Scenarios

One row per scenario of the plan. Results come from the test titles, which start with the scenario id, reduced to artifacts/scenarios.txt.

| Scenario | Component | Blackbox | Evidence |
|---|---|---|---|
| S-1 Fresh key places the order | CT-1 pass | BB-1 pass | artifacts/scenarios.txt |
| S-2 Seen key with the same payload replays | CT-2 pass | BB-1 pass | artifacts/scenarios.txt |
| S-3 Seen key with a different payload conflicts | CT-2 pass | BB-1 pass | artifacts/scenarios.txt |
| S-4 Expired key behaves as fresh | CT-1 pass | BB-1 pass | artifacts/scenarios.txt |

## Verdict

Verdict: PASS
