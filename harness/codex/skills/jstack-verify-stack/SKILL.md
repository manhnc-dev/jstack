---
name: jstack-verify-stack
description: "Verify the whole feature end to end at the top of a jstack stack. One fresh gates worker runs the full suite, every component test and every blackbox test against the booted app with stubs, and writes docs/jstack/<slug>/verification/stack/report.md with one row per plan scenario. PASS, PARTIAL when blackbox could not run, or FAIL."
---

# $jstack-verify-stack

Usage: `$jstack-verify-stack [--slug <slug>]`

In Codex, read `<jstack>/docs/harness/codex.md` once per session before you follow this skill. It maps the Claude Code names jstack uses to Codex.

Prove the feature, not one PR. Per-PR bundles say each slice is sound; this says every end-to-end scenario of the plan holds on the code that would ship. You coordinate. A fresh `jstack-verifier` does the work. Nobody edits product code.

Arguments: the text after the skill name

Resolve the slug with the slug rule from `<jstack>/skills/jstack-implement/SKILL.md`. Read the Stack overview of `docs/jstack/<slug>/pr-plan.md`.

Steps:

1. Read the `Stack verification` section of `<jstack>/skills/verification-bundle/SKILL.md`.
2. Collect the per-PR verdicts. For every PR in the Stack overview read `Verdict:` from `docs/jstack/<slug>/verification/PR-<n>/report.md` on its branch (`git show jstack/<slug>/pr-<n>:<path>`); a branch or report that does not exist is `missing`. If any is not `PASS`, stop and name the PR to verify first.
3. Find the stack head. When one PR branch contains every other (`git merge-base --is-ancestor`), that branch is the head. When the stack has several leaves, create `jstack/<slug>/stack` from the last PR in stack order and `git merge --no-edit` the other leaves; a conflict is `Verdict: FAIL` with `Blocking: stack does not merge (<files>)`. Record `HEAD_SHA`, and `TRUNK_SHA=$(git merge-base <trunk> jstack/<slug>/plan)`.
4. Spawn one `jstack-verifier` in stack mode with: repo root, slug, head branch, `HEAD_SHA`, `TRUNK_SHA`, the profile path, the plan's `E2E scenarios`, `Component tests` and `Blackbox tests` tables verbatim, the per-PR verdict table, the bundle path `docs/jstack/<slug>/verification/stack/`, the template `<jstack>/skills/verification-bundle/references/stack-report-template.md`, the example under `references/example-stack-bundle/`, and the checker command below. One worker, so one full suite runs at a time.
5. Boundary check as in `<jstack>/skills/jstack-verify/SKILL.md` step 4.
6. Run `node <jstack>/skills/verification-bundle/scripts/check-stack.mjs docs/jstack/<slug>/verification/stack --plan docs/jstack/<slug>/implementation-plan.md --pr-plan docs/jstack/<slug>/pr-plan.md --repo <repo root>` yourself. Problems go to a fresh verifier once; if any remain the verdict is FAIL with the first checker line as `Blocking`.
7. Commit on the head branch without raw logs: `git add -f docs/jstack/<slug>/verification/stack && git ls-files docs/jstack/<slug>/verification | grep -E '/rerun-|\.log$' | xargs -r git rm -q --cached && git commit -m "test(jstack): stack verification for <slug>"`.

Reply with: Verdict, bundle path, checker result, the Head, Baseline, New failures, Component and Blackbox lines, the Scenarios table verbatim, and on PARTIAL the `Not run:` line with what a machine needs to turn it into PASS. On FAIL add: "Next: `$jstack-implement <PR that owns the failing test> --fix \"<Blocking>\"`".
