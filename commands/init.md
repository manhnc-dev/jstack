---
description: Interview this repo and write docs/jstack/repo-profile.md (build, test, lint, live, conventions, baseline). Run once per repo and again when tooling changes.
argument-hint: "[--no-baseline]"
disable-model-invocation: true
---

Create or refresh `docs/jstack/repo-profile.md` for the repository in the current working directory.

Arguments: `$ARGUMENTS`

Steps:

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/repo-profile/SKILL.md` in full.
2. Spawn one `jstack:jstack-explorer` subagent. Its brief: "Follow the repo-profile skill at `${CLAUDE_PLUGIN_ROOT}/skills/repo-profile/SKILL.md` steps 1 to 5b for the repo at `<cwd>`, reading `${CLAUDE_PLUGIN_ROOT}/skills/test-tiers/SKILL.md` and its stack reference for step 5b. Return every fact the template at `${CLAUDE_PLUGIN_ROOT}/skills/repo-profile/references/repo-profile-template.md` asks for, in the explorer report shape, plus a `## Profile facts` section with one line per template placeholder. Do not write files." Attach the cwd.
3. Unless `--no-baseline` is given, run the test command the explorer returned yourself, from the repo root, then run the summary command. Record the `passed= failed= skipped=` line and the failing test classes. If the command fails to start, record the error and the flag you tried.
4. Write `docs/jstack/repo-profile.md` from the template with every `{{...}}` replaced. Keep it under 80 lines. Never write a secret value.
5. Confirm with `grep -c '{{' docs/jstack/repo-profile.md` printing `0`.
6. Do not commit. The next command commits the profile with its plan. If `git check-ignore -q docs/jstack` succeeds, say so in the reply; `/jstack:plan` adds the `.gitignore` exception.

Reply with: the Commands table from the profile verbatim, the baseline line, and the `live` and `blackbox boot` rows' status in one sentence each.
