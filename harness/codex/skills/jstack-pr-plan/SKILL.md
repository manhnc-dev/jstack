---
name: jstack-pr-plan
description: "Split an implementation plan into docs/jstack/<slug>/pr-plan.md, a stack of PRs each under 500 changed lines with tests, checked and reviewed. Stops at the human gate. Does not implement."
---

# $jstack-pr-plan

Usage: `$jstack-pr-plan [plan path | --slug <slug>] [--budget 500]`

In Codex, read `<jstack>/docs/harness/codex.md` once per session before you follow this skill. It maps the Claude Code names jstack uses to Codex.

Produce the PR plan for review. You own the process. You do not implement anything.

Arguments: the text after the skill name

Resolve inputs:

- Plan: the path argument when given, else `docs/jstack/<slug>/implementation-plan.md` for `--slug`, else the only `docs/jstack/*/implementation-plan.md` when exactly one exists. With several and no qualifier, list the slugs and stop.
- Budget: `--budget` or 500.
- Branch: `git switch jstack/<slug>/plan`. If the plan is not committed there, stop and say so.

Steps:

0. Gate. Run `node <jstack>/skills/jstack-principles/scripts/check-findings.mjs docs/jstack/<slug>/findings.md --stage plan`. If it prints anything, stop and show the lines: a plan finding with no disposition is settled before the split, not after.
1. Read `<jstack>/skills/pr-plan/SKILL.md`.
2. Spawn `jstack-splitter` with: the plan path, the profile path, the budget, the template at `<jstack>/skills/pr-plan/references/pr-plan-template.md`, the example at `<jstack>/skills/pr-plan/references/example-pr-plan.md`, the checker command `node <jstack>/skills/pr-plan/scripts/check-pr-plan.mjs docs/jstack/<slug>/pr-plan.md --plan docs/jstack/<slug>/implementation-plan.md --budget <budget>`, and the output path.
3. Run the checker yourself. On output, one fresh splitter round with the lines, then stop and report what remains.
4. Spawn `jstack-reviewer` on the PR plan with the implementation plan. `block` findings get one fresh splitter round, and so does any `should` about the shape of the stack (a PR that over-splits, a route unreachable at its PR's head, a registration-only PR, a hidden dependency); run the checker again after the round.
4b. Dispose of every finding. Add a `pr-plan: findings=<n>` line and one row per finding to `docs/jstack/<slug>/findings.md`, each with `fixed: <what changed>`, `park: <owner>`, or `dismissed: <reason someone can check>`. Run `node <jstack>/skills/jstack-principles/scripts/check-findings.mjs docs/jstack/<slug>/findings.md --stage plan --stage pr-plan` and do not continue while it prints anything.
5. Commit on the plan branch: `git add docs/jstack && git commit -m "docs(jstack): PR plan for <slug>"`.
6. Stop. Do not implement.

Reply with: the PR plan path, the checker result, the Stack overview table verbatim, the splitter's order rationale, and the findings ledger rows that are parked or dismissed. End with one line: "Next: review the stack, then run `$jstack-implement PR-1` or `$jstack-build`."
