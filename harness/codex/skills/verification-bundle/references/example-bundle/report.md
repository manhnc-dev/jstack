# Verification report PR-1

## PR

PR: PR-1
Branch: jstack/markdown-parser/PR-1
SHA: 3d76cfd3cd23540a3c277d0597e2afe23972fd39
Base: 4f2795b4853bce79e6ea10a35b394f594dcf3174
Parent branch: jstack/markdown-parser/plan

## Commands

| Step | Command | Exit | Artifact |
|---|---|---|---|
| 1 | `node --test "scripts/**/*.test.mjs"` on head | 0 | artifacts/test-head.log |
| 2 | `node --test "scripts/**/*.test.mjs"` on base | 0 | artifacts/test-base.log |
| 3 | `node --test "scripts/**/*.component.test.mjs"` on head | 0 | artifacts/test-component-head.log |
| 4 | `pr-size.sh 4f2795b 3d76cfd --budget 500` | 0 | artifacts/size.txt |
| 5 | `./rerun.sh` | 0 | - |

## Test summary

Head: passed=3 failed=0 skipped=0
Baseline: passed=2 failed=0 skipped=0
New failures: 0
Component: passed=1 failed=0 skipped=0
Blackbox: not run (the example repo has no blackbox boot row; the profile says unavailable)

Per-file counts and failing test names are in artifacts/test-summary-head.txt and artifacts/test-summary-base.txt. New failures by name are in artifacts/new-failures.txt, which is empty. The raw logs named in the Commands table stay on the machine that ran them; `./rerun.sh` regenerates them.

## Baseline

Baseline cache: docs/jstack/markdown-parser/verification/baseline-4f2795b/ (created; its summary is copied into this bundle as artifacts/test-summary-base.txt)

Pre-existing failures: none.

New failures: none. The head run adds one test and keeps both baseline tests green.

## Size

Changed lines: 187 of 500 (OK)

Source: artifacts/size.txt. Counted files are `scripts/lib/markdown.mjs`, `scripts/lib/markdown.test.mjs`, and `package.json`.

## Plan conformance

| Change | Present | Note |
|---|---|---|
| C-1 | yes | `scripts/lib/markdown.mjs` exports `parseDocument`, `sectionBetween`, `sectionText` |
| C-2 | yes | `scripts/lib/markdown.test.mjs` covers headings, tables, fences |
| C-3 | yes | `package.json` test script globs `scripts/**/*.test.mjs` |

## Live evidence

Live: unavailable (library-only PR, the repo profile lists no boot command)

## Audits

A1: findings=0 block=0 should=0 nit=0
A2: findings=1 block=0 should=1 nit=0

- [A2] [should] scripts/lib/markdown.mjs:41 (C-1) `sectionText` drops trailing blank lines while the plan's Data shapes row keeps them; park: implementer of PR-2, which consumes `sectionText`.

## Rerun

rerun.sh exit code: 0
Ran at: 2026-10-30T09:14:52Z

The rerun output directory under `artifacts/` is gitignored and not committed.

## Verdict

Verdict: PASS
