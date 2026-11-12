import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(here, "check-stack.mjs");
const example = path.join(here, "..", "references", "example-stack-bundle");
const plan = path.join(here, "..", "..", "implementation-plan", "references", "example-plan.md");
const TEMP = [];
after(() => TEMP.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jstack-stack-"));
  TEMP.push(dir);
  fs.cpSync(example, dir, { recursive: true });
  return dir;
}
const report = (d) => fs.readFileSync(path.join(d, "report.md"), "utf8");
const write = (d, t) => fs.writeFileSync(path.join(d, "report.md"), t);
const scen = (d) => path.join(d, "artifacts", "scenarios.txt");
function run(dir, ...extra) {
  const r = spawnSync(process.execPath, [checker, dir, "--plan", plan, ...extra], { encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}
// Turn the example into a blackbox-not-run bundle.
function partial(dir) {
  write(
    dir,
    report(dir)
      .replace(/^Blackbox: .*$/m, "Blackbox: not run (profile blackbox boot is unavailable: no MySQL on this machine)")
      .replace(/BB-1 pass/g, "BB-1 not run")
      .replace("Verdict: PASS", "Verdict: PARTIAL\nNot run: BB-1 for S-1 to S-4; the profile's blackbox boot row is unavailable"),
  );
  fs.writeFileSync(scen(dir), fs.readFileSync(scen(dir), "utf8").replace(/BB-1 pass/g, "BB-1 not run"));
}

test("example stack bundle passes", () => {
  const r = run(setup());
  assert.equal(r.status, 0, r.out);
  assert.equal(r.out.trim(), "");
});

test("a plan scenario with no row fails", () => {
  const dir = setup();
  write(dir, report(dir).replace(/^\| S-3 .*\n/m, ""));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /S-3 from the plan has no row/);
});

test("a row for a scenario the plan does not have fails", () => {
  const dir = setup();
  write(dir, report(dir).replace("| S-4 Expired", "| S-9 Expired"));
  const r = run(dir);
  assert.match(r.out, /S-9 is not a scenario in the plan/);
  assert.match(r.out, /S-4 from the plan has no row/);
});

test("a row that leaves out a covering test or lists a wrong one fails", () => {
  const dir = setup();
  write(dir, report(dir).replace("| CT-2 pass | BB-1 pass | artifacts/scenarios.txt |\n| S-3", "| CT-1 pass | BB-1 pass | artifacts/scenarios.txt |\n| S-3"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /S-2 is covered by CT-2 in the plan but the row has no CT-2 result/);
  assert.match(r.out, /S-2 lists CT-1, which does not cover it in the plan/);
});

test("a result with no matching scenarios.txt line fails", () => {
  const dir = setup();
  fs.writeFileSync(scen(dir), fs.readFileSync(scen(dir), "utf8").replace("S-3 blackbox BB-1 pass", "S-3 blackbox BB-1 fail"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /S-3 BB-1 pass has no matching "S-3 blackbox BB-1 pass S-3: <test title>" line in artifacts\/scenarios\.txt/);
});

test("PASS with a failing scenario fails; FAIL with Blocking passes", () => {
  const dir = setup();
  fs.writeFileSync(scen(dir), fs.readFileSync(scen(dir), "utf8").replace("S-3 blackbox BB-1 pass", "S-3 blackbox BB-1 fail"));
  write(dir, report(dir).replace("| CT-2 pass | BB-1 pass | artifacts/scenarios.txt |\n| S-4", "| CT-2 pass | BB-1 fail | artifacts/scenarios.txt |\n| S-4"));
  let r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PASS with 1 failing scenario result/);
  write(dir, report(dir).replace("Verdict: PASS", "Verdict: FAIL\nBlocking: S-3 returns 200 over the wire, expected 409"));
  r = run(dir);
  assert.equal(r.status, 0, r.out);
});

test("blackbox not run is PARTIAL with a Not run line, never PASS", () => {
  const dir = setup();
  partial(dir);
  assert.equal(run(dir).status, 0, run(dir).out);
  write(dir, report(dir).replace("Verdict: PARTIAL", "Verdict: PASS"));
  let r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PASS while blackbox results are not run; the verdict is PARTIAL/);
  write(dir, report(dir).replace("Verdict: PASS", "Verdict: PARTIAL").replace(/^Not run: .*\n?/m, ""));
  r = run(dir);
  assert.match(r.out, /PARTIAL verdict needs a Not run: line/);
});

test("PARTIAL when everything ran fails", () => {
  const dir = setup();
  write(dir, report(dir).replace("Verdict: PASS", "Verdict: PARTIAL\nNot run: nothing"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PARTIAL but every scenario ran in both tiers; the verdict is PASS/);
});

test("Blackbox line and scenario cells must agree", () => {
  const dir = setup();
  write(dir, report(dir).replace(/^Blackbox: .*$/m, "Blackbox: not run (no boot row)"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /S-1 BB-1 is "pass" but the Blackbox line says not run/);
});

test("a component result of not run fails", () => {
  const dir = setup();
  write(dir, report(dir).replace("| CT-1 pass | BB-1 pass | artifacts/scenarios.txt |\n| S-2", "| CT-1 not run | BB-1 pass | artifacts/scenarios.txt |\n| S-2"));
  const r = run(dir);
  assert.match(r.out, /S-1 CT-1 is "not run"; component tests run in process and are never skipped/);
});

test("a PR that is not PASS blocks a PASS, and a PR missing from the table fails", () => {
  const dir = setup();
  write(dir, report(dir).replace("| 3d76cfd | PASS |", "| 3d76cfd | FAIL |"));
  let r = run(dir);
  assert.match(r.out, /verdict PASS while PR-2 is not PASS/);
  const prPlan = path.join(dir, "pr-plan.md");
  fs.writeFileSync(prPlan, "| ID | Title | Depends on |\n|---|---|---|\n| PR-1 | a | - |\n| PR-2 | b | PR-1 |\n| PR-3 | c | PR-2 |\n");
  r = run(dir, "--pr-plan", prPlan);
  assert.match(r.out, /PR-3 from the PR plan is not listed/);
});

test("new failures, missing artifacts and a malformed cell fail", () => {
  const dir = setup();
  fs.rmSync(scen(dir));
  write(dir, report(dir).replace("New failures: 0", "New failures: 2").replace("| CT-2 pass | BB-1 pass | artifacts/scenarios.txt |\n| S-4", "| passed | BB-1 pass | - |\n| S-4"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /verdict PASS with 2 new failures/);
  assert.match(r.out, /New failures: 2 but artifacts\/new-failures\.txt names 0/);
  assert.match(r.out, /required artifact "artifacts\/scenarios\.txt" not found/);
  assert.match(r.out, /S-3 Component cell "passed" must list "CT-n pass\|fail\|not run", comma separated/);
  assert.match(r.out, /S-3 Evidence cell cites no artifacts\/ file/);
});

test("missing section, bad SHA and missing plan argument fail", () => {
  const dir = setup();
  write(dir, report(dir).replace("## Scenarios\n", "## Scenario notes\n").replace(/^SHA: .*$/m, "SHA: abc"));
  const r = run(dir);
  assert.match(r.out, /missing section "Scenarios"/);
  assert.match(r.out, /Stack section needs a "SHA: <40 hex>" line/);
  const noPlan = spawnSync(process.execPath, [checker, dir], { encoding: "utf8" });
  assert.equal(noPlan.status, 1);
  assert.match(noPlan.stderr, /Usage:/);
});

test("a scenarios.txt line whose title does not start with its scenario id is not evidence", () => {
  const dir = setup();
  fs.writeFileSync(scen(dir), fs.readFileSync(scen(dir), "utf8").replace(/^(S-3 component CT-\d+ pass) S-3: .*$/m, "$1 places an order"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /S-3 CT-\d+ pass has no matching/);
});

test("a Head line that differs from the committed summary fails", () => {
  const dir = setup();
  write(dir, report(dir).replace(/^Head: passed=\d+/m, "Head: passed=999"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /Head line says passed=999 failed=0 skipped=0 but artifacts\/test-summary-head\.txt says passed=14 failed=0 skipped=0/);
});
