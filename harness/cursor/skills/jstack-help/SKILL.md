---
name: jstack-help
description: "Which jstack command fits what you are trying to do, and where the artifacts land."
disable-model-invocation: true
---

# /jstack-help

Usage: `/jstack-help [question]`

In Cursor, read `<jstack>/docs/harness/cursor.md` once per session before you follow this skill. It maps the Claude Code names jstack uses to Cursor.

Answer the question in the text after the skill name with this routing table, then add one sentence on the next command to type. With no question, print the table and the artifact paths.

| You want | Command |
|---|---|
| jstack to learn how this repo builds and tests | `/jstack-init` |
| a plan a lead can review in ten minutes, with method-level sequence diagrams and a unit, component and blackbox test plan covering every scenario | `/jstack-plan <requirement or path> [--design <path>]` |
| that plan split into PRs under 500 lines with tests | `/jstack-pr-plan` |
| one PR coded on its own branch, test first | `/jstack-implement PR-n` |
| independent evidence that a PR works, from three workers that did not write it, with a re-run script | `/jstack-verify PR-n` |
| proof that the whole feature works end to end at the top of the stack, one row per scenario | `/jstack-verify-stack` |
| the whole stack built and verified while you are away | `/jstack-build --no-gate` |

Artifacts land in the target repo:

- `docs/jstack/repo-profile.md`
- `docs/jstack/<slug>/implementation-plan.md` on branch `jstack/<slug>/plan`
- `docs/jstack/<slug>/pr-plan.md` on the same branch
- `docs/jstack/<slug>/verification/PR-n/{report.md, rerun.sh, artifacts/}` on branch `jstack/<slug>/pr-n` (raw `*.log` files stay local)
- `docs/jstack/<slug>/verification/stack/{report.md, artifacts/}` on the stack head: every plan scenario with its component and blackbox result
- `docs/jstack/<slug>/findings.md` on the plan branch: every plan and PR-plan review finding with its disposition; `/jstack-pr-plan` and `/jstack-implement` stop while one is unanswered

Human gates: after `/jstack-plan` and after `/jstack-pr-plan`. Nothing merges. `--open-pr` opens PRs after a PASS.
