---
name: implementation-plan
description: Use when turning a requirement and a design into a reviewable implementation plan with class and method level sequence diagrams, a change table, and a three-tier test plan (unit, component, blackbox) that covers every end-to-end scenario.
---

# Implementation plan

Turn a requirement plus a design into one Markdown plan a reviewer can read in ten minutes. The plan names every class and method that changes, shows each flow as a sequence diagram, pairs every change with a unit test, lists every end-to-end scenario, and covers each scenario with a component test and a blackbox test. A check script rejects half-filled plans.

## Inputs

- The requirement. A ticket, a TODO, or a paragraph from the operator.
- The design, when one exists. Passed as a path. When none is given, draft the Design section yourself and label it `Source: planner's draft`.
- `docs/jstack/repo-profile.md`. Test, lint, and build commands, the test tier rows (`test unit`, `test component`, `test blackbox`, `blackbox boot`) plus the conventions found in the repo. Run the repo-profile skill first when the file is missing.
- `${CLAUDE_PLUGIN_ROOT}/skills/test-tiers/SKILL.md` and its stack reference (`references/java-spring.md` or `references/nestjs.md`). The tier definitions, the scenario derivation rules, and the harness names the test tables use.

## Steps

1. Ground the plan. Hand the requirement to `jstack-explorer`. Ask for file pointers with line numbers for every module the change touches, the DI style, the error handling style, and the test layout. Put the answers in Grounding.
2. Settle observable questions by reading code. If a question can be answered by opening a file or running a test, answer it now. Only product and preference calls go in Open questions.
3. Fill the template. Copy `${CLAUDE_PLUGIN_ROOT}/skills/implementation-plan/references/plan-template.md` to the output path and replace every `{{...}}`. Read `references/example-plan.md` once for the expected depth. Draw the diagrams before the change table. Then derive one change row per class and method the diagrams show, and one unit test row per change row. Then write the scenario table from the diagrams and the requirement as the test-tiers skill says (one per flow, one per `alt` branch, one per rule), and cover every scenario with at least one component test row and one blackbox test row.
4. Run the checker and fix every line it prints.

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/implementation-plan/scripts/check-plan.mjs" docs/jstack/<slug>/implementation-plan.md
   ```

   Exit 0 with no output means clean. Each problem is `file:line: message`. Do not hand off a plan that prints anything.
5. Hand the plan to `jstack-reviewer`. Address every finding and run the checker again. Every finding ends in `docs/jstack/<slug>/findings.md` with a disposition (`fixed: <what changed>`, `park: <owner>`, `dismissed: <reason>`), checked by `skills/jstack-principles/scripts/check-findings.mjs`.
6. Reply to the operator with the path, a five-line summary, and the list of open questions.

## Plan format

The headings below are required, in this order. The checker fails on a missing or reordered heading.

Summary, Scope, Design, Grounding, Data shapes, Sequence diagrams, Change table, Test plan, Risks and rollbacks, Open questions.

Rules the checker enforces.

- Summary has at most 12 non-empty lines.
- Design holds a line that starts with `Source:`. Either `Source: given (<path>)` or `Source: planner's draft`.
- No `{{...}}` placeholder remains outside a code fence.
- Each diagram is `### SD-n: caption` followed by a mermaid fence that starts with `sequenceDiagram`.
- Change table headers are `ID | File | Class | Method | Change | Responsibility | Diagrams`. `ID` is `C-n`. `Change` is `add`, `modify`, or `delete`. `Method` is `name(params): Return`, or `-` for a class or file level row.
- Files in `modify` and `delete` rows must exist in the repo.
- Every change row lists at least one `SD-n`, every listed diagram exists, and every diagram is listed by at least one row.
- A row's method name must appear as `name(` in a message of at least one diagram it lists.
- Test plan holds four H3 sections in order: `Unit tests`, `E2E scenarios`, `Component tests`, `Blackbox tests`.
- Unit table headers are `Change | Test file | Cases | Asserts`. Every change row has a unit row and every unit row names a known change.
- Scenario table headers are `ID | Flow | Actor | Given | When | Then | Diagrams`. Ids are `S-n`. `Actor`, `Given`, `When`, `Then` are non-empty. Every row lists known `SD-n`, and every diagram is exercised by at least one scenario.
- Component table headers are `ID | Scenarios | Test file | Harness | Stubs | Asserts`, ids `CT-n`. Blackbox table headers are `ID | Scenarios | Test file | Boot | Stubs | Asserts`, ids `BB-n`. Every row lists known `S-n` and has no empty cell. Every scenario is covered by at least one `CT-n` and at least one `BB-n`.

## Diagram rules

Follow the sequence-diagrams skill at `${CLAUDE_PLUGIN_ROOT}/skills/sequence-diagrams/SKILL.md`. In short, participants are real class or module names, every message is `method(args): ReturnType`, branches use `alt` and `else`, and repeats use `loop`. One diagram per user-visible flow or error path. Keep each diagram under about 25 messages. Split a long flow into two diagrams rather than one wide one.

## Reviewer load rule

The Summary plus the diagrams must be readable in ten minutes. A reviewer should know what changes and why from those alone. Prose explains only what the diagrams cannot show, such as why an alternative lost or what a data shape means. Delete any sentence that repeats a diagram.

## Output

Write the plan to `docs/jstack/<slug>/implementation-plan.md` inside the target repo. The slug is the kebab-case form of the feature name, for example `idempotent-order-placement`. Commit the plan on the branch `jstack/<slug>/plan`, branched from trunk. That branch is the root of the PR stack and is itself a docs-only PR.
