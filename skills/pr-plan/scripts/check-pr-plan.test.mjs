import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach((d) => rmSync(d, { recursive: true, force: true })));

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, "check-pr-plan.mjs");
const examplePrPlan = join(here, "..", "references", "example-pr-plan.md");
const realPlan = join(here, "..", "..", "implementation-plan", "references", "example-plan.md");

// Minimal implementation plan fixture. The checker reads C-ids only from
// the change table, so nothing else is needed here.
const fixturePlan = `# Implementation plan: add idempotency key to OrderService.place

## Change table

| ID | File | Class | Method | Change | Responsibility | Diagrams |
|---|---|---|---|---|---|---|
| C-1 | scripts/lib/markdown.mjs | OrderService | place(cmd: PlaceOrderCommand, key: IdempotencyKey): OrderResult | modify | Look the key up before saving, replay or conflict on a hit, record after a save. | SD-1, SD-2 |
| C-2 | scripts/lib/idempotency-store.mjs | IdempotencyStore | lookup(key: IdempotencyKey): StoredResult? | add | Return the stored result for a key, or null when unseen or expired. | SD-1, SD-2 |
| C-3 | scripts/lib/idempotency-store.mjs | IdempotencyStore | record(key: IdempotencyKey, result: OrderResult): void | add | Persist the result with a 24 hour expiry. | SD-1 |
| C-4 | scripts/lib/idempotency-conflict-error.mjs | IdempotencyConflictError | - | add | Error raised when a seen key arrives with a different payload. | SD-2 |
`;

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "jstack-pr-plan-"));
  TEMP_DIRS.push(dir);
  return dir;
}

function run(prPlanText, { plan = fixturePlan, args = [] } = {}) {
  const dir = tmp();
  const prPath = join(dir, "pr-plan.md");
  writeFileSync(prPath, prPlanText);
  const argv = [checker, prPath];
  if (plan !== null) {
    const planPath = join(dir, "implementation-plan.md");
    writeFileSync(planPath, plan);
    argv.push("--plan", planPath);
  }
  argv.push(...args);
  const r = spawnSync(process.execPath, argv, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function section(pr) {
  const labels = {
    "Goal.": `Deliver ${pr.id} as one reviewable unit.`,
    "Changes.": pr.changes,
    "Files.": `\n- \`src/order/${pr.id}.ts\``,
    "Tests.": `\n- \`test/order/${pr.id}.test.ts\` covers the happy path and one failure`,
    "Verify.": "`npm test -- order`",
    "Review focus.": "Check the public contract of the touched class.",
    "Observable.": "Nothing changes for users until the last PR.",
    "Rollback.": "Revert the merge commit.",
    ...(pr.labels || {}),
  };
  const omit = new Set(pr.omit || []);
  const lines = [`### ${pr.id}: ${pr.sectionTitle || pr.title}`, ""];
  for (const [label, content] of Object.entries(labels)) {
    if (omit.has(label)) continue;
    lines.push(`**${label}** ${content}`.replace(/ \n/, "\n"), "");
  }
  return lines.join("\n");
}

function plan({ prs, graph, extra = "" }) {
  const rows = prs
    .map((p) => `| ${p.id} | ${p.title} | ${p.deps ?? "-"} | ${p.changes} | ${p.loc ?? 120} | ${p.kind ?? "logic"} |`)
    .join("\n");
  let graphLines = graph;
  if (!graphLines) {
    graphLines = prs.map((p) => `  ${p.id}[${p.id}: ${p.title}]`);
    for (const p of prs) {
      const deps = (p.deps ?? "-") === "-" ? [] : p.deps.split(",").map((d) => d.trim());
      for (const d of deps) graphLines.push(`  ${d} --> ${p.id}`);
    }
    graphLines = graphLines.join("\n");
  }
  return `# PR plan: add idempotency key to OrderService.place

Plan: \`docs/jstack/order-idempotency-key/implementation-plan.md\`

## Stack overview

| ID | Title | Depends on | Changes | Est. LOC | Kind |
|---|---|---|---|---|---|
${rows}

## Dependency graph

\`\`\`mermaid
graph TD
${graphLines}
\`\`\`

## PRs

${prs.map(section).join("\n")}
## Sequencing rationale

Scaffold first, wiring last. Each PR is green on its own.
${extra}`;
}

const base = () => [
  { id: "PR-1", title: "feat(order): add idempotency store and conflict error", deps: "-", changes: "C-2, C-3, C-4", loc: 150, kind: "scaffold" },
  { id: "PR-2", title: "feat(order): apply idempotency key in OrderService.place", deps: "PR-1", changes: "C-1", loc: 120, kind: "wiring" },
];

test("generated two-PR plan passes", () => {
  const r = run(plan({ prs: base() }));
  assert.equal(r.stdout, "");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("example-pr-plan passes against the fixture implementation plan", () => {
  const r = run(readFileSync(examplePrPlan, "utf8"));
  assert.equal(r.stdout, "");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("example-pr-plan passes against the real example-plan", { skip: !existsSync(realPlan) && "example-plan.md not written yet" }, () => {
  const r = run(readFileSync(examplePrPlan, "utf8"), { plan: readFileSync(realPlan, "utf8") });
  assert.equal(r.stdout, "");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a change id in two PRs fails", () => {
  const prs = base();
  prs[1].changes = "C-1, C-2";
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /C-2 assigned to PR-1 and PR-2/);
});

test("a change id in no PR fails", () => {
  const prs = base();
  prs[0].changes = "C-2, C-3";
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /C-4 from the plan is not assigned to any PR/);
});

test("a change id that is not in the plan fails", () => {
  const prs = base();
  prs[1].changes = "C-1, C-9";
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-2 lists C-9 which is not in the plan/);
});

const tieredPlan = `${fixturePlan}
## Test plan

### Component tests

| ID | Scenarios | Test file | Harness | Stubs | Asserts |
|---|---|---|---|---|---|
| CT-1 | S-1 | scripts/lib/orders-http.component.test.mjs | supertest over createOrdersApp() | store fake, repository stub | 201 |

### Blackbox tests

| ID | Scenarios | Test file | Boot | Stubs | Asserts |
|---|---|---|---|---|---|
| BB-1 | S-1 | scripts/blackbox/orders.bb.test.mjs | profile blackbox boot row | key store stub server | 201 over HTTP |
`;

function twoPrPlanWithTests(pr1Tests, pr2Tests) {
  const prs = base();
  prs[0].labels = { "Tests.": `\n- \`scripts/lib/idempotency-store.test.mjs\` ${pr1Tests}` };
  prs[1].labels = { "Tests.": `\n- \`scripts/lib/order-service.test.mjs\` ${pr2Tests}` };
  return plan({ prs });
}

test("component and blackbox ids each assigned to one PR pass", () => {
  const r = run(twoPrPlanWithTests("unit cases", "CT-1 and BB-1 over the booted app"), { plan: tieredPlan });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a component test id in no PR fails", () => {
  const r = run(twoPrPlanWithTests("unit cases", "BB-1 only"), { plan: tieredPlan });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CT-1 from the plan is not assigned to any PR's Tests/);
});

test("a blackbox test id in two PRs fails", () => {
  const r = run(twoPrPlanWithTests("BB-1 early", "CT-1 and BB-1"), { plan: tieredPlan });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /BB-1 assigned to PR-1 and PR-2/);
});

test("a test id the plan does not have fails", () => {
  const r = run(twoPrPlanWithTests("unit cases", "CT-1, CT-9 and BB-1"), { plan: tieredPlan });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-2 lists CT-9 which is not in the plan/);
});

test("a plan without tier tables skips the test assignment check", () => {
  const r = run(twoPrPlanWithTests("unit cases", "CT-1 mentioned anyway"), { plan: fixturePlan });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a dependency cycle fails with the cycle named", () => {
  const prs = [
    { id: "PR-1", title: "feat(order): add key type", deps: "-", changes: "C-1" },
    { id: "PR-2", title: "feat(order): add key store", deps: "PR-3", changes: "C-2" },
    { id: "PR-3", title: "feat(order): wire the key", deps: "PR-2", changes: "C-3, C-4" },
  ];
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /dependency cycle: PR-2 -> PR-3 -> PR-2/);
});

test("estimated lines over budget fails", () => {
  const prs = base();
  prs[0].loc = 620;
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-1 estimated 620 lines exceeds budget 500/);
});

test("--budget raises the limit", () => {
  const prs = base();
  prs[0].loc = 620;
  const r = run(plan({ prs }), { args: ["--budget", "700"] });
  assert.equal(r.status, 0, r.stdout);
});

test("a non-numeric estimate fails", () => {
  const prs = base();
  prs[0].loc = "about 200";
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-1 estimated LOC "about 200" is not a number/);
});

test("a title that is not Conventional Commits fails", () => {
  const prs = base();
  prs[0].title = "Add key";
  prs[0].sectionTitle = "Add key";
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-1 title "Add key" is not Conventional Commits/);
});

test("a title ending in a period fails", () => {
  const prs = base();
  prs[0].title = "feat(order): add key.";
  prs[0].sectionTitle = prs[0].title;
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-1 title "feat\(order\): add key\." is not Conventional Commits/);
});

test("a Tests label followed by none fails", () => {
  const prs = base();
  prs[1].labels = { "Tests.": "\nnone" };
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-2 has no tests/);
});

test("an empty Tests label fails", () => {
  const prs = base();
  prs[1].labels = { "Tests.": "" };
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-2 has no tests/);
});

test("a graph edge the table does not have fails", () => {
  const prs = base();
  prs[1].deps = "-";
  const graph = "  PR-1\n  PR-2\n  PR-1 --> PR-2";
  const r = run(plan({ prs, graph }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /graph edge PR-1 --> PR-2 not in table/);
});

test("a table dependency the graph does not have fails", () => {
  const prs = base();
  const graph = "  PR-1[PR-1: store]\n  PR-2[PR-2: wiring]";
  const r = run(plan({ prs, graph }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /table dependency PR-2 -> PR-1 missing from graph/);
});

test("a graph that does not start with graph TD fails", () => {
  const prs = base();
  const text = plan({ prs }).replace("graph TD", "flowchart LR");
  const r = run(text);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /dependency graph must start with "graph TD"/);
});

test("a plan without dependencies may have a node-only graph", () => {
  const prs = base();
  prs[1].deps = "-";
  const graph = "  PR-1[PR-1: store]\n  PR-2";
  const r = run(plan({ prs, graph }));
  assert.equal(r.status, 0, r.stdout);
});

test("a missing bold label fails", () => {
  const prs = base();
  prs[0].omit = ["Rollback."];
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-1 missing "Rollback\."/);
});

test("a dependency on an unknown PR fails", () => {
  const prs = base();
  prs[1].deps = "PR-9";
  const graph = "  PR-1\n  PR-2";
  const r = run(plan({ prs, graph }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-2 depends on unknown PR-9/);
});

test("an unknown kind fails", () => {
  const prs = base();
  prs[0].kind = "feature";
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-1 kind "feature" must be scaffold, logic, wiring, or cleanup/);
});

test("a table PR without a section fails, and a section without a table row fails", () => {
  const prs = base();
  let text = plan({ prs });
  text = text.replace("### PR-2:", "### PR-3:");
  const r = run(text);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-2 has no section under PRs/);
  assert.match(r.stdout, /section PR-3 is not in the stack overview/);
});

test("section changes that differ from the table fail", () => {
  const prs = base();
  prs[0].labels = { "Changes.": "C-2, C-3" };
  const r = run(plan({ prs }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR-1 section changes \(C-2, C-3\) differ from table \(C-2, C-3, C-4\)/);
});

test("a remaining placeholder fails", () => {
  const r = run(plan({ prs: base(), extra: "\n{{why}}\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /placeholder/);
});

test("a missing required heading fails", () => {
  const text = plan({ prs: base() }).replace("## Sequencing rationale", "## Rationale");
  const r = run(text);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /missing heading "Sequencing rationale"/);
});

test("headings out of order fail", () => {
  const text = plan({ prs: base() })
    .replace("## Dependency graph", "## PRs-tmp")
    .replace("## PRs\n", "## Dependency graph\n")
    .replace("## PRs-tmp", "## PRs");
  const r = run(text);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /out of order/);
});

test("a missing implementation plan is reported", () => {
  const dir = tmp();
  const prPath = join(dir, "pr-plan.md");
  writeFileSync(prPath, plan({ prs: base() }));
  const r = spawnSync(process.execPath, [checker, prPath], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /implementation plan not found/);
});

test("problems are printed as file:line: message", () => {
  const prs = base();
  prs[0].loc = 620;
  const r = run(plan({ prs }));
  assert.match(r.stdout, /^.*pr-plan\.md:\d+: PR-1 estimated 620 lines exceeds budget 500$/m);
});

test("usage error exits 2", () => {
  const r = spawnSync(process.execPath, [checker], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/i);
});
