import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(here, "check-findings.mjs");
const example = fs.readFileSync(path.join(here, "..", "references", "findings-ledger.md"), "utf8");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jstack-findings-"));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function run(text, ...args) {
  const file = path.join(dir, "findings.md");
  if (text === null) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, text);
  const r = spawnSync(process.execPath, [checker, file, ...args], { encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

const BOTH = ["--stage", "plan", "--stage", "pr-plan"];

test("example ledger passes for both stages", () => {
  const r = run(example, ...BOTH);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.out.trim(), "");
});

test("missing ledger fails", () => {
  const r = run(null, "--stage", "plan");
  assert.equal(r.status, 1);
  assert.match(r.out, /findings ledger not found/);
});

test("a ledger with no findings and a zero count passes", () => {
  const text = "# Review findings\n\nplan: findings=0\n\n| ID | Stage | Severity | Location | Finding | Disposition |\n|---|---|---|---|---|---|\n";
  assert.equal(run(text, "--stage", "plan").status, 0);
  const r = run(text, ...BOTH);
  assert.equal(r.status, 1);
  assert.match(r.out, /no "pr-plan: findings=<n>" line; the pr-plan review has not been recorded/);
});

test("a should finding with no disposition fails", () => {
  const r = run(example.replace(/dismissed: PR-3 .*? \|/, "|"), ...BOTH);
  assert.equal(r.status, 1);
  assert.match(r.out, /findings\.md:\d+: F-3 has no disposition; write "fixed: <what changed>", "park: <owner>", or "dismissed: <reason>"/);
});

test("a disposition with no reason fails", () => {
  const r = run(example.replace(/dismissed: PR-3 .*? \|/, "dismissed: |"), ...BOTH);
  assert.equal(r.status, 1);
  assert.match(r.out, /F-3 has no disposition/);
});

test("a parked block finding fails", () => {
  const r = run(example.replace(/fixed: planner round 2 .*? \|/, "park: human |"), ...BOTH);
  assert.equal(r.status, 1);
  assert.match(r.out, /F-1 is a block finding and must be fixed, not park/);
});

test("count line that disagrees with the table fails", () => {
  const r = run(example.replace("pr-plan: findings=1", "pr-plan: findings=3"), ...BOTH);
  assert.equal(r.status, 1);
  assert.match(r.out, /pr-plan: findings=3 but the table holds 1 pr-plan row/);
});

test("bad id, stage, severity and duplicate id fail", () => {
  const r = run(
    example
      .replace("| F-2 | plan | should |", "| F-1 | plan | maybe |")
      .replace("| F-3 | pr-plan |", "| X3 | verify |"),
  );
  assert.equal(r.status, 1);
  assert.match(r.out, /duplicate finding id F-1/);
  assert.match(r.out, /severity "maybe" must be one of block, should, nit/);
  assert.match(r.out, /finding id "X3" must be F-n/);
  assert.match(r.out, /stage "verify" must be one of plan, pr-plan/);
});

test("missing table fails", () => {
  const r = run("# Review findings\n\nplan: findings=0\n", "--stage", "plan");
  assert.equal(r.status, 1);
  assert.match(r.out, /ledger needs a table with columns ID \| Stage \| Severity \| Location \| Finding \| Disposition/);
});
