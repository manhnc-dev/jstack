import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach((d) => rmSync(d, { recursive: true, force: true })));

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "pr-size.sh");

const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

function git(repo, ...args) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", env });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function lines(n, prefix) {
  return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n") + "\n";
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "jstack-pr-size-"));
  TEMP_DIRS.push(repo);
  git(repo, "init", "-q");
  git(repo, "config", "user.name", "jstack test");
  git(repo, "config", "user.email", "jstack@example.invalid");
  git(repo, "config", "commit.gpgsign", "false");

  // Commit 1: a small baseline.
  writeFileSync(join(repo, "a.txt"), "base\n");
  writeFileSync(join(repo, "b.txt"), lines(3, "b"));
  writeFileSync(join(repo, "package-lock.json"), "{}\n");
  mkdirSync(join(repo, "docs", "jstack", "x"), { recursive: true });
  writeFileSync(join(repo, "docs", "jstack", "x", "plan.md"), "# plan\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  git(repo, "tag", "t0");

  // Commit 2: 3 lines to a.txt, 100 to package-lock.json, 50 to docs/jstack.
  appendFileSync(join(repo, "a.txt"), lines(3, "a"));
  appendFileSync(join(repo, "package-lock.json"), lines(100, "lock"));
  appendFileSync(join(repo, "docs", "jstack", "x", "plan.md"), lines(50, "plan"));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "feature");
  git(repo, "tag", "t1");

  // Commit 3: other exclusions, a deletion, and a binary file.
  mkdirSync(join(repo, "src", "generated"), { recursive: true });
  mkdirSync(join(repo, "generated"), { recursive: true });
  writeFileSync(join(repo, "src", "generated", "api.ts"), lines(40, "gen"));
  writeFileSync(join(repo, "generated", "schema.ts"), lines(40, "gen"));
  writeFileSync(join(repo, "app.min.js"), lines(30, "min"));
  writeFileSync(join(repo, "style.min.css"), lines(30, "min"));
  writeFileSync(join(repo, "x.snap"), lines(30, "snap"));
  writeFileSync(join(repo, "yarn.lock"), lines(30, "y"));
  writeFileSync(join(repo, "pnpm-lock.yaml"), lines(30, "p"));
  writeFileSync(join(repo, "Gemfile.lock"), lines(30, "g"));
  writeFileSync(join(repo, "Cargo.lock"), lines(30, "c"));
  writeFileSync(join(repo, "go.sum"), lines(30, "s"));
  writeFileSync(join(repo, "gradle.lockfile"), lines(30, "gr"));
  mkdirSync(join(repo, "sub"), { recursive: true });
  writeFileSync(join(repo, "sub", "deps.lock"), lines(30, "l"));
  writeFileSync(join(repo, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));
  writeFileSync(join(repo, "b.txt"), lines(2, "b"));
  writeFileSync(join(repo, "src", "real.ts"), lines(5, "real"));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "more");
  git(repo, "tag", "t2");
  return repo;
}

function size(repo, ...args) {
  const r = spawnSync("bash", [script, ...args, "--repo", repo], { encoding: "utf8", env });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, lines: r.stdout.split("\n").filter(Boolean) };
}

test("counts only a.txt and excludes lockfile and docs/jstack", () => {
  const repo = makeRepo();
  const r = size(repo, "t0", "t1");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lines[0], "added=3 deleted=0 total=3 budget=500 status=OK");
  assert.deepEqual(r.lines.slice(1), ["3\t0\ta.txt"]);
});

test("--budget 2 reports OVER and exits 3", () => {
  const repo = makeRepo();
  const r = size(repo, "t0", "t1", "--budget", "2");
  assert.equal(r.status, 3);
  assert.equal(r.lines[0], "added=3 deleted=0 total=3 budget=2 status=OVER");
  assert.deepEqual(r.lines.slice(1), ["3\t0\ta.txt"]);
});

test("excludes generated, minified, snapshots, every lockfile, and counts binaries as 0", () => {
  const repo = makeRepo();
  const r = size(repo, "t1", "t2");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lines[0], "added=5 deleted=1 total=6 budget=500 status=OK");
  const paths = r.lines.slice(1).map((l) => l.split("\t")[2]).sort();
  assert.deepEqual(paths, ["b.txt", "logo.png", "src/real.ts"]);
  assert.ok(r.lines.includes("0\t0\tlogo.png"));
  assert.ok(r.lines.includes("0\t1\tb.txt"));
});

test("uses the three-dot range so base-only commits do not count", () => {
  const repo = makeRepo();
  git(repo, "checkout", "-q", "-b", "side", "t0");
  writeFileSync(join(repo, "side.txt"), lines(7, "side"));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "side");
  const r = size(repo, "t1", "side");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lines[0], "added=7 deleted=0 total=7 budget=500 status=OK");
  assert.deepEqual(r.lines.slice(1), ["7\t0\tside.txt"]);
});

test("missing refs is a usage error", () => {
  const repo = makeRepo();
  const r = size(repo, "t0");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
});

test("a non-numeric budget is a usage error", () => {
  const repo = makeRepo();
  const r = size(repo, "t0", "t1", "--budget", "lots");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
});

test("an unknown ref exits 2", () => {
  const repo = makeRepo();
  const r = size(repo, "t0", "nope");
  assert.equal(r.status, 2);
});
