# jstack in Codex

jstack is written for Claude Code. The Codex tree under `harness/codex` is generated from it, and a few Claude Code names survive the generation because they have no one-word Codex equivalent. Read this file once per session, then map each name with the tables below. `<jstack>` means the installed plugin root, the folder that holds `skills/` and `agents/`. If a row says drop, drop the field and say so in one line. Never pass a field the tool schema rejects.

## Tools

| Claude Code | Codex |
| --- | --- |
| The `Agent` tool, "spawn" | Codex's multi-agent tools: spawn an agent, send it input, wait for it, close it. Put everything the agent needs in the first message; it starts with an empty context. |
| `AskUserQuestion` | Ask in plain text and wait. Under `codex exec` nobody answers, so stop and report the question as the result. |
| `Read`, `Grep`, `Glob`, `Bash` | The shell tool. Use `rg` for search. |

## Subagent fields

| Claude Code | Codex |
| --- | --- |
| Spawn `jstack-<role>` | Spawn an agent of type `jstack-<role>`. Codex plugins cannot ship agents, so the six roles are TOML files in `<jstack>/agents/` that must be installed once per machine: `bash <jstack>/scripts/install-agents.sh` writes them to `~/.codex/agents/` (add `--project` for `.codex/agents/` in the current repo, which you then commit yourself). Then start a new Codex session. `$jstack-init` runs the script for you when `~/.codex/agents/jstack-planner.toml` is missing or points at a plugin root that no longer exists. |
| A role that is still unavailable | Spawn the built-in `explorer` for `jstack-explorer` and `jstack-reviewer`, and `default` for the other four. Paste the `developer_instructions` from `<jstack>/agents/jstack-<role>.toml` at the top of the first message, with `<jstack>` replaced by the real path. |
| Read-only roles (`jstack-explorer`, `jstack-reviewer`) | Codex cannot withhold edits per agent. The brief says "do not edit files"; after the agent returns, run `git status --porcelain` and treat any change as a finding. |
| `isolation: "worktree"` | Run `git worktree add <path> <branch>` yourself and tell the agent to work in `<path>`. Codex agents inherit the parent's sandbox and approval policy. |
| `model: opus`, `model: sonnet`, `model: inherit` | Agents run on `agents.default_subagent_model` from your Codex config. To pin one, add `model = "<id>"` and `model_reasoning_effort = "<level>"` to its TOML file. |
| `tools:` and `skills:` frontmatter | Dropped. Each `developer_instructions` starts with the skills to read, as `<jstack>/skills/<skill>/SKILL.md` paths. |

## Models

Agents run on the Codex subagent defaults unless pinned in their TOML file. Reasoning effort is per agent file too.

## Paths and `<jstack>`

| Claude Code | Codex |
| --- | --- |
| `${CLAUDE_PLUGIN_ROOT}` | `<jstack>`. It is the folder two levels above the `SKILL.md` you are following. If you have lost that path, run `ls -d ~/.codex/plugins/cache/*/jstack/*/ 2>/dev/null \| head -1`. If nothing prints, ask the user where the jstack plugin folder is. |
| `~/.claude/plugins/cache/jstack/jstack/<version>/` | `<jstack>` |
| `${CLAUDE_PLUGIN_ROOT}/commands/<cmd>.md` | `<jstack>/skills/jstack-<cmd>/SKILL.md`. Commands are skills in Codex. |
| `.claude/`, `CLAUDE.md` | `.codex/`, `AGENTS.md`. jstack writes only `~/.codex/agents/jstack-*.toml`, and only when installing the agents. Nothing lands in the target repo outside `docs/jstack/`. |

## Names

| Claude Code | Codex |
| --- | --- |
| `/jstack:<cmd>` | `$jstack-<cmd>`. Codex lists plugin skills with the plugin prefix, so it appears as `jstack:jstack-<cmd>` in `/skills`. The command skills are listed like any other skill; run one only when the user names it or asks for exactly what it does. |
| `Arguments: $ARGUMENTS` | Arguments are the text the user typed after `$jstack-<cmd>` in the same message. |
| Skill `jstack:<skill>` | The plugin skill `jstack:<skill>`, at `<jstack>/skills/<skill>/SKILL.md`. Read the file. |
| `claude plugin validate`, `claude plugin install` | `codex plugin marketplace add <repo>` and `codex plugin add jstack@jstack`. Validation happens in the jstack repo with `npm test`. |

## Codex-only features

jstack uses no Codex Apps, hooks, or Cloud tasks. `--open-pr` runs `gh pr create` in every harness, so that step is never skipped. A step this file does not cover is executed as written when Codex offers the same capability, and otherwise skipped with one line, `Skipped in Codex: <step>. <reason>.`, before the next step.
