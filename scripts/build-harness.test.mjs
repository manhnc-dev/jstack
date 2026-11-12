import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach((d) => rmSync(d, { recursive: true, force: true })));
const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "build-harness.mjs");
const installer = join(here, "harness-assets", "install-agents.sh");

function tmp() {
  const d = mkdtempSync(join(tmpdir(), "jstack-build-harness-"));
  TEMP_DIRS.push(d);
  return d;
}

function run(args, opts = {}) {
  return spawnSync("node", [script, ...args], { encoding: "utf8", ...opts });
}

test("build writes the trees, check passes, a stale byte fails the check", () => {
  const out = tmp();
  const build = run(["--out", out]);
  assert.equal(build.status, 0, build.stderr);
  assert.match(build.stdout, /^wrote \d+ files/);
  assert.ok(existsSync(join(out, "cursor", ".cursor-plugin", "plugin.json")));
  assert.ok(existsSync(join(out, "codex", ".codex-plugin", "plugin.json")));
  const fresh = run(["--check", "--out", out]);
  assert.equal(fresh.status, 0, fresh.stdout);
  assert.match(fresh.stdout, /fresh/);
  writeFileSync(join(out, "codex", "README.md"), "edited by hand");
  const stale = run(["--check", "--out", out]);
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /STALE changed codex\/README\.md/);
});

test("install-agents.sh copies the TOML files with <jstack> resolved, user scope by default", () => {
  const out = tmp();
  assert.equal(run(["--out", out]).status, 0);
  const codexHome = tmp();
  const r = spawnSync("bash", [join(out, "codex", "scripts", "install-agents.sh")], { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } });
  assert.equal(r.status, 0, r.stderr);
  const dir = join(codexHome, "agents");
  for (const role of ["explorer", "planner", "splitter", "implementer", "verifier", "reviewer"]) {
    const text = readFileSync(join(dir, `jstack-${role}.toml`), "utf8");
    assert.ok(!text.includes("<jstack>"), `${role} still has the placeholder`);
    assert.ok(text.startsWith(`# jstack root: ${join(out, "codex")}\n`));
    assert.ok(text.includes(`${join(out, "codex")}/skills/jstack-principles/SKILL.md`));
  }
  assert.match(r.stdout, /wrote .*jstack-verifier\.toml/);
});

test("install-agents.sh --project writes into ./.codex/agents and rejects unknown flags", () => {
  const out = tmp();
  assert.equal(run(["--out", out]).status, 0);
  const project = tmp();
  const r = spawnSync("bash", [join(out, "codex", "scripts", "install-agents.sh"), "--project"], { encoding: "utf8", cwd: project });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(project, ".codex", "agents", "jstack-planner.toml")));
  const bad = spawnSync("bash", [installer, "--nope"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  const noAgents = tmp();
  mkdirSync(join(noAgents, "scripts"));
  writeFileSync(join(noAgents, "scripts", "install-agents.sh"), readFileSync(installer));
  const missing = spawnSync("bash", [join(noAgents, "scripts", "install-agents.sh")], { encoding: "utf8", env: { ...process.env, CODEX_HOME: tmp() } });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no agents\/ directory/);
});
