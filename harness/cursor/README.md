# jstack for Cursor

This folder is generated from the Claude Code plugin at the repository root by `node scripts/build-harness.mjs`. Do not edit it here; edit the root and regenerate. Full documentation: https://github.com/manhnc-dev/jstack.

## Install

```bash
git clone https://github.com/manhnc-dev/jstack ~/src/jstack
mkdir -p ~/.cursor/plugins/local
ln -s ~/src/jstack/harness/cursor ~/.cursor/plugins/local/jstack
```

Then reload Cursor (Developer: Reload Window) and confirm the skills and agents under Customize. A team marketplace can import the repository instead; its `.cursor-plugin/marketplace.json` points here.

## Commands

| Skill | Does |
|---|---|
| `/jstack-init` | Interview this repo and write docs/jstack/repo-profile.md (build, test, lint, live, conventions, baseline). |
| `/jstack-plan` | Turn a requirement (and optional design) into docs/jstack/<slug>/implementation-plan.md with class and method level sequence diagrams, checked and reviewed. |
| `/jstack-pr-plan` | Split an implementation plan into docs/jstack/<slug>/pr-plan.md, a stack of PRs each under 500 changed lines with tests, checked and reviewed. |
| `/jstack-implement` | Implement one PR from the pr-plan on its own stacked branch with a fresh implementer agent, test first, small commits. |
| `/jstack-verify` | Independently verify one implemented PR with three fresh workers. |
| `/jstack-verify-stack` | Verify the whole feature end to end at the top of a jstack stack. |
| `/jstack-build` | Run the whole stack from the pr-plan, implement then verify each PR in dependency order, stop at the first FAIL. |
| `/jstack-help` | Which jstack command fits what you are trying to do, and where the artifacts land. |

Commands are skills in Cursor. Type the skill name, then the arguments. Human gates after /jstack-plan and /jstack-pr-plan. Nothing merges.

Each skill starts by reading `docs/harness/cursor.md`, which maps the Claude Code names in the shared text to Cursor. `<jstack>` in any file means this folder once installed.
