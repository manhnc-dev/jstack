# PR plan: {{feature name}}

<!-- Source plan and budget. The checker reads C-ids from the plan's change table. -->
Plan: `docs/jstack/{{slug}}/implementation-plan.md`
Budget: 500 changed lines per PR, tests included

## Stack overview

<!-- One row per PR in merge order. List a PR after every PR it depends on.
     Title is a Conventional Commits subject with no trailing period.
     Depends on is "-" or a comma list of PR-n. Changes is a comma list of C-n.
     Est. LOC is a whole number under the budget. Kind is scaffold, logic, wiring, or cleanup. -->

| ID | Title | Depends on | Changes | Est. LOC | Kind |
|---|---|---|---|---|---|
| PR-1 | {{type(scope): subject}} | - | {{C-1, C-2}} | {{120}} | {{scaffold}} |
| PR-2 | {{type(scope): subject}} | PR-1 | {{C-3}} | {{150}} | {{logic}} |

Estimate basis: {{how the numbers were counted, for example 3 added methods at 8 lines, 2 modified at 4 lines, times 1.5 for tests, rounded up to tens}}

## Dependency graph

<!-- An edge PR-1 --> PR-2 means PR-2 depends on PR-1. The edge set must match the table.
     A plan with no dependencies lists only nodes. -->

```mermaid
graph TD
  PR-1[PR-1: {{short title}}]
  PR-2[PR-2: {{short title}}]
  PR-1 --> PR-2
```

## PRs

<!-- One section per PR. Keep every bold label at the start of its own line.
     Content may follow on the same line or on the lines below it. -->

### PR-1: {{type(scope): subject}}

**Goal.** {{one sentence}}

**Changes.** {{C-1, C-2}}

**Files.**
- `{{path/to/file}}`

**Tests.**
- `{{path/to/test}}` {{what it asserts}}
- {{CT-n, BB-n ids this PR delivers, each with its file; a blackbox test lands in the PR that makes its scenario reachable}}

**Verify.** `{{command that proves this PR green on its own}}`

**Review focus.** {{what the reviewer should look at first}}

**Observable.** {{what a user or operator can see after merge, or "nothing yet" with the reason}}

**Rollback.** {{how to undo this PR alone}}

### PR-2: {{type(scope): subject}}

**Goal.** {{one sentence}}

**Changes.** {{C-3}}

**Files.**
- `{{path/to/file}}`

**Tests.**
- `{{path/to/test}}` {{what it asserts}}

**Verify.** `{{command}}`

**Review focus.** {{focus}}

**Observable.** {{observable}}

**Rollback.** {{rollback}}

## Sequencing rationale

<!-- Why this order proves itself. Types and scaffold first, failing test then fix, wiring and flag flip last. -->

{{why this order}}
