---
name: repo-profile
description: Interview a repository and write docs/jstack/repo-profile.md, the single source of build, test, test tier, lint, live, blackbox boot, and convention facts every other jstack skill reads. Use for $jstack-init or when the profile is missing or stale.
---

# Repo profile

Every other jstack skill reads `docs/jstack/repo-profile.md` instead of rediscovering the repo. The profile is short, factual, and verified by running the commands it names.

## Steps

1. **Detect the build tool.** Look for `package.json`, `build.gradle` or `build.gradle.kts`, `pom.xml`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `Makefile`. Note monorepo markers such as `settings.gradle` with several modules, `pnpm-workspace.yaml`, or `packages/`.
2. **Read CI for the authoritative commands.** `.github/workflows/*.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `cloudbuild*.yaml`. What CI runs is the command the profile names. Record when CI skips tests.
3. **Find the tests.** Test directories, framework, mocking library, and where the reporter writes results. Gradle writes `build/test-results/test/*.xml`. Jest and Vitest write JSON with `--json --outputFile`. pytest writes `--junitxml`.
4. **Pick the summary command.** One line that prints `passed=<n> failed=<n> skipped=<n>` from the reporter output. Use the snippets below.
5. **Decide the live row.** If the app can boot on this machine with a documented command and a ready signal, record the command. If it needs a database, credentials, or Docker that is not present, write `unavailable` and the reason. Never leave it blank.
5b. **Find the test tiers.** Read `<jstack>/skills/test-tiers/SKILL.md` and the stack reference under its `references/`. Record how the repo separates unit, component and blackbox tests today (name pattern, tag, Gradle source set, a second jest config), the command for each tier or `none yet` with the location the stack reference prescribes, and the stub tooling present: Mockito or `@MockBean`, `overrideProvider`, WireMock, a stub server, docker compose test services, an embedded database. Then decide the `blackbox boot` row the same way as `live`: a build and start command whose stub addresses come from env or a profile, the ready probe and port, or `unavailable` with the reason. The `live` row is for driving the real app against real dependencies; `blackbox boot` is for the app against stubs. They often share the start command and differ in configuration.
6. **Confirm you are on trunk.** Run `git rev-parse --abbrev-ref HEAD` and compare with the trunk name. A checkout on a feature branch can differ from trunk in Java version, build tool, and test count, and a baseline taken there is wrong. When the checkout is not on trunk, measure in a worktree: `git worktree add <path> origin/<trunk>`. Record the trunk SHA you measured.
7. **Run the test command once** on trunk and record the baseline line and the failing classes. This is the number the verifier compares against.
8. **Write the profile** from `references/repo-profile-template.md`. Replace every `{{...}}`. Commit it on trunk or on the current plan branch as the command instructs.

## Summary command snippets

JUnit XML (Gradle, Maven, pytest junitxml):

```bash
python3 -c 'import glob,xml.etree.ElementTree as E;t=f=e=s=0
for p in glob.glob("build/test-results/test/*.xml"):
  r=E.parse(p).getroot();t+=int(r.get("tests",0));f+=int(r.get("failures",0));e+=int(r.get("errors",0));s+=int(r.get("skipped",0))
print(f"passed={t-f-e-s} failed={f+e} skipped={s}")'
```

Jest or Vitest JSON (`--json --outputFile=test-results.json`):

```bash
node -e 'const r=require("./test-results.json");console.log(`passed=${r.numPassedTests} failed=${r.numFailedTests} skipped=${r.numPendingTests}`)'
```

Go (`go test -json ./... > go-test.json`):

```bash
node -e 'const l=require("fs").readFileSync("go-test.json","utf8").trim().split("\n").map(JSON.parse).filter(x=>x.Test);const c=a=>l.filter(x=>x.Action===a).length;console.log(`passed=${c("pass")} failed=${c("fail")} skipped=${c("skip")}`)'
```

## Rules

- Record what you ran, not what the README promises. If the documented command fails, record the failure and the flag that fixed it, such as `--offline`.
- Keep the profile under 100 lines. It is read by every agent on every run.
- Secrets never go in the profile. Name the variable, not the value.
