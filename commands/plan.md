---
description: Turn a requirement (and optional design) into docs/jstack/<slug>/implementation-plan.md with class and method level sequence diagrams, checked and reviewed. Stops at the human gate. Does not implement.
argument-hint: "<requirement text or path> [--design <path>] [--slug <slug>]"
disable-model-invocation: true
---

Produce an implementation plan for review. You own the process. Subagents do the reading and writing. You do not implement anything.

Arguments: `$ARGUMENTS`

Resolve inputs:

- Requirement: if the first argument is an existing file path, read it. Otherwise the argument text is the requirement.
- Design: the `--design <path>` file when given. Otherwise none, and the planner drafts the Design section marked `Source: planner's draft`.
- Slug: `--slug` when given, else a kebab-case name of at most five words derived from the requirement. Confirm `docs/jstack/<slug>/` does not already hold a plan; if it does, stop and say so.
- Repo profile: `docs/jstack/repo-profile.md`. If missing, run the steps of `${CLAUDE_PLUGIN_ROOT}/commands/init.md` first.

Steps:

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/implementation-plan/SKILL.md`.
2. Branch. Read the trunk name from the profile. Run `git switch -c jstack/<slug>/plan <trunk>` (or `git switch jstack/<slug>/plan` when it exists). If `git check-ignore -q docs/jstack` succeeds, the repo ignores `docs/`; append `!docs/`, `docs/*`, and `!docs/jstack/` to `.gitignore`, each on its own line (add a newline first when the file does not end with one, or the first entry glues onto the last line), confirm with `git check-ignore -q docs/jstack` now failing, so the artifacts are versioned, and include `.gitignore` in the commit. Write the requirement to `docs/jstack/<slug>/requirement.md` when it came inline, and copy the design to `docs/jstack/<slug>/design.md` when one was given.
3. Ground. Spawn `jstack:jstack-explorer` with the requirement, the design, and the profile. Ask for the call chain from the entry point the requirement names to the storage boundary, every signature on the way, the test layout for those classes, and the conventions. One explorer for a single flow, up to three in parallel when the requirement names several entry points.
4. Plan. Spawn `jstack:jstack-planner` with: the requirement path, the design path or "none", the profile path, the explorer reports verbatim, the template at `${CLAUDE_PLUGIN_ROOT}/skills/implementation-plan/references/plan-template.md`, the example at `${CLAUDE_PLUGIN_ROOT}/skills/implementation-plan/references/example-plan.md`, the test-tiers skill at `${CLAUDE_PLUGIN_ROOT}/skills/test-tiers/SKILL.md` with the reference for the repo's stack, the checker command `node ${CLAUDE_PLUGIN_ROOT}/skills/implementation-plan/scripts/check-plan.mjs docs/jstack/<slug>/implementation-plan.md --repo <repo root>`, and the output path.
5. Check. Run the checker yourself. If it prints anything, send the lines to a fresh planner with the same brief plus the lines. At most two rounds, then stop and report the remaining lines.
6. Review. Spawn `jstack:jstack-reviewer` on the plan with the requirement and the explorer reports. For each `block` finding, spawn a fresh planner with the finding and the plan to revise. At most two review rounds.
6b. Dispose of every finding. Write `docs/jstack/<slug>/findings.md` from `${CLAUDE_PLUGIN_ROOT}/skills/jstack-principles/references/findings-ledger.md`: a `plan: findings=<n>` line and one row per finding of every round, each with `fixed: <what changed>`, `park: <owner>`, or `dismissed: <reason someone can check>`. A `should` one fresh planner round can settle is fixed in that round, with the plan checker run again; a `block` is always `fixed`. Run `node ${CLAUDE_PLUGIN_ROOT}/skills/jstack-principles/scripts/check-findings.mjs docs/jstack/<slug>/findings.md --stage plan` and do not continue while it prints anything.
7. Commit on the plan branch: `git add docs/jstack && git commit -m "docs(jstack): implementation plan for <slug>"`.
8. Stop. Do not run `/jstack:pr-plan`, do not implement.

Reply with, in this order: the plan path and branch, the checker result, the plan's Summary section verbatim, the diagram captions, the count of change rows, the planner's `Tests:` line (unit, scenarios, component, blackbox counts), the decisions the planner made, the open questions, and the findings ledger rows that are parked or dismissed. End with one line: "Next: review the plan, then run `/jstack:pr-plan`."
