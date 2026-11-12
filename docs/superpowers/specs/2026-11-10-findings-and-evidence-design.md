# Finding dispositions and evidence hygiene

Date: 2026-11-10. Source: items 1 and 3 of "What this changes in the adoption plan" in `docs/exercise/2026-11-06-jstack-vs-pstack-reserve-backend.md`.

## Intent

Two failures showed up in both comparison runs. A reviewer said "this stack over-splits" as a `should`, nobody answered it, and the stack shipped six PRs with routes dark until the last one. And each verification bundle committed its full suite logs, lint and build logs and a baseline copy, so the product repo carried megabytes of noise per PR. Both were covered by prose rules already. This change moves them into checkers.

## Goals

- No command runs past a review finding that has no answer. Every finding ends as fixed, parked with an owner, or dismissed with a reason someone can check.
- A committed bundle holds what a reviewer reads and what `rerun.sh` needs, and nothing a rerun regenerates.
- One baseline suite run per distinct base, never one per PR by habit.

## Non-goals

- The other follow-ups from the log: flaky-suite solo rerun, mutation step in lane A1, a full resource guard, PR bodies, old-route pin tests.
- Migrating bundles and stacks written before this change.

## What changes

Finding dispositions.

- `docs/jstack/<slug>/findings.md` is a ledger: a `plan: findings=<n>` line, a `pr-plan: findings=<n>` line, and a table `ID | Stage | Severity | Location | Finding | Disposition`. Format and example in `skills/jstack-principles/references/findings-ledger.md`.
- `skills/jstack-principles/scripts/check-findings.mjs` refuses a row without `fixed:`, `park:` or `dismissed:` plus text, a `block` that is not `fixed`, a count line that disagrees with the table, and a stage that was asked for and never recorded.
- `/jstack:plan` writes the ledger after review. `/jstack:pr-plan` gates on the plan stage, gives a `should` about the shape of the stack a fresh splitter round, and records its own stage. `/jstack:implement` gates on both stages.
- In a verification report every audit bullet reads `- [A1|A2] [severity] <finding>; <fix | park: <owner> | dismissed: <reason>>`. The bundle checker counts bullets against the lane lines, refuses a `block` that is not `fix`, and refuses PASS when a `should` or `nit` is disposed as `fix`.

Evidence hygiene.

- `artifacts/.gitignore` must hold `rerun-*/` and `*.log`. The bundle checker fails on a tracked log or rerun directory and accepts a cited log that is absent.
- Required and committed: `size.txt`, `test-summary-head.txt`, `test-summary-base.txt`, `new-failures.txt`. `New failures: <n>` must equal the names in `new-failures.txt`.
- The baseline for a stacked PR reuses the previous PR's head summary when the base differs from that verified head only under `docs/jstack/`. No baseline log is copied into a bundle.

## Calls I made

- `fix` on a `should` in a verification report means FAIL at that head, because a fix round changes the head. The alternative, a PASS with a promise to fix, is the unanswered finding again.
- A missing ledger fails the gate. A review with zero findings still writes `plan: findings=0`, so "no findings" and "no review" are different files.
- Raw logs are local rather than trimmed and committed. The summaries carry the numbers, and `rerun.sh` regenerates the logs.
- `/jstack:implement --fix` skips the ledger gate, since it runs on a stack that already passed it.

## Constraints

- Bundles written before this change fail the bundle checker (no summaries, no `*.log` ignore line, logs tracked). Stacks without a ledger stop at `/jstack:implement`.
- Harness trees are regenerated, never edited.
