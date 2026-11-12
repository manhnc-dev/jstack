# jstack guide: a first run in ten minutes

This walks one feature through the pipeline on a real repo, with the repo as the working directory. Commands are shown in Claude Code spelling. In Cursor type `/jstack-<cmd>` and in Codex `$jstack-<cmd>`; everything else is the same.

## 0. Install and open the repo

Install for your harness with the three-step block in the README (Claude Code, Cursor, or Codex), then open your repo in that harness.

```bash
cd ~/src/your-repo
```

## 1. Profile the repo

```
/jstack:init
```

An explorer reads the build files and CI, picks the test and summary commands, and decides whether the app can boot here. The command runs the suite once and records the baseline. Open `docs/jstack/repo-profile.md`. Fix any row that is wrong. This file is what every later agent trusts.

## 2. Plan

Write the requirement in a file, or paste it inline. Add `--design` when a solution design exists.

```
/jstack:plan docs/req/cache-customer-on-otp-verify.md
```

What happens: a branch `jstack/<slug>/plan` is created, an explorer maps the call chain, a planner writes the plan with sequence diagrams, the checker runs, a reviewer reads it, and `block` findings are fixed. The command stops.

**Gate 1.** Read the Summary, then the diagrams. If a method or a flow is wrong, say so in chat and run `/jstack:plan` again with the correction in the requirement, or edit the plan and run the checker by hand:

```bash
node <jstack>/skills/implementation-plan/scripts/check-plan.mjs docs/jstack/<slug>/implementation-plan.md
```

`<jstack>` is the installed plugin root: `~/.claude/plugins/cache/jstack/jstack/<version>` in Claude Code, `~/.cursor/plugins/local/jstack` in Cursor, `~/.codex/plugins/cache/jstack/jstack/<version>` in Codex.

## 3. Split

```
/jstack:pr-plan
```

The splitter groups change rows into PRs under 500 lines, orders them so trunk stays green, and draws the dependency graph. The checker refuses a cycle, an unassigned change, or a PR without tests.

**Gate 2.** Read the Stack overview. Merge two PRs or split one by editing the table and the sections, then re-run the checker. When it reads right, go.

## 4. Implement and verify one PR

```
/jstack:implement PR-1
```

A fresh implementer writes the failing test, then the code, commits per unit, and reports size. Then three fresh workers judge it at once. The gates lane runs the suite on base and head, measures size, checks every change row is in the diff, writes `report.md`, `rerun.sh`, and `artifacts/`, and runs `rerun.sh` once. Two audit lanes read the diff against the plan, one for contract and behaviour, one for design and boundary. The coordinator folds their findings into the report's `Audits` section, a `block` turns the verdict to FAIL, and the checker gates the bundle.

Open `docs/jstack/<slug>/verification/PR-1/report.md`. The Verdict is the last section. To reproduce it yourself:

```bash
docs/jstack/<slug>/verification/PR-1/rerun.sh
```

It prints `RERUN MATCH` when the head suite gives the same failed count the report recorded.

## 5. Run the rest unattended

```
/jstack:build --no-gate
```

Each remaining PR is implemented and verified in order. The run stops at the first FAIL with the fix command. Add `--open-pr` to open stacked PRs on GitHub after each PASS.

## When something is wrong

- Checker output is the contract. Fix the artifact until it is clean.
- A FAIL verdict names the first blocking finding. `/jstack:implement PR-n --fix "<finding>"` sends it to a fresh implementer.
- A verification worker modified product code? The verify command reverts it and forces FAIL. That is the boundary working.
- An audit lane reported `should` findings on a PASS? They are in the report's `Audits` section with a disposition. `park` means a later PR or you own it; nothing is lost, nothing blocked.
- Baseline is red on trunk? Expected. The verdict is about new failures only. Pre-existing ones are listed in the report.
