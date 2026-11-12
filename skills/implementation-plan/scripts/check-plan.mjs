#!/usr/bin/env node
// Checks a jstack implementation plan. Exit 0 when clean, exit 1 with one
// `file:line: message` per problem. Usage: node check-plan.mjs <plan.md> [--repo <path>]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseDocument,
  sectionBetween,
  sectionText,
  findPlaceholders,
  tableByHeaders,
  columnIndex,
  idsIn,
  mermaidMessages,
  problem,
} from "../../../scripts/lib/markdown.mjs";

const REQUIRED_HEADINGS = [
  "Summary",
  "Scope",
  "Design",
  "Grounding",
  "Data shapes",
  "Sequence diagrams",
  "Change table",
  "Test plan",
  "Risks and rollbacks",
  "Open questions",
];
const CHANGE_HEADERS = ["ID", "File", "Class", "Method", "Change", "Responsibility", "Diagrams"];
const UNIT_HEADERS = ["Change", "Test file", "Cases", "Asserts"];
const SCENARIO_HEADERS = ["ID", "Flow", "Actor", "Given", "When", "Then", "Diagrams"];
const COMPONENT_HEADERS = ["ID", "Scenarios", "Test file", "Harness", "Stubs", "Asserts"];
const BLACKBOX_HEADERS = ["ID", "Scenarios", "Test file", "Boot", "Stubs", "Asserts"];
const TEST_PLAN_H3 = ["Unit tests", "E2E scenarios", "Component tests", "Blackbox tests"];
const CHANGE_KINDS = ["add", "modify", "delete"];
const SUMMARY_MAX = 12;

function parseArgs(argv) {
  const out = { plan: null, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") out.repo = argv[++i];
    else if (!out.plan) out.plan = a;
  }
  return out;
}

function gitRoot(dir) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" });
  if (r.status === 0) return r.stdout.trim();
  return dir;
}

export function checkPlan(file, text, repo) {
  const doc = parseDocument(text);
  const problems = [];
  const report = (line, msg) => problems.push(problem(file, line, msg));

  // Headings present and in order.
  const h2 = doc.headings.filter((h) => h.level === 2);
  const present = [];
  for (const name of REQUIRED_HEADINGS) {
    const h = h2.find((x) => x.text === name);
    if (h) present.push(h);
    else report(1, `missing heading "${name}"`);
  }
  const actual = h2.filter((h) => REQUIRED_HEADINGS.includes(h.text));
  const expected = [...present].sort((a, b) => REQUIRED_HEADINGS.indexOf(a.text) - REQUIRED_HEADINGS.indexOf(b.text));
  for (let i = 0; i < actual.length; i++) {
    if (actual[i].text !== expected[i].text) {
      report(actual[i].line, `heading "${actual[i].text}" out of order, expected "${expected[i].text}"`);
      break;
    }
  }

  // Placeholders outside fences.
  for (const line of findPlaceholders(doc)) {
    const m = doc.lines[line - 1].match(/\{\{[^}]*\}\}?/);
    report(line, `placeholder ${m ? m[0] : "{{"} left unfilled`);
  }

  // Summary length.
  const summary = sectionBetween(doc, "Summary");
  if (summary) {
    const count = sectionText(doc, "Summary").split("\n").filter((l) => l.trim() !== "").length;
    if (count > SUMMARY_MAX) report(summary.start, `Summary has ${count} lines, max ${SUMMARY_MAX}`);
  }

  // Design source line.
  const design = sectionBetween(doc, "Design");
  if (design) {
    const hasSource = sectionText(doc, "Design").split("\n").some((l) => l.trim().startsWith("Source:"));
    if (!hasSource) report(design.start, 'Design section has no "Source:" line');
  }

  // Sequence diagrams.
  const diagrams = new Map();
  const sdSection = sectionBetween(doc, "Sequence diagrams");
  if (sdSection) {
    const sdHeadings = doc.headings.filter(
      (h) => h.level === 3 && h.line > sdSection.start && h.line < sdSection.end,
    );
    for (const h of sdHeadings) {
      const m = h.text.match(/^(SD-\d+):\s*(.+)$/);
      if (!m) {
        report(h.line, `diagram heading "${h.text}" must be "SD-n: caption"`);
        continue;
      }
      const id = m[1];
      if (diagrams.has(id)) {
        report(h.line, `duplicate diagram id ${id}`);
        continue;
      }
      const fence = doc.fences.find((f) => f.headingText === h.text && f.lang === "mermaid");
      if (!fence) {
        report(h.line, `${id} has no mermaid fence`);
        diagrams.set(id, { line: h.line, messages: [] });
        continue;
      }
      if (!fence.body.trim().startsWith("sequenceDiagram")) {
        report(fence.line, `${id} fence must start with sequenceDiagram`);
      }
      diagrams.set(id, { line: h.line, messages: mermaidMessages(fence.body) });
    }
    if (sdHeadings.length === 0) report(sdSection.start, "Sequence diagrams section has no diagrams");
  }

  // Change table.
  const changes = new Map();
  const referencedDiagrams = new Set();
  const changeTable = tableByHeaders(doc, CHANGE_HEADERS);
  if (!changeTable) {
    report(1, `change table not found, headers must be ${CHANGE_HEADERS.join(" | ")}`);
  } else {
    const col = Object.fromEntries(CHANGE_HEADERS.map((h) => [h, columnIndex(changeTable, h)]));
    for (const row of changeTable.rows) {
      const cell = (name) => (row.cells[col[name]] ?? "").trim();
      const id = cell("ID");
      if (!/^C-\d+$/.test(id)) {
        report(row.line, `change id "${id}" must be C-n`);
        continue;
      }
      if (changes.has(id)) {
        report(row.line, `duplicate change id ${id}`);
        continue;
      }
      changes.set(id, row.line);

      const kind = cell("Change");
      if (!CHANGE_KINDS.includes(kind)) {
        report(row.line, `${id} change "${kind}" must be add, modify, or delete`);
      } else if (kind !== "add") {
        const file = cell("File");
        if (!file || !fs.existsSync(path.resolve(repo, file))) {
          report(row.line, `${id} file "${file}" not found`);
        }
      }

      const listed = idsIn(cell("Diagrams"), "SD");
      if (listed.length === 0) report(row.line, `${id} lists no diagrams`);
      const known = [];
      for (const sd of listed) {
        if (!diagrams.has(sd)) report(row.line, `${id} references unknown diagram ${sd}`);
        else {
          known.push(sd);
          referencedDiagrams.add(sd);
        }
      }

      const method = cell("Method");
      if (method && method !== "-" && known.length > 0) {
        const name = method.split("(")[0].trim();
        const needle = `${name}(`;
        const found = known.some((sd) => diagrams.get(sd).messages.some((m) => m.text.includes(needle)));
        if (!found) report(row.line, `${id} method "${name}" does not appear in ${known.join(", ")}`);
      }
    }
  }
  for (const [sd, info] of diagrams) {
    if (!referencedDiagrams.has(sd)) report(info.line, `${sd} is not referenced by any change row`);
  }

  // Test plan: four tables under four H3 headings, in order.
  const tp = sectionBetween(doc, "Test plan");
  if (tp) {
    const h3 = doc.headings.filter((h) => h.level === 3 && h.line > tp.start && h.line < tp.end);
    const present = [];
    for (const name of TEST_PLAN_H3) {
      const h = h3.find((x) => x.text === name);
      if (h) present.push(h);
      else report(tp.start, `Test plan is missing the "${name}" section`);
    }
    for (let i = 1; i < present.length; i++) {
      if (present[i].line < present[i - 1].line) {
        report(present[i].line, `Test plan section "${present[i].text}" out of order, expected after "${present[i - 1].text}"`);
        break;
      }
    }
  }

  // Unit tests: one row per change row.
  const unitTable = tableByHeaders(doc, UNIT_HEADERS);
  if (!unitTable) {
    report(1, `unit test table not found, headers must be ${UNIT_HEADERS.join(" | ")}`);
  } else {
    const col = Object.fromEntries(UNIT_HEADERS.map((h) => [h, columnIndex(unitTable, h)]));
    const covered = new Set();
    for (const row of unitTable.rows) {
      const cell = (name) => (row.cells[col[name]] ?? "").trim();
      const ids = idsIn(cell("Change"), "C");
      if (ids.length === 0) report(row.line, `unit test row has no change id in "${cell("Change")}"`);
      for (const id of ids) {
        if (!changes.has(id)) report(row.line, `unit test row references unknown change ${id}`);
        else covered.add(id);
      }
      if (!cell("Test file")) report(row.line, "unit test row has no test file");
    }
    for (const [id, line] of changes) {
      if (!covered.has(id)) report(line, `${id} has no unit test row`);
    }
  }

  // E2E scenarios: every diagram exercised, every row on known diagrams.
  const scenarios = new Map();
  const scenarioTable = tableByHeaders(doc, SCENARIO_HEADERS);
  if (!scenarioTable) {
    report(1, `scenario table not found, headers must be ${SCENARIO_HEADERS.join(" | ")}`);
  } else {
    const col = Object.fromEntries(SCENARIO_HEADERS.map((h) => [h, columnIndex(scenarioTable, h)]));
    const exercised = new Set();
    for (const row of scenarioTable.rows) {
      const cell = (name) => (row.cells[col[name]] ?? "").trim();
      const id = cell("ID");
      if (!/^S-\d+$/.test(id)) {
        report(row.line, `scenario id "${id}" must be S-n`);
        continue;
      }
      if (scenarios.has(id)) {
        report(row.line, `duplicate scenario id ${id}`);
        continue;
      }
      scenarios.set(id, row.line);
      for (const name of ["Actor", "Given", "When", "Then"]) {
        if (!cell(name)) report(row.line, `${id} has an empty "${name}" cell`);
      }
      const listed = idsIn(cell("Diagrams"), "SD");
      if (listed.length === 0) report(row.line, `${id} lists no diagrams`);
      for (const sd of listed) {
        if (!diagrams.has(sd)) report(row.line, `${id} references unknown diagram ${sd}`);
        else exercised.add(sd);
      }
    }
    for (const [sd, info] of diagrams) {
      if (!exercised.has(sd)) report(info.line, `${sd} is exercised by no scenario`);
    }
    if (scenarioTable.rows.length === 0) report(scenarioTable.line, "scenario table has no rows");
  }

  // Component and blackbox tests: ids, known scenarios, full coverage.
  const coveredBy = { CT: new Set(), BB: new Set() };
  const tierTable = (headers, prefix, label) => {
    const table = tableByHeaders(doc, headers);
    if (!table) {
      report(1, `${label} test table not found, headers must be ${headers.join(" | ")}`);
      return;
    }
    const col = Object.fromEntries(headers.map((h) => [h, columnIndex(table, h)]));
    const seen = new Set();
    for (const row of table.rows) {
      const cell = (name) => (row.cells[col[name]] ?? "").trim();
      const id = cell("ID");
      if (!new RegExp(`^${prefix}-\\d+$`).test(id)) {
        report(row.line, `${label} test id "${id}" must be ${prefix}-n`);
        continue;
      }
      if (seen.has(id)) {
        report(row.line, `duplicate ${label} test id ${id}`);
        continue;
      }
      seen.add(id);
      const listed = idsIn(cell("Scenarios"), "S");
      if (listed.length === 0) report(row.line, `${id} covers no scenario`);
      for (const sId of listed) {
        if (!scenarios.has(sId)) report(row.line, `${id} references unknown scenario ${sId}`);
        else coveredBy[prefix].add(sId);
      }
      for (const name of headers.slice(2)) {
        if (!cell(name)) report(row.line, `${id} has an empty "${name}" cell`);
      }
    }
  };
  tierTable(COMPONENT_HEADERS, "CT", "component");
  tierTable(BLACKBOX_HEADERS, "BB", "blackbox");
  for (const [id, line] of scenarios) {
    if (!coveredBy.CT.has(id)) report(line, `${id} has no component test`);
    if (!coveredBy.BB.has(id)) report(line, `${id} has no blackbox test`);
  }

  return problems;
}

function main() {
  const { plan, repo } = parseArgs(process.argv.slice(2));
  if (!plan) {
    console.error("usage: node check-plan.mjs <plan.md> [--repo <path>]");
    process.exit(2);
  }
  const file = path.resolve(plan);
  if (!fs.existsSync(file)) {
    console.error(`${file}: not found`);
    process.exit(2);
  }
  const root = repo ? path.resolve(repo) : gitRoot(path.dirname(file));
  const problems = checkPlan(plan, fs.readFileSync(file, "utf8"), root);
  for (const p of problems) console.log(p);
  process.exit(problems.length === 0 ? 0 : 1);
}

main();
