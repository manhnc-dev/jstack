# jstack in Cursor

jstack is written for Claude Code. The Cursor tree under `harness/cursor` is generated from it, and a few Claude Code names survive the generation because they have no one-word Cursor equivalent. Read this file once per session, then map each name with the tables below. `<jstack>` means the installed plugin root, the folder that holds `skills/` and `agents/`. If a row says drop, drop the field and say so in one line. Never pass a field the tool schema rejects.

## Tools

| Claude Code | Cursor |
| --- | --- |
| The `Agent` tool, "spawn" | The `Task` tool. Put everything the subagent needs in the prompt; it starts with an empty context. |
| `AskUserQuestion` | Ask in plain text and wait for the reply. In a non-interactive run, stop and report the question. |
| `Read`, `Grep`, `Glob`, `Bash` | Cursor's file, search, and terminal tools. |

## Subagent fields

| Claude Code | Cursor |
| --- | --- |
| Spawn `jstack-<role>` | `Task` with the `jstack-<role>` subagent. The six roles ship in `<jstack>/agents/` and appear in Cursor's subagent list after the plugin is installed. If a role is missing from the list, use the general subagent and paste `<jstack>/agents/jstack-<role>.md` at the top of the prompt. |
| Read-only roles (`jstack-explorer`, `jstack-reviewer`) | Their agent files carry `readonly: true`, so Cursor withholds edits. The brief still says "do not edit files". |
| `isolation: "worktree"` | Ask Cursor to run the subagent in an isolated Git worktree when the Task tool offers it. Otherwise run `git worktree add <path> <branch>` yourself and name the path in the brief. |
| `model: opus`, `model: sonnet`, `model: inherit` | Every agent file says `model: inherit`, so agents run on the session model. To pin one, edit `<jstack>/agents/<role>.md` and set `model` to a Cursor model id, such as `claude-opus-5[effort=high]`. |
| `tools:` and `skills:` frontmatter | Dropped. Each agent body starts with the skills to read, as `<jstack>/skills/<skill>/SKILL.md` paths. |

## Models

Agents run on the session model unless you pin them as above. Cursor may fall back to a compatible model when the pinned one is unavailable on your plan.

## Paths and `<jstack>`

| Claude Code | Cursor |
| --- | --- |
| `${CLAUDE_PLUGIN_ROOT}` | `<jstack>`. Resolve it once per session with `ls -d ~/.cursor/plugins/local/jstack ~/.cursor/plugins/*/jstack 2>/dev/null \| head -1`. If nothing prints, ask the user where the jstack plugin folder is and use that path. |
| `~/.claude/plugins/cache/jstack/jstack/<version>/` | `<jstack>` |
| `${CLAUDE_PLUGIN_ROOT}/commands/<cmd>.md` | `<jstack>/skills/jstack-<cmd>/SKILL.md`. Commands are skills in Cursor. |
| `.claude/`, `CLAUDE.md` | `.cursor/`, `AGENTS.md` or `.cursor/rules/`. jstack never writes to either. |

## Names

| Claude Code | Cursor |
| --- | --- |
| `/jstack:<cmd>` | `/jstack-<cmd>`. The prefix avoids Cursor's built-in `/plan` and `/help`. |
| `Arguments: $ARGUMENTS` | Arguments are the text the user typed after `/jstack-<cmd>`. |
| Skill `jstack:<skill>` | `<jstack>/skills/<skill>/SKILL.md`. Read it; do not look for a slash command. |
| `claude plugin validate`, `claude plugin install` | Cursor has no equivalent CLI here. Validation happens in the jstack repo with `npm test`. |

## Cursor-only features

jstack uses none of Cursor's Automations, Bugbot, or cloud agents. `--open-pr` runs `gh pr create` in every harness, so that step is never skipped. A step this file does not cover is executed as written when Cursor offers the same capability, and otherwise skipped with one line, `Skipped in Cursor: <step>. <reason>.`, before the next step.
