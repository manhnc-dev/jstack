# jstack on Claude Code, Cursor, and Codex

Date: 2026-10-31. Author: Jacob Nguyen with Claude. Status: built and accepted on 2026-10-31, see docs/exercise/2026-10-31-multi-harness.md.

## Intent

jstack is a Claude Code plugin. The team also works in Cursor and in OpenAI Codex, and the same requirement should produce the same three artifacts whichever harness the engineer opens. This design makes the one repository install into all three without forking the skill text.

The bet is the one pstack already made in the other direction: write once for the primary harness, generate a tree per secondary harness, and keep a short adapter document that maps the primary harness's names to each secondary one. pstack is Cursor-first with a generated Claude Code tree. jstack is Claude-first with generated Cursor and Codex trees.

## Goals

- One `git clone` installs into Claude Code, Cursor, and Codex. Each harness gets a manifest in its own format and a marketplace entry at the repository root.
- Skill text, checker scripts, templates, examples, and agent briefs exist once, under the root tree. Generated trees are derived and committed, and a test fails when they are stale.
- Every jstack command is reachable by name in every harness: `/jstack:plan` in Claude Code, `/jstack-plan` in Cursor, `$jstack-plan` in Codex (shown there as `jstack:jstack-plan`, since Codex prefixes plugin skills with the plugin name).
- The agent team keeps its roles and its boundary rules (the explorer and the reviewer never write, the verifier never touches product code) in every harness, using each harness's own subagent mechanism.
- The checkers keep gating the artifacts in every harness. They are Node 20 scripts and run the same everywhere.
- Codex support is proven on this machine with the installed Codex CLI. Cursor support is proven structurally with Cursor's own template validator, because Cursor is not installed here.

## Non-goals

- No lowest-common-denominator rewrite of the root tree. Claude Code commands, agents, and skills stay as they are. The generator adapts them.
- No MCP server, hooks, or rules in any tree. jstack is prose plus scripts.
- No publication to the Cursor marketplace, the Codex plugin directory, or the Claude Code official marketplace. The trees are ready for it, submission is a separate decision.
- No per-harness model tuning. Agents run on the session model in Cursor and Codex. The adapter says where to change that.
- No exercise on acme-pass from Cursor or Codex in this iteration. The acceptance test is install plus a dry run that lists the skills and resolves the plugin root.

## Anti-goals

- Skill text that drifts between harnesses. If a sentence must differ per harness, it lives in the adapter document or in the generator's transform table, never in a hand-edited copy.
- A generated tree that references a Claude Code name the adapter does not explain. The generator fails on any Claude-only term left in a generated file that has no adapter row.
- Silent degradation. When a harness lacks a feature (Codex plugins cannot ship subagents), the tree says so and gives the one-command workaround.

## What each harness offers

Facts gathered on 2026-10-31 from the official references and from the installed Codex CLI 0.153.4.

| | Claude Code | Cursor | Codex |
|---|---|---|---|
| Manifest | `.claude-plugin/plugin.json` | `.cursor-plugin/plugin.json` (Cursor Plugin) or root `plugin.json` (Agent Plugins, skills and MCP only) | `.codex-plugin/plugin.json` (compat) or root `plugin.json` with `extensions.com.openai` |
| Marketplace at repo root | `.claude-plugin/marketplace.json`, `plugins[].source` | `.cursor-plugin/marketplace.json`, `name`, `owner`, `plugins[].source` relative path | `.agents/plugins/marketplace.json`, `plugins[].source: {source: local, path: ./...}`, `policy`, `category`; also reads `.claude-plugin/marketplace.json` as a legacy fallback |
| Skills | `skills/<name>/SKILL.md`, invoked `/jstack:<name>` | `skills/<name>/SKILL.md`, invoked `/<name>`, honours `disable-model-invocation: true` | `skills/<name>/SKILL.md`, listed to the model as `jstack:<name>` and invoked with `$`; `agents/openai.yaml` `policy.allow_implicit_invocation: false` removes a skill from the listing entirely (verified) |
| Commands | `commands/*.md`, `$ARGUMENTS`, `argument-hint`, `disable-model-invocation` | `commands/*.md` with `name` and `description`; Cursor's own migration turns commands into skills with `disable-model-invocation: true` | none; custom prompts are deprecated in favour of skills |
| Subagents | `agents/*.md`: `name`, `description`, `model`, `tools`, `skills`; spawned with the `Agent` tool and `subagent_type: jstack:jstack-<role>` | `agents/*.md`: `name`, `description`, `model` (`inherit` or a Cursor model id), `readonly`, `is_background`; spawned with the `Task` tool; built-ins `explore`, `browser` | not shipped by plugins; custom agents are TOML files in `.codex/agents/` or `~/.codex/agents/` with `name`, `description`, `developer_instructions`; built-ins `default`, `worker`, `explorer` |
| Plugin root variable | `${CLAUDE_PLUGIN_ROOT}` in command and agent text | `${CURSOR_PLUGIN_ROOT}` in `mcp.json` only | `${PLUGIN_ROOT}` in hook commands only |
| Local install | `claude plugin marketplace add <path>`, `claude plugin install jstack@jstack` | copy or symlink the tree to `~/.cursor/plugins/local/jstack`, reload | `codex plugin marketplace add <path>`, `codex plugin add jstack@jstack` |
| Name collisions | namespaced by plugin | `/plan` and `/help` are built in | `$` names are flat |

Probe on this machine, 2026-10-31: `codex plugin marketplace add /home/orca/orca/projects/jstack` registered the repo through the legacy `.claude-plugin/marketplace.json`, and `codex plugin add jstack@jstack` installed the Claude-format root as version 0.1.0, copying the whole checkout including `.git` into `~/.codex/plugins/cache/jstack/jstack/0.1.0/`. A `codex exec` session then listed the six shared skills as `jstack:implementation-plan`, `jstack:jstack-principles`, and so on. So Codex already reads the root manifest and `skills/`; what it lacks is the commands (no `commands/` support) and the agents (no plugin agents). The Codex tree adds exactly those, and the dedicated marketplace file keeps `.git` and the Claude-only files out of the install.

## Architecture

### Repository layout

```
jstack/
├── .claude-plugin/{plugin.json,marketplace.json}   Claude Code, unchanged
├── .cursor-plugin/marketplace.json                 → ./harness/cursor
├── .agents/plugins/marketplace.json                → ./harness/codex
├── commands/  agents/  skills/                      source of truth (Claude Code format)
├── docs/harness/cursor.md                           adapter: Claude Code names → Cursor
├── docs/harness/codex.md                            adapter: Claude Code names → Codex
├── scripts/build-harness.mjs                        generator
├── scripts/build-harness.test.mjs                   transform tests and freshness check
└── harness/
    ├── README.md                                    "generated, do not edit"
    ├── cursor/                                      complete Cursor Plugin
    └── codex/                                       complete Codex plugin
```

The root stays a valid Claude Code plugin. Claude Code discovers only `commands/`, `agents/`, `skills/`, and `hooks/` at the plugin root, so the nested trees under `harness/` are inert there.

### The generator

`node scripts/build-harness.mjs [--check]` reads the root tree and writes `harness/cursor` and `harness/codex` from scratch (it deletes and recreates them). With `--check` it renders to a temporary directory and exits non-zero with the list of differing paths when the committed trees are stale. `npm test` runs the check.

Transforms, applied in order to every markdown file that is copied:

1. `${CLAUDE_PLUGIN_ROOT}/commands/<cmd>.md` becomes `<jstack>/skills/jstack-<cmd>/SKILL.md`, because commands become skills in both trees. This runs before the generic root rule so the path is still recognisable.
2. `${CLAUDE_PLUGIN_ROOT}` becomes `<jstack>`, a placeholder the adapter defines as the installed plugin root. The adapter gives the command that resolves it in that harness.
3. `/jstack:<cmd>` becomes `/jstack-<cmd>` for Cursor and `$jstack-<cmd>` for Codex.
4. `jstack:jstack-<role>` becomes `jstack-<role>`.
5. `$ARGUMENTS` becomes "the text after the skill name" wherever it appears, including inline mentions such as the help command's.
6. `~/.claude/plugins/cache/jstack/jstack/<version>` paths in the guide become `<jstack>`.

The checkers import `scripts/lib/markdown.mjs` by relative path from `skills/<skill>/scripts/`, so both trees carry `scripts/lib/markdown.mjs` (without its test).

After the transforms, the generator scans every generated markdown file for Claude-only terms (`CLAUDE_PLUGIN_ROOT`, `$ARGUMENTS`, `/jstack:`, `jstack:jstack-`, `Claude Code`, `~/.claude`, `claude plugin`, `subagent_type`, `isolation:`, `AskUserQuestion`, `TodoWrite`, `Agent tool`) and fails the build if a term is present and the harness's adapter has no row for it. `Claude Code` is allowed inside the adapter and the README only.

### Commands become skills

Each `commands/<cmd>.md` becomes `skills/jstack-<cmd>/SKILL.md` in both trees:

- Frontmatter: `name: jstack-<cmd>`, `description` copied. Cursor adds `disable-model-invocation: true`. Codex instead gets `skills/jstack-<cmd>/agents/openai.yaml` with `interface.display_name`, `interface.short_description`, and `interface.default_prompt`. No `policy` block: see decision 5.
- Body: a usage line built from `argument-hint` (`Usage: /jstack-plan <requirement text or path> [--design <path>] [--slug <slug>]`), then one line that says to read the adapter once per session, then the command body with `Arguments: $ARGUMENTS` replaced by `Arguments: the text after the skill name`.

`help` and the gates keep working: the help skill lists the harness's own names because the transform rewrote them.

Prefixing with `jstack-` avoids Cursor's built-in `/plan` and `/help` and keeps the Codex `$` namespace unambiguous. The shared skills (`implementation-plan`, `pr-plan`, `verification-bundle`, `jstack-principles`, `sequence-diagrams`, `repo-profile`) keep their names; none collides with a `jstack-<cmd>` name.

### Agents

Cursor reads `agents/*.md`. The generator rewrites the frontmatter:

- `name` and `description` copied.
- `model: inherit` always. The source values `opus`, `sonnet`, `inherit` are Claude Code aliases that Cursor does not know. The adapter tells the user how to pin a Cursor model id per agent.
- `readonly: true` when the source `tools` list has no `Write` or `Edit` (explorer, reviewer). The verifier keeps write access because it writes the bundle; its "never edit product code" rule stays in the body and `/jstack-verify` still checks `git status` afterwards.
- `tools` and `skills` dropped. In place of `skills`, the body gains a first paragraph: "Read first, in this order: `<jstack>/skills/<skill>/SKILL.md` ..." listing the source `skills` entries. Where the body already has a "Read first:" line naming the principles skill, the generator leaves it and adds only the skills not already named.

Codex plugins cannot ship agents. The Codex tree carries `agents/<role>.toml` with `name`, `description`, and `developer_instructions` (the rewritten body as a TOML multi-line string), plus `scripts/install-agents.sh`. The script copies the six files into `~/.codex/agents/` (default) or `.codex/agents/` of the current repo with `--project`, replacing `<jstack>` with the absolute plugin root it derives from its own location. The Codex tree's `jstack-init` skill runs the script as its first step when `~/.codex/agents/jstack-planner.toml` is missing or names a plugin root that no longer exists (a version bump moves the cache path). The adapter documents the fallback: when an agent type is unavailable, spawn the built-in `explorer` (read-only roles) or `default` and paste the agent file as the brief.

### Adapters

`docs/harness/cursor.md` and `docs/harness/codex.md` are hand-written at the root and copied into their trees. Each has the same sections, in this order: Tools, Subagent fields, Models, Paths and `<jstack>`, Names, Harness-only features. Each row maps one Claude Code name to the harness's equivalent or says "drop it and say so". The generator's term scan reads these files, so a new Claude-only term in a skill cannot ship without an adapter row.

### Manifests and marketplaces

- `harness/cursor/.cursor-plugin/plugin.json`: `name`, `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `category: developer-tools`, `skills: ./skills/`, `agents: ./agents/`. Values come from the root `.claude-plugin/plugin.json`, so versions never diverge.
- `harness/codex/.codex-plugin/plugin.json`: the same identity fields plus `skills: ./skills/` and `interface` (`displayName`, `shortDescription`, `longDescription`, `developerName`, `category: Developer Tools`, `capabilities: [Interactive, Read, Write]`, `defaultPrompt`). `harness/codex/plugin.json` is the Agent Plugins manifest with `$schema` and the same `interface` under `extensions.com.openai`, so Codex versions that prefer the root manifest find it.
- Root `.cursor-plugin/marketplace.json`: `name: jstack`, `owner`, `metadata`, one plugin with `source: ./harness/cursor`.
- Root `.agents/plugins/marketplace.json`: `name: jstack`, `interface.displayName`, one plugin with `source: {source: local, path: ./harness/codex}`, `policy: {installation: AVAILABLE, authentication: ON_INSTALL}`, `category: Developer Tools`.

### Documentation

- README: the Install section gets three subsections, one per harness, and the Quick start shows the three spellings of each command once in a table. The sentence "jstack is a Claude Code plugin" becomes "jstack is an agent plugin for Claude Code, Cursor, and Codex".
- `docs/guide/README.md`: the checker path example loses the Claude cache path and uses `<jstack>` with a one-line note per harness.
- `harness/README.md`: generated, says what the trees are, that they are generated from the root, and the command to regenerate.
- `package.json`: `build:harness` script; `test` also runs `build-harness.mjs --check`.

## Acceptance

1. `npm test` passes, including the freshness check and the generator's transform tests.
2. `claude plugin validate --strict .` passes at the root.
3. Cursor: Cursor's `validate-template.mjs` from `cursor/plugin-template`, run from the repo root, reports zero errors against `.cursor-plugin/marketplace.json` and `harness/cursor`.
4. Codex: `codex plugin marketplace add /home/orca/orca/projects/jstack` then `codex plugin add jstack@jstack` succeed, `codex plugin list` shows `jstack@jstack installed`, and a non-interactive `codex exec` that asks for the available `$jstack-*` skills names all seven and resolves `<jstack>` to the cache path without editing anything.
5. The explorer agent's generated Cursor file has `readonly: true`; the verifier's does not.
6. No generated markdown file contains a Claude-only term that its adapter does not list.

## Decisions from the builder check

1. **Codex agents install to `~/.codex/agents/` by default.** The check found that a project install under `.codex/agents/` collides with the root command text: `verify` treats any path outside `docs/jstack/` in `git status --porcelain` as a violation, `implement` commits leftovers, and `plan` only adds `docs/jstack`. User scope avoids all three and keeps machine-specific absolute paths out of product branches. `--project` remains for teams that want to version the agents themselves. `jstack-init` re-installs when the embedded root path no longer exists, which covers a plugin version bump.
2. **Codex prefers `.agents/plugins/marketplace.json`.** Verified on Codex 0.153.4: after the file was added, `codex plugin list` switched from the legacy `.claude-plugin/marketplace.json` to it and resolved the source to `harness/codex`. No change to the Claude marketplace is needed.
3. **Transform order.** The command-path rule runs before the generic root rule, and `$ARGUMENTS` is replaced everywhere, not only on the `Arguments:` line.
4. **Shared parser ships in both trees.** `scripts/lib/markdown.mjs` is copied so the checkers resolve their import.
5. **Codex command skills stay implicitly invocable.** Found in acceptance: with `policy.allow_implicit_invocation: false`, Codex omitted the seven command skills from the model's skill list, so `$jstack-help` produced an answer without an attached skill, and removing the policy from one skill's `agents/openai.yaml` made it appear. Codex has no equivalent of Cursor's `disable-model-invocation` that keeps the skill listed, so the Codex tree ships `openai.yaml` with interface metadata only. The description and the usage line carry the "user-invoked" intent.

## Left to the builder

- Internal structure of `build-harness.mjs` (one file or a `scripts/lib/harness/` folder), as long as the transforms are unit tested.
- Exact wording of the adapter rows, within the section order above.
- Whether the Codex `install-agents.sh` is bash or Node. It must be dependency free.
