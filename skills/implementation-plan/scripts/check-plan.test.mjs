import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const here = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(here, "check-plan.mjs");
const EXAMPLE = path.join(here, "..", "references", "example-plan.md");
const REPO = path.resolve(here, "..", "..", "..");

const example = fs.readFileSync(EXAMPLE, "utf8");

function run(text, name = "plan.md") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jstack-plan-"));
  TEMP_DIRS.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  const r = spawnSync(process.execPath, [CHECKER, file, "--repo", REPO], { encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

// Apply fn to every change table or test plan row whose first cell is `id`.
function editRow(text, id, fn) {
  return text
    .split("\n")
    .map((l) => (l.startsWith(`| ${id} |`) ? fn(l) : l))
    .join("\n");
}

function expectProblem(text, fragment) {
  const r = run(text);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.out}`);
  assert.ok(r.out.includes(fragment), `expected output to include ${JSON.stringify(fragment)}\n${r.out}`);
  assert.match(r.out, /^.+plan\.md:\d+: /m, "problems are file:line: message");
}

test("example plan passes with exit 0 and empty output", () => {
  const r = run(example);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.out, "");
});

test("missing Test plan heading", () => {
  const text = example.replace("## Test plan\n", "");
  assert.notEqual(text, example);
  expectProblem(text, 'missing heading "Test plan"');
});

test("Design section without a Source line", () => {
  const text = example.replace("Source: planner's draft\n", "");
  assert.notEqual(text, example);
  expectProblem(text, 'Design section has no "Source:" line');
});

test("headings out of order", () => {
  const text = example
    .replace("## Risks and rollbacks", "## TMP")
    .replace("## Open questions", "## Risks and rollbacks")
    .replace("## TMP", "## Open questions");
  assert.notEqual(text, example);
  expectProblem(text, "out of order");
});

test("summary with 13 lines", () => {
  const body = Array.from({ length: 13 }, (_, i) => `Line ${i + 1}.`).join("\n");
  const text = example.replace(/## Summary\n[\s\S]*?\n## Scope/, `## Summary\n\n${body}\n\n## Scope`);
  assert.notEqual(text, example);
  expectProblem(text, "Summary has 13 lines, max 12");
});

test("remaining placeholder", () => {
  const text = example.replace("### SD-1: Place an order with a fresh key", "### SD-1: {{caption}}");
  assert.notEqual(text, example);
  expectProblem(text, "placeholder");
});

test("change row references an unknown diagram", () => {
  const text = editRow(example, "C-3", (l) => l.replace("| SD-1 |", "| SD-9 |"));
  assert.notEqual(text, example);
  expectProblem(text, "C-3 references unknown diagram SD-9");
});

test("diagram referenced by no change row", () => {
  let text = editRow(example, "C-1", (l) => l.replace("| SD-1, SD-2 |", "| SD-1 |"));
  text = editRow(text, "C-2", (l) => l.replace("| SD-1, SD-2 |", "| SD-1 |"));
  text = editRow(text, "C-4", (l) => l.replace("| SD-2 |", "| SD-1 |"));
  assert.notEqual(text, example);
  expectProblem(text, "SD-2 is not referenced by any change row");
});

test("change row method absent from its diagrams", () => {
  const text = editRow(example, "C-2", (l) =>
    l.replace("lookup(key: IdempotencyKey): StoredResult?", "applyKey(key: IdempotencyKey): void"),
  );
  assert.notEqual(text, example);
  expectProblem(text, 'C-2 method "applyKey" does not appear in SD-1');
});

test("change row without a unit test row", () => {
  const text = editRow(example, "C-4", (l) => (l.includes("conflict error carries key") ? "" : l));
  assert.notEqual(text, example);
  expectProblem(text, "C-4 has no unit test row");
});

test("unit test row for an unknown change", () => {
  const text = editRow(example, "C-4", (l) =>
    l.includes("conflict error carries key") ? `${l}\n| C-7 | scripts/lib/nope.test.mjs | nothing | nothing |` : l,
  );
  assert.notEqual(text, example);
  expectProblem(text, "unit test row references unknown change C-7");
});

test("Test plan missing the Blackbox tests section", () => {
  const text = example.replace("### Blackbox tests", "### Black box");
  assert.notEqual(text, example);
  expectProblem(text, 'Test plan is missing the "Blackbox tests" section');
});

test("Test plan sections out of order", () => {
  const text = example
    .replace("### Component tests", "### TMP")
    .replace("### Blackbox tests", "### Component tests")
    .replace("### TMP", "### Blackbox tests");
  assert.notEqual(text, example);
  expectProblem(text, 'Test plan section "Blackbox tests" out of order');
});

test("scenario id that is not S-n", () => {
  const text = editRow(example, "S-4", (l) => l.replace("| S-4 |", "| X-4 |"));
  assert.notEqual(text, example);
  expectProblem(text, 'scenario id "X-4" must be S-n');
});

test("duplicate scenario id", () => {
  const text = editRow(example, "S-4", (l) => l.replace("| S-4 |", "| S-3 |"));
  assert.notEqual(text, example);
  expectProblem(text, "duplicate scenario id S-3");
});

test("scenario references an unknown diagram", () => {
  const text = editRow(example, "S-1", (l) => l.replace("| SD-1 |", "| SD-9 |"));
  assert.notEqual(text, example);
  expectProblem(text, "S-1 references unknown diagram SD-9");
});

test("diagram exercised by no scenario", () => {
  let text = editRow(example, "S-2", (l) => l.replace("| SD-2 |", "| SD-1 |"));
  text = editRow(text, "S-3", (l) => l.replace("| SD-2 |", "| SD-1 |"));
  assert.notEqual(text, example);
  expectProblem(text, "SD-2 is exercised by no scenario");
});

test("scenario with no component test", () => {
  const text = editRow(example, "CT-1", (l) => l.replace("| S-1, S-4 |", "| S-1 |"));
  assert.notEqual(text, example);
  expectProblem(text, "S-4 has no component test");
});

test("scenario with no blackbox test", () => {
  const text = editRow(example, "BB-1", (l) => l.replace("| S-1, S-2, S-3, S-4 |", "| S-1, S-2, S-3 |"));
  assert.notEqual(text, example);
  expectProblem(text, "S-4 has no blackbox test");
});

test("component test references an unknown scenario", () => {
  const text = editRow(example, "CT-2", (l) => l.replace("| S-2, S-3 |", "| S-2, S-9 |"));
  assert.notEqual(text, example);
  expectProblem(text, "CT-2 references unknown scenario S-9");
});

test("blackbox test with an empty Boot cell", () => {
  const text = editRow(example, "BB-1", (l) => l.replace(/\| profile `blackbox boot` row[^|]*\|/, "|  |"));
  assert.notEqual(text, example);
  expectProblem(text, 'BB-1 has an empty "Boot" cell');
});

test("modify row whose file does not exist", () => {
  const text = editRow(example, "C-1", (l) => l.replace("scripts/lib/markdown.mjs", "src/nope.mjs"));
  assert.notEqual(text, example);
  expectProblem(text, 'C-1 file "src/nope.mjs" not found');
});

test("change cell outside add, modify, delete", () => {
  const text = editRow(example, "C-1", (l) => l.replace("| modify |", "| update |"));
  assert.notEqual(text, example);
  expectProblem(text, 'C-1 change "update" must be add, modify, or delete');
});
