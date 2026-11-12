---
name: jstack-implement
description: "Implement one PR from the pr-plan on its own stacked branch with a fresh implementer agent, test first, small commits. Measures size. Then runs $jstack-verify unless --no-verify."
---

# $jstack-implement

Usage: `$jstack-implement <PR-n | slug/PR-n> [--slug <slug>] [--fix "<finding>"] [--no-verify]`

In Codex, read `<jstack>/docs/harness/codex.md` once per session before you follow this skill. It maps the Claude Code names jstack uses to Codex.

Implement exactly one PR of a jstack stack. You coordinate. A fresh `jstack-implementer` writes the code. You never write product code yourself in this command.

Arguments: the text after the skill name

Resolve inputs (the slug rule): an explicit `slug/PR-n` or `--slug` wins. Else, if exactly one directory other than files exists under `docs/jstack/`, that is the slug. Else list the slugs and stop. The PR id must exist in `docs/jstack/<slug>/pr-plan.md`.

Branch rule: the PR's branch is `jstack/<slug>/pr-<n>`. Its base is the tip of `jstack/<slug>/pr-<m>` for the first PR it depends on in the Stack overview, or `jstack/<slug>/plan` when it depends on nothing. A PR with two dependencies bases on the later one in stack order, which must already contain the earlier one; if it does not, stop and say so.

Steps:

1. Read `<jstack>/skills/jstack-principles/SKILL.md`.
1b. Gate. Without `--fix`, run `node <jstack>/skills/jstack-principles/scripts/check-findings.mjs docs/jstack/<slug>/findings.md --stage plan --stage pr-plan`. If it prints anything, stop and show the lines; no PR is implemented over a review finding nobody answered.
2. Confirm the base branch exists and, when it is another PR branch, that `docs/jstack/<slug>/verification/PR-<m>/report.md` on it says `Verdict: PASS`. Without `--fix`, if a PASS is missing, stop and name the PR to verify first.
3. Create or check out the branch. Fresh PR: `git switch -c jstack/<slug>/pr-<n> <base branch>`. With `--fix`: `git switch jstack/<slug>/pr-<n>`. Record `BASE_SHA=$(git rev-parse <base branch>)`.
4. Extract the PR's section from the pr-plan, and from the implementation plan its change rows, unit rows, the scenario rows its `CT-n` and `BB-n` cover, those `CT-n` and `BB-n` rows, and the diagrams the change rows cite. Put them in the brief verbatim, with the profile's `test component`, `test blackbox`, and `blackbox boot` rows.
5. Spawn `jstack-implementer` with: the branch, the base SHA, the repo root, the profile path, the extracted sections, and with `--fix` the finding text and the verifier's report path. Tell it the exact file list from the PR's `Files.` line is its boundary.
6. When it returns, run `bash <jstack>/skills/pr-plan/scripts/pr-size.sh <BASE_SHA> HEAD --repo <repo root>` yourself and keep the first line. Run `git status --porcelain`; an unclean tree means the implementer left uncommitted work. Commit it with `chore(jstack): leftover from implementer` and note it.
7. If size is `OVER`, do not verify. Reply with the size line and say the PR plan needs a split, naming the largest files from the size output.
8. Unless `--no-verify`, continue with the steps of `<jstack>/skills/jstack-verify/SKILL.md` for this PR.

Reply with: branch, head SHA, base SHA, the size line, the implementer's test, component and blackbox lines, its commit list, and its deviations. Then the verify reply when it ran.
