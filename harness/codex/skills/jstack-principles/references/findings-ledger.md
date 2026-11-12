# Review findings

Ledger of every `jstack-reviewer` finding on the plan and the PR plan. The coordinator of `$jstack-plan` and `$jstack-pr-plan` writes it; `$jstack-pr-plan` and `$jstack-implement` refuse to start while a row has no disposition.

plan: findings=2
pr-plan: findings=1

| ID | Stage | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| F-1 | plan | block | implementation-plan.md:88 (SD-2) | `OrderService.place` returns `Order` in the diagram and `OrderResult` in the file | fixed: planner round 2 changed SD-2 and C-4 to `OrderResult` |
| F-2 | plan | should | implementation-plan.md:140 (S-3) | the duplicate-key scenario's Then names no status code | fixed: Then now reads `409 with code ORDER_DUPLICATE` |
| F-3 | pr-plan | should | pr-plan.md:52 (PR-4) | PR-4 only registers the module PR-3 adds, so the route is dark for one PR | dismissed: PR-3 would pass 500 lines with the registration and its blackbox test; size.txt estimate 540 |

## Dispositions

- `fixed: <what changed>`. A fresh planner or splitter round changed the artifact, the checker ran again, and the cell says what changed. Every `block` ends here.
- `park: <owner>`. Real, not for this stage. The owner is a PR id, a later command, or the human.
- `dismissed: <reason>`. Wrong or not worth it, with a reason someone can check: a file and line, a measured number, a requirement sentence.

A `should` is fixed when one fresh round can do it. It is never left without one of the three.
