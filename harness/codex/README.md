# jstack for Codex

This folder is generated from the Claude Code plugin at the repository root by `node scripts/build-harness.mjs`. Do not edit it here; edit the root and regenerate. Full documentation: https://github.com/manhnc-dev/jstack.

## Install

```bash
codex plugin marketplace add manhnc-dev/jstack   # or a local clone path
codex plugin add jstack@jstack
```

Start a new Codex session, then run `$jstack-init` in your repo. It installs the six jstack agents into `~/.codex/agents/` the first time (Codex plugins cannot ship agents) and asks you to start one more session.

## Commands

| Skill | Does |
|---|---|
| `$jstack-init` | Interview this repo and write docs/jstack/repo-profile.md (build, test, lint, live, conventions, baseline). |
| `$jstack-plan` | Turn a requirement (and optional design) into docs/jstack/<slug>/implementation-plan.md with class and method level sequence diagrams, checked and reviewed. |
| `$jstack-pr-plan` | Split an implementation plan into docs/jstack/<slug>/pr-plan.md, a stack of PRs each under 500 changed lines with tests, checked and reviewed. |
| `$jstack-implement` | Implement one PR from the pr-plan on its own stacked branch with a fresh implementer agent, test first, small commits. |
| `$jstack-verify` | Independently verify one implemented PR with three fresh workers. |
| `$jstack-verify-stack` | Verify the whole feature end to end at the top of a jstack stack. |
| `$jstack-build` | Run the whole stack from the pr-plan, implement then verify each PR in dependency order, stop at the first FAIL. |
| `$jstack-help` | Which jstack command fits what you are trying to do, and where the artifacts land. |

Commands are skills in Codex. Type the skill name, then the arguments. Human gates after $jstack-plan and $jstack-pr-plan. Nothing merges.

Each skill starts by reading `docs/harness/codex.md`, which maps the Claude Code names in the shared text to Codex. `<jstack>` in any file means this folder once installed.
