import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(here, "check-verification.mjs");
const exampleBundle = path.join(here, "..", "references", "example-bundle");

function tmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TEMP_DIRS.push(dir);
  return dir;
}

function git(repo, ...args) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function makeRepo() {
  const repo = tmpDir("jstack-repo-");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  git(repo, "add", "a.txt");
  git(repo, "commit", "-q", "-m", "first");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\ntwo\n");
  git(repo, "add", "a.txt");
  git(repo, "commit", "-q", "-m", "second");
  return repo;
}

function copyBundle(dest) {
  fs.cpSync(exampleBundle, dest, { recursive: true });
  fs.chmodSync(path.join(dest, "rerun.sh"), 0o755);
  return dest;
}

function report(bundle) {
  return fs.readFileSync(path.join(bundle, "report.md"), "utf8");
}

function writeReport(bundle, text) {
  fs.writeFileSync(path.join(bundle, "report.md"), text);
}

function setShas(bundle, repo) {
  const head = git(repo, "rev-parse", "HEAD");
  const base = git(repo, "rev-parse", "HEAD~1");
  writeReport(
    bundle,
    report(bundle)
      .replace(/^SHA: .*$/m, `SHA: ${head}`)
      .replace(/^Base: .*$/m, `Base: ${base}`),
  );
}

// Returns { bundle, repo } with the bundle SHAs rewritten to the temp repo.
function setup() {
  const repo = makeRepo();
  const bundle = copyBundle(tmpDir("jstack-bundle-"));
  setShas(bundle, repo);
  return { bundle, repo };
}

function run(bundle, repo) {
  const args = [checker, bundle];
  if (repo) args.push("--repo", repo);
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr };
}

test("example bundle passes", () => {
  const { bundle, repo } = setup();
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.out.trim(), "");
});

test("example bundle passes without a resolvable repo (format check only)", () => {
  const { bundle } = setup();
  const r = run(bundle);
  assert.equal(r.status, 0, r.out);
});

test("cited artifact that does not exist fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("Source: artifacts/size.txt.", "Source: artifacts/size.txt and artifacts/missing.json."));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /report\.md:\d+: cited artifact "artifacts\/missing\.json" not found/);
});

test("cited raw log that is absent passes while artifacts/.gitignore keeps logs local", () => {
  const { bundle, repo } = setup();
  assert.ok(!fs.existsSync(path.join(bundle, "artifacts", "test-head.log")));
  assert.equal(run(bundle, repo).status, 0);
  fs.writeFileSync(path.join(bundle, "artifacts", ".gitignore"), "rerun-*/\n");
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /artifacts\/\.gitignore must contain the line "\*\.log"/);
  assert.match(r.out, /cited artifact "artifacts\/test-head\.log" not found/);
});

test("missing reduced summary or new-failures file fails", () => {
  const { bundle, repo } = setup();
  fs.rmSync(path.join(bundle, "artifacts", "test-summary-head.txt"));
  fs.rmSync(path.join(bundle, "artifacts", "new-failures.txt"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /required artifact "artifacts\/test-summary-head\.txt" not found/);
  assert.match(r.out, /required artifact "artifacts\/new-failures\.txt" not found/);
});

test("New failures count that disagrees with new-failures.txt fails", () => {
  const { bundle, repo } = setup();
  fs.writeFileSync(path.join(bundle, "artifacts", "new-failures.txt"), "markdown.test.mjs > parses tables\n");
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /New failures: 0 but artifacts\/new-failures\.txt names 1/);
});

test("a committed raw log or rerun directory fails", () => {
  const repo = makeRepo();
  const bundle = copyBundle(path.join(repo, "docs", "jstack", "x", "verification", "PR-1"));
  setShas(bundle, repo);
  fs.writeFileSync(path.join(bundle, "artifacts", "test-head.log"), "log\n");
  fs.mkdirSync(path.join(bundle, "artifacts", "rerun-20260101T000000Z"));
  fs.writeFileSync(path.join(bundle, "artifacts", "rerun-20260101T000000Z", "summary.txt"), "x\n");
  git(repo, "add", "-f", "docs");
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /"artifacts\/test-head\.log" is committed; raw logs and rerun output stay local/);
  assert.match(r.out, /"artifacts\/rerun-20260101T000000Z\/summary\.txt" is committed/);
  git(repo, "rm", "-q", "-r", "--cached", "docs");
  git(repo, "add", "docs");
  assert.equal(run(bundle, repo).status, 0, "plain git add honours the bundle .gitignore");
});

test("uncited artifact fails", () => {
  const { bundle, repo } = setup();
  fs.writeFileSync(path.join(bundle, "artifacts", "stray.txt"), "stray\n");
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /artifact "artifacts\/stray\.txt" is not cited in report\.md/);
});

test("uncited artifact in a nested directory fails, .gitignore and rerun-* are ignored", () => {
  const { bundle, repo } = setup();
  fs.mkdirSync(path.join(bundle, "artifacts", "live"));
  fs.writeFileSync(path.join(bundle, "artifacts", "live", "resp.json"), "{}\n");
  fs.mkdirSync(path.join(bundle, "artifacts", "rerun-20260101T000000Z"));
  fs.writeFileSync(path.join(bundle, "artifacts", "rerun-20260101T000000Z", "summary.txt"), "x\n");
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /artifact "artifacts\/live\/resp\.json" is not cited in report\.md/);
  assert.doesNotMatch(r.out, /rerun-20260101T000000Z/);
  assert.doesNotMatch(r.out, /\.gitignore/);
});

test("rerun.sh not executable fails", () => {
  const { bundle, repo } = setup();
  fs.chmodSync(path.join(bundle, "rerun.sh"), 0o644);
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /rerun\.sh is not executable/);
});

test("rerun.sh with a syntax error fails bash -n", () => {
  const { bundle, repo } = setup();
  fs.appendFileSync(path.join(bundle, "rerun.sh"), "\nif [ 1 ]; then\n");
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /rerun\.sh failed bash -n/);
});

test("rerun.sh without the bash shebang or set -euo pipefail fails", () => {
  const { bundle, repo } = setup();
  const p = path.join(bundle, "rerun.sh");
  fs.writeFileSync(p, "#!/bin/sh\necho hi\n");
  fs.chmodSync(p, 0o755);
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /rerun\.sh must start with #!\/usr\/bin\/env bash/);
  assert.match(r.out, /rerun\.sh must contain "set -euo pipefail"/);
});

test("PASS verdict with new failures fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("New failures: 0", "New failures: 2"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PASS with 2 new failures/);
});

test("missing Component line fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^Component: .*\n/m, ""));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /Test summary needs a "Component: passed=<n> failed=<n> skipped=<n>" line/);
});

test("Blackbox line with neither counts nor a not-run reason fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^Blackbox: .*$/m, "Blackbox: skipped"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /Test summary needs a "Blackbox: passed=<n> failed=<n> skipped=<n>" or "Blackbox: not run \(<reason>\)" line/);
});

test("Blackbox line with counts passes", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^Blackbox: .*$/m, "Blackbox: passed=4 failed=0 skipped=0"));
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
});

test("PASS verdict with a blocking audit finding fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("A1: findings=0 block=0 should=0 nit=0", "A1: findings=1 block=1 should=0 nit=0"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PASS with 1 blocking audit finding/);
});

test("FAIL verdict with a blocking audit finding passes", () => {
  const { bundle, repo } = setup();
  writeReport(
    bundle,
    report(bundle)
      .replace("A1: findings=0 block=0 should=0 nit=0\n", "A1: findings=1 block=1 should=0 nit=0\n")
      .replace("\n- [A2]", "\n- [A1] [block] scripts/lib/markdown.mjs:12 (C-1) parseDocument signature differs from the change row; fix\n- [A2]")
      .replace("Verdict: PASS", "Verdict: FAIL\nBlocking: [A1] scripts/lib/markdown.mjs:12 (C-1) parseDocument signature differs from the change row"),
  );
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
});

test("a counted finding with no listed bullet fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^- \[A2\] .*\n/m, ""));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /A2 reports should=1 but lists 0 should findings with a disposition/);
});

test("a finding without a disposition fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/; park: .*$/m, "."));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /audit finding must read "- \[A1\|A2\] \[block\|should\|nit\] <finding>; <fix \| park: <owner> \| dismissed: <reason>>"/);
});

test("a block finding that is parked fails", () => {
  const { bundle, repo } = setup();
  writeReport(
    bundle,
    report(bundle)
      .replace("A2: findings=1 block=0 should=1 nit=0", "A2: findings=1 block=1 should=0 nit=0")
      .replace("- [A2] [should]", "- [A2] [block]")
      .replace("Verdict: PASS", "Verdict: FAIL\nBlocking: sectionText drops trailing blank lines"),
  );
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /block finding must be disposed as fix, not "park"/);
});

test("PASS verdict with a should finding disposed as fix fails, dismissed passes", () => {
  const { bundle, repo } = setup();
  const original = report(bundle);
  writeReport(bundle, original.replace(/; park: .*$/m, "; fix"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PASS with 1 should or nit finding disposed as fix/);
  writeReport(bundle, original.replace(/; park: .*$/m, "; dismissed: the plan row was amended in PR-2, see pr-plan.md"));
  assert.equal(run(bundle, repo).status, 0);
});

test("audit counts that do not add up fail", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("A2: findings=1 block=0 should=1 nit=0", "A2: findings=3 block=0 should=1 nit=0"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /A2 findings=3 does not equal block\+should\+nit=1/);
});

test("missing audit lane line fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^A1: .*\n/m, ""));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /Audits needs an "A1: findings=<n> block=<n> should=<n> nit=<n>" or "A1: missing \(<reason>\)" line/);
});

test("missing audit lane with a PASS verdict fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("A2: findings=1 block=0 should=1 nit=0", "A2: missing (no report at HEAD_SHA after one respawn)"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PASS with audit lane A2 missing/);
});

test("missing audit lane with a FAIL verdict passes", () => {
  const { bundle, repo } = setup();
  writeReport(
    bundle,
    report(bundle)
      .replace("A2: findings=1 block=0 should=1 nit=0", "A2: missing (no report at HEAD_SHA after one respawn)")
      .replace("Verdict: PASS", "Verdict: FAIL\nBlocking: audit lane A2 returned no report at HEAD_SHA"),
  );
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
});

test("missing Audits section fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("## Audits\n", "## Audit notes\n"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /missing section "Audits"/);
});

test("missing rerun exit code line fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^rerun\.sh exit code: .*\n/m, ""));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /Rerun section has no "rerun\.sh exit code:" line/);
});

test("SHA not in repo fails", () => {
  const repo = makeRepo();
  const bundle = copyBundle(tmpDir("jstack-bundle-"));
  const sha = report(bundle).match(/^SHA: ([0-9a-f]{40})$/m)[1];
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.ok(r.out.includes(`SHA ${sha} not found in repo`), r.out);
});

test("malformed SHA fails even without a repo", () => {
  const { bundle } = setup();
  writeReport(bundle, report(bundle).replace(/^SHA: .*$/m, "SHA: abc123"));
  const r = run(bundle);
  assert.equal(r.status, 1);
  assert.match(r.out, /PR section needs a "SHA: <40 hex>" line/);
});

test("FAIL verdict without a Blocking line fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("Verdict: PASS", "Verdict: FAIL"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /FAIL verdict needs a Blocking: line/);
});

test("FAIL verdict with a Blocking line and new failures passes", () => {
  const { bundle, repo } = setup();
  writeReport(
    bundle,
    report(bundle)
      .replace("New failures: 0", "New failures: 1")
      .replace("Verdict: PASS", "Verdict: FAIL\nBlocking: markdown.test.mjs > parseDocument parses tables fails on head"),
  );
  fs.writeFileSync(path.join(bundle, "artifacts", "new-failures.txt"), "markdown.test.mjs > parseDocument parses tables\n");
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
});

test("Live evidence with neither the unavailable line nor a citation fails", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^Live: unavailable .*$/m, "No live checks were run."));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /Live evidence needs "Live: unavailable \(<reason>\)" or a cited artifact/);
});

test("Live evidence with a cited artifact passes", () => {
  const { bundle, repo } = setup();
  fs.writeFileSync(path.join(bundle, "artifacts", "live-health.txt"), "GET /health 200\n");
  writeReport(bundle, report(bundle).replace(/^Live: unavailable .*$/m, "GET /health returned 200, see artifacts/live-health.txt."));
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
});

test("missing section and unfilled placeholder fail", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace("## Baseline\n", "## Baseline notes\n").replace("Verdict: PASS", "Verdict: {{PASS_OR_FAIL}}"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /missing section "Baseline"/);
  assert.match(r.out, /unfilled placeholder/);
});

test("sections out of order fail", () => {
  const { bundle, repo } = setup();
  const text = report(bundle);
  const size = text.slice(text.indexOf("## Size"), text.indexOf("## Plan conformance"));
  const moved = text.replace(size, "") + "\n" + size;
  writeReport(bundle, moved);
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /section "Size" is out of order/);
});

test("artifact over 200 KB warns on stdout without failing", () => {
  const { bundle, repo } = setup();
  fs.writeFileSync(path.join(bundle, "artifacts", "big.log"), Buffer.alloc(300 * 1024, 0x61));
  writeReport(bundle, report(bundle).replace("Source: artifacts/size.txt.", "Source: artifacts/size.txt. Full log: artifacts/big.log."));
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.stdout.includes("warning: artifacts/big.log is 300 KB, over 200 KB"), r.out);
});

test("example rerun.sh prints RERUN MATCH from a copy inside a temp git repo", () => {
  const repo = makeRepo();
  const bundle = copyBundle(path.join(repo, "docs", "jstack", "example", "verification", "PR-1"));
  const r = spawnSync(path.join(bundle, "rerun.sh"), [], { encoding: "utf8", cwd: os.tmpdir() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes("RERUN MATCH"), r.stdout + r.stderr);
  const reruns = fs.readdirSync(path.join(bundle, "artifacts")).filter((f) => f.startsWith("rerun-"));
  assert.equal(reruns.length, 1);
  const out = path.join(bundle, "artifacts", reruns[0]);
  assert.ok(fs.existsSync(path.join(out, "test-head.log")));
  assert.match(fs.readFileSync(path.join(out, "summary.txt"), "utf8"), /^Head: passed=3 failed=0 skipped=0$/m);
  assert.equal(git(repo, "worktree", "list").split("\n").length, 1, "worktrees were cleaned up");
});

test("--lane L accepts unfilled Audits placeholders; the coordinator's run does not", () => {
  const { bundle, repo } = setup();
  writeReport(
    bundle,
    report(bundle)
      .replace(/^A1: .*$/m, "A1: findings={{A1_FINDINGS}} block={{A1_BLOCK}} should={{A1_SHOULD}} nit={{A1_NIT}}")
      .replace(/^A2: .*$/m, "A2: findings={{A2_FINDINGS}} block={{A2_BLOCK}} should={{A2_SHOULD}} nit={{A2_NIT}}"),
  );
  const lane = spawnSync(process.execPath, [checker, bundle, "--repo", repo, "--lane", "L"], { encoding: "utf8" });
  assert.equal(lane.status, 0, lane.stderr);
  const full = run(bundle, repo);
  assert.equal(full.status, 1);
  assert.match(full.out, /unfilled placeholder/);
});

test("--lane L still reports a placeholder outside Audits", () => {
  const { bundle, repo } = setup();
  writeReport(bundle, report(bundle).replace(/^New failures: .*$/m, "New failures: {{N}}"));
  const r = spawnSync(process.execPath, [checker, bundle, "--repo", repo, "--lane", "L"], { encoding: "utf8" });
  assert.equal(r.status, 1);
});

test("a Commands row that did not run takes - for exit and artifact", () => {
  const { bundle, repo } = setup();
  const row = "| 5 | `./rerun.sh` | 0 | - |";
  writeReport(bundle, report(bundle).replace(row, row + "\n| 6 | blackbox boot: unavailable | - | - |"));
  assert.equal(run(bundle, repo).status, 0);
  writeReport(bundle, report(bundle).replace("| 6 | blackbox boot: unavailable | - | - |", "| 6 | blackbox boot: unavailable | n/a | - |"));
  const r = run(bundle, repo);
  assert.equal(r.status, 1);
  assert.match(r.out, /exit "n\/a" must be a number, or "-"/);
});

test("a piped command in a code span stays one Commands cell", () => {
  const { bundle, repo } = setup();
  const row = "| 5 | `./rerun.sh` | 0 | - |";
  writeReport(bundle, report(bundle).replace(row, "| 5 | `./rerun.sh | tail -n 1` | 0 | - |"));
  const r = run(bundle, repo);
  assert.equal(r.status, 0, r.out);
});
