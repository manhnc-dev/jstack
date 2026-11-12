---
description: Run the whole stack from the pr-plan, implement then verify each PR in dependency order, stop at the first FAIL. For an unattended run after the human gates.
argument-hint: "[--slug <slug>] [--only PR-n,PR-m] [--no-gate] [--open-pr]"
disable-model-invocation: true
---

Drive every PR of a jstack stack to a verified branch. You are the coordinator. Per PR, a fresh implementer writes the code, then three fresh verification workers (the gates lane and two audit lanes) judge it.

Arguments: `$ARGUMENTS`

Resolve the slug with the slug rule from `${CLAUDE_PLUGIN_ROOT}/commands/implement.md`. Read `docs/jstack/<slug>/pr-plan.md` and order the PRs topologically from the Stack overview and the dependency graph. With `--only`, keep the listed PRs and their unverified dependencies.

Steps:

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/jstack-principles/SKILL.md`, `${CLAUDE_PLUGIN_ROOT}/commands/implement.md`, `${CLAUDE_PLUGIN_ROOT}/commands/verify.md`, and `${CLAUDE_PLUGIN_ROOT}/commands/verify-stack.md`.
2. Say the order and stop for an explicit go, unless `--no-gate`.
3. For each PR in order: run the implement steps, then the verify steps. Never run two full suites at once. Print one status line after each: `PR-n: <branch> <sha7> size=<n> verdict=<PASS|FAIL>`.
4. On FAIL: stop. Without `--no-gate`, reply with the Blocking line and the fix command. With `--no-gate`, run one `--fix` round with a fresh implementer and re-verify, then stop if still FAIL.
5. PRs with no path between them in the dependency graph may be implemented in parallel, each implementer spawned with `isolation: "worktree"` on its own branch. A PR's three verification workers run at once; PRs are verified one at a time on the main checkout.
6. When every PR is PASS, run the steps of `${CLAUDE_PLUGIN_ROOT}/commands/verify-stack.md`. Print `stack: <head branch> <sha7> verdict=<PASS|PARTIAL|FAIL>`.
7. With `--open-pr`, open each PR after its PASS, child PRs targeting their parent branch.

Reply with a table `PR | Branch | SHA | Size | Verdict | Bundle` for every PR attempted, then the stack verification's Scenarios table and verdict, then the first Blocking line if any. End with exactly one of: "Stack verified" (stack verdict PASS), "Stack verified in process only: <the Not run line>" (PARTIAL), "Stack verification failed" (FAIL), or "Stopped at PR-n". Never say "Stack verified" without a stack report whose verdict is PASS.
