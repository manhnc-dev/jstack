---
name: jstack-verify
description: "Independently verify one implemented PR with three fresh workers. The gates lane runs base and head suites, measures size, checks plan conformance, captures evidence, writes report.md, rerun.sh and artifacts under docs/jstack/<slug>/verification/<PR-n>/; two audit lanes read the diff against the plan; the coordinator folds their findings into the report and the bundle checker gates the result."
---

# $jstack-verify

Usage: `$jstack-verify <PR-n | slug/PR-n> [--slug <slug>] [--open-pr]`

In Codex, read `<jstack>/docs/harness/codex.md` once per session before you follow this skill. It maps the Claude Code names jstack uses to Codex.

Verify one PR with evidence a human can re-run. You coordinate. Three fresh workers that did not write the code do the work in parallel: `jstack-verifier` as the gates lane (L), and `jstack-reviewer` twice, as audit lane A1 (contract and behaviour) and audit lane A2 (design and boundary). None of you edits product code. One verdict comes out.

Arguments: the text after the skill name

Resolve inputs with the slug rule from `<jstack>/skills/jstack-implement/SKILL.md`. The branch is `jstack/<slug>/pr-<n>` and must exist. The base is the branch rule's base for this PR. Record `HEAD_SHA` and `BASE_SHA` with `git rev-parse`.

Re-verifying after a fix round: the head moved, so nothing from the earlier round is evidence. Delete `docs/jstack/<slug>/verification/PR-<n>/` in the working tree (git keeps the old round in history), have all three workers start from an empty bundle at the new `HEAD_SHA`, and add one line under the report's `Verdict:` line, `Previous round: FAIL at <sha7> (<its Blocking line>)`.

Steps:

1. Read `<jstack>/skills/verification-bundle/SKILL.md`.
2. `git switch jstack/<slug>/pr-<n>`. Record `git status --porcelain` output as the pre-state; it should be empty.
3. Spawn the three workers in one message so they run at once, all at `HEAD_SHA`:
   - L, `jstack-verifier`, with: repo root, slug, PR id, branch, `HEAD_SHA`, `BASE_SHA`, the profile path, the PR section of the pr-plan, the PR's change rows and its `CT-n` and `BB-n` rows from the implementation plan, the bundle path `docs/jstack/<slug>/verification/PR-<n>/`, the baseline cache path `docs/jstack/<slug>/verification/baseline-<first 7 of BASE_SHA>/`, the template paths under `<jstack>/skills/verification-bundle/references/`, and the checker command with `--lane L` (the worker's run skips the `Audits` section, which is yours).
   - A1 and A2, `jstack-reviewer`, each with its lane name, `HEAD_SHA`, `BASE_SHA`, the PR section of the pr-plan, the PR's change rows and test rows, and the plan branch name for the whole-stack view. They read `git diff <BASE_SHA>...<HEAD_SHA>` and return findings; they write nothing. On a machine that can run only one suite at a time, tell them not to run tests and to cite the gates lane's artifacts instead.
4. Boundary check. When all three return, run `git status --porcelain`. Any path not under `docs/jstack/` is a violation: run `git checkout -- <path>` (or delete it when untracked), then edit the report's Verdict section to `Verdict: FAIL` with `Blocking: verification worker modified product code (<paths>)`.
5. Fold the audits into the report. An audit report whose first line is not `Lane: A<1|2> at <HEAD_SHA>` is dropped and that lane is respawned once; if the second report is also missing or not at `HEAD_SHA`, write `A<1|2>: missing (<reason>)`. Otherwise write, in the report's `Audits` section, one line per lane `A1: findings=<n> block=<n> should=<n> nit=<n>` and `A2: ...`, then every finding as `- [A1|A2] [block|should|nit] <path>:<line> (<id>) <finding>; <disposition>`. The disposition is `fix` (goes into the Blocking line and the fix command), `park: <owner>` (a later PR or the human), or `dismissed: <reason you can show>`. Every `block` is `fix`. Every `should` and `nit` gets one of the three, and the checker refuses a finding without one. Then set the verdict: `FAIL` when L reported FAIL, when any audit finding is `block`, or when a lane is missing; `Blocking` is L's blocking line, else the first `block` finding, else `audit lane A<n> returned no report at HEAD_SHA`. A `should` or `nit` you park or dismiss never changes a PASS; one you dispose as `fix` makes the verdict `FAIL` with that finding as `Blocking`, because `fix` means a fix round runs. An audit finding that only says the lane did not run a command is `dismissed: gates lane ran it (<artifact>)` when the gates lane's artifact shows the run.
6. Run `node <jstack>/skills/verification-bundle/scripts/check-verification.mjs docs/jstack/<slug>/verification/PR-<n> --repo <repo root>` yourself. If it prints problems, send them to a fresh verifier once. If problems remain, the verdict is FAIL with the first checker line as `Blocking`.
7. Commit the bundle on the PR branch, without raw logs. You commit; the verifier never does. The bundle's `artifacts/.gitignore` keeps `*.log` and `rerun-*/` local; the commit carries `report.md`, `rerun.sh`, `size.txt`, the reduced summaries, `new-failures.txt`, and live evidence. A repo that ignores `*.txt` or `docs/` needs a forced add, which also drags in the logs, so strip them: `git add -f docs/jstack/<slug>/verification && git ls-files docs/jstack/<slug>/verification | grep -E '/rerun-|\.log$' | xargs -r git rm -q --cached && git commit -m "test(jstack): verification bundle for PR-<n>"`. The strip covers the whole verification tree, baseline caches included. Confirm with `git show --stat HEAD | grep -E 'rerun-|\.log'` printing nothing.
8. With `--open-pr` and `Verdict: PASS`: `gh pr create --base <base branch> --head jstack/<slug>/pr-<n> --title "<PR title from the pr-plan>" --body "<## Why from the PR's Goal, ## Verification with the Verdict, Head, Baseline, New failures, and Size lines, and the bundle path>"`. Never merge.

Reply with the verifier's report shape verbatim (Verdict, Bundle, Checker, Head, Baseline, New failures, Component, Blackbox, Size, rerun.sh exit code, Blocking) plus one line `Audits: A1 findings=<n> block=<n>, A2 findings=<n> block=<n>` and the parked findings, one per line. On FAIL add one line: "Next: `$jstack-implement <PR-n> --fix \"<Blocking>\"`". On PASS add: "Next: `$jstack-implement <next PR id>`" or "Stack complete" when none remains.
