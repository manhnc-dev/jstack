#!/usr/bin/env node
// Checks a jstack PR plan. Usage:
//   node check-pr-plan.mjs <pr-plan.md> [--plan <implementation-plan.md>] [--budget 500]
// Exit 0 when clean, 1 with one "file:line: message" per problem, 2 on usage error.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseDocument,
  sectionBetween,
  sectionText,
  findPlaceholders,
  tableByHeaders,
  columnIndex,
  idsIn,
  problem,
} from "../../../scripts/lib/markdown.mjs";

const REQUIRED_H2 = ["Stack overview", "Dependency graph", "PRs", "Sequencing rationale"];
const TABLE_HEADERS = ["ID", "Title", "Depends on", "Changes", "Est. LOC", "Kind"];
const PLAN_TABLE_HEADERS = ["ID", "File", "Class", "Method", "Change", "Responsibility", "Diagrams"];
const PLAN_COMPONENT_HEADERS = ["ID", "Scenarios", "Test file", "Harness", "Stubs", "Asserts"];
const PLAN_BLACKBOX_HEADERS = ["ID", "Scenarios", "Test file", "Boot", "Stubs", "Asserts"];
const LABELS = ["Goal.", "Changes.", "Files.", "Tests.", "Verify.", "Review focus.", "Observable.", "Rollback."];
const KINDS = ["scaffold", "logic", "wiring", "cleanup"];
const CONVENTIONAL = /^(feat|fix|refactor|test|chore|docs|perf|build|ci)(\([a-z0-9._-]+\))?!?: \S.*[^.]$/;
const PR_ID = /^PR-\d+$/;
const LABEL_LINE = /^\*\*([^*]+?)\*\*\s*(.*)$/;
const GRAPH_SKIP = /^(subgraph\b|end$|classDef\b|class\b|style\b|linkStyle\b|click\b|direction\b)/;
const EDGE_SPLIT = /\s*-->(?:\|[^|]*\|)?\s*/;
const NODE_ID = /^\s*([A-Za-z0-9_-]+)/;

function joinAnd(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function splitList(cell) {
  const s = cell.trim();
  if (s === "" || s === "-") return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function readPlanIds(doc, headers, prefix) {
  const table = tableByHeaders(doc, headers);
  if (!table) return null;
  const idCol = columnIndex(table, "ID");
  const ids = [];
  const re = new RegExp(`^${prefix}-\\d+$`);
  for (const row of table.rows) {
    const id = (row.cells[idCol] || "").trim();
    if (re.test(id)) ids.push(id);
  }
  return ids;
}

function readPlanChangeIds(planPath) {
  const doc = parseDocument(readFileSync(planPath, "utf8"));
  return readPlanIds(doc, PLAN_TABLE_HEADERS, "C");
}

// Component (CT-n) and blackbox (BB-n) test ids from the plan's Test plan tables.
// Returns null when the plan predates the tiered test plan and has neither table.
function readPlanTestIds(planPath) {
  const doc = parseDocument(readFileSync(planPath, "utf8"));
  const ct = readPlanIds(doc, PLAN_COMPONENT_HEADERS, "CT");
  const bb = readPlanIds(doc, PLAN_BLACKBOX_HEADERS, "BB");
  if (ct === null && bb === null) return null;
  return [...(ct || []), ...(bb || [])];
}

function checkHeadings(doc, out, file) {
  const h2 = doc.headings.filter((h) => h.level === 2);
  const present = [];
  for (const name of REQUIRED_H2) {
    const h = h2.find((x) => x.text === name);
    if (!h) out.push(problem(file, 1, `missing heading "${name}"`));
    else present.push(h);
  }
  for (let i = 1; i < present.length; i++) {
    if (present[i].line < present[i - 1].line) {
      out.push(problem(file, present[i].line, `heading "${present[i].text}" out of order, expected after "${present[i - 1].text}"`));
    }
  }
}

function parseTable(doc, out, file, budget) {
  const table = tableByHeaders(doc, TABLE_HEADERS);
  const overview = doc.headings.find((h) => h.level === 2 && h.text === "Stack overview");
  if (!table) {
    out.push(problem(file, overview ? overview.line : 1, `missing stack overview table with headers ${TABLE_HEADERS.join(" | ")}`));
    return [];
  }
  const col = Object.fromEntries(TABLE_HEADERS.map((h) => [h, columnIndex(table, h)]));
  const prs = [];
  const seen = new Set();
  for (const row of table.rows) {
    const cell = (name) => (row.cells[col[name]] || "").trim();
    const id = cell("ID");
    if (!PR_ID.test(id)) {
      out.push(problem(file, row.line, `row id "${id}" must be PR-n`));
      continue;
    }
    if (seen.has(id)) {
      out.push(problem(file, row.line, `duplicate PR id ${id}`));
      continue;
    }
    seen.add(id);
    const pr = { id, line: row.line, title: cell("Title"), deps: [], changes: [], loc: null, kind: cell("Kind") };
    if (!CONVENTIONAL.test(pr.title)) out.push(problem(file, row.line, `${id} title "${pr.title}" is not Conventional Commits`));
    for (const d of splitList(cell("Depends on"))) {
      if (!PR_ID.test(d)) out.push(problem(file, row.line, `${id} depends on "${d}" which is not PR-n`));
      else pr.deps.push(d);
    }
    const changesCell = cell("Changes");
    pr.changes = idsIn(changesCell, "C");
    if (pr.changes.length === 0) out.push(problem(file, row.line, `${id} has no changes`));
    const locCell = cell("Est. LOC");
    if (!/^\d+$/.test(locCell)) out.push(problem(file, row.line, `${id} estimated LOC "${locCell}" is not a number`));
    else {
      pr.loc = Number(locCell);
      if (pr.loc > budget) out.push(problem(file, row.line, `${id} estimated ${pr.loc} lines exceeds budget ${budget}`));
    }
    if (!KINDS.includes(pr.kind.toLowerCase())) out.push(problem(file, row.line, `${id} kind "${pr.kind}" must be scaffold, logic, wiring, or cleanup`));
    prs.push(pr);
  }
  const ids = new Set(prs.map((p) => p.id));
  for (const pr of prs) {
    for (const d of pr.deps) {
      if (d === pr.id) out.push(problem(file, pr.line, `${pr.id} depends on itself`));
      else if (!ids.has(d)) out.push(problem(file, pr.line, `${pr.id} depends on unknown ${d}`));
    }
  }
  return prs;
}

function checkAssignments(prs, planIds, out, file, tableLine) {
  const where = new Map();
  for (const pr of prs) {
    for (const c of pr.changes) {
      if (!where.has(c)) where.set(c, []);
      where.get(c).push(pr.id);
    }
  }
  const known = new Set(planIds);
  for (const pr of prs) {
    for (const c of pr.changes) {
      if (!known.has(c)) out.push(problem(file, pr.line, `${pr.id} lists ${c} which is not in the plan`));
    }
  }
  for (const c of planIds) {
    const owners = where.get(c) || [];
    if (owners.length === 0) out.push(problem(file, tableLine, `${c} from the plan is not assigned to any PR`));
    else if (owners.length > 1) out.push(problem(file, tableLine, `${c} assigned to ${joinAnd(owners)}`));
  }
}

// Every CT-n and BB-n in the plan lands in exactly one PR's Tests label, and no
// PR lists a test id the plan does not have.
function checkTestAssignments(prs, planTestIds, out, file, tableLine) {
  const where = new Map();
  const known = new Set(planTestIds);
  for (const pr of prs) {
    for (const t of pr.tests || []) {
      if (!known.has(t)) out.push(problem(file, pr.testsLine, `${pr.id} lists ${t} which is not in the plan`));
      if (!where.has(t)) where.set(t, []);
      where.get(t).push(pr.id);
    }
  }
  for (const t of planTestIds) {
    const owners = where.get(t) || [];
    if (owners.length === 0) out.push(problem(file, tableLine, `${t} from the plan is not assigned to any PR's Tests`));
    else if (owners.length > 1) out.push(problem(file, tableLine, `${t} assigned to ${joinAnd(owners)}`));
  }
}

function checkCycles(prs, out, file) {
  const byId = new Map(prs.map((p) => [p.id, p]));
  const done = new Set();
  const visit = (id, path) => {
    const idx = path.indexOf(id);
    if (idx >= 0) {
      const cycle = path.slice(idx).concat(id);
      out.push(problem(file, byId.get(cycle[0]).line, `dependency cycle: ${cycle.join(" -> ")}`));
      for (const n of cycle) done.add(n);
      return;
    }
    if (done.has(id)) return;
    const pr = byId.get(id);
    if (!pr) return;
    for (const d of pr.deps) visit(d, path.concat(id));
    done.add(id);
  };
  for (const pr of prs) visit(pr.id, []);
}

function checkGraph(doc, prs, out, file) {
  const range = sectionBetween(doc, "Dependency graph");
  if (!range) return;
  const fence = doc.fences.find((f) => f.line > range.start && f.line < range.end && f.lang === "mermaid");
  if (!fence) {
    out.push(problem(file, range.start, "Dependency graph has no mermaid fence"));
    return;
  }
  const lines = fence.body.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0 || !/^graph\s+TD\b/.test(lines[first].trim())) {
    out.push(problem(file, fence.line + 1, 'dependency graph must start with "graph TD"'));
    return;
  }
  const ids = new Set(prs.map((p) => p.id));
  const edges = new Map();
  const nodes = new Map();
  for (let i = first + 1; i < lines.length; i++) {
    const lineNo = fence.line + 1 + i;
    const raw = lines[i].replace(/%%.*$/, "").trim().replace(/;$/, "");
    if (raw === "" || GRAPH_SKIP.test(raw)) continue;
    const parts = raw.split(EDGE_SPLIT);
    const chain = [];
    for (const part of parts) {
      const m = part.match(NODE_ID);
      if (!m) {
        out.push(problem(file, lineNo, `cannot parse graph line "${lines[i].trim()}"`));
        chain.length = 0;
        break;
      }
      chain.push(m[1]);
    }
    for (const n of chain) {
      if (!nodes.has(n)) nodes.set(n, lineNo);
    }
    for (let k = 1; k < chain.length; k++) {
      const key = `${chain[k - 1]} --> ${chain[k]}`;
      if (!edges.has(key)) edges.set(key, lineNo);
    }
  }
  for (const [n, lineNo] of nodes) {
    if (!PR_ID.test(n)) out.push(problem(file, lineNo, `graph node "${n}" is not PR-n`));
    else if (!ids.has(n)) out.push(problem(file, lineNo, `graph references unknown ${n}`));
  }
  const tableEdges = new Map();
  for (const pr of prs) for (const d of pr.deps) tableEdges.set(`${d} --> ${pr.id}`, pr);
  for (const [key, lineNo] of edges) {
    if (!tableEdges.has(key)) out.push(problem(file, lineNo, `graph edge ${key} not in table`));
  }
  for (const [key, pr] of tableEdges) {
    if (!edges.has(key)) {
      const dep = key.split(" --> ")[0];
      out.push(problem(file, fence.line, `table dependency ${pr.id} -> ${dep} missing from graph`));
    }
  }
}

function checkSections(doc, prs, out, file) {
  const range = sectionBetween(doc, "PRs");
  if (!range) return;
  const byId = new Map(prs.map((p) => [p.id, p]));
  const heads = doc.headings
    .map((h, i) => ({ ...h, index: i }))
    .filter((h) => h.level === 3 && h.line > range.start && h.line < range.end);
  const seen = new Map();
  for (const h of heads) {
    const m = h.text.match(/^(PR-\d+):\s*(.+)$/);
    if (!m) {
      out.push(problem(file, h.line, `heading "${h.text}" under PRs must be "PR-n: <title>"`));
      continue;
    }
    const [, id, title] = m;
    if (seen.has(id)) {
      out.push(problem(file, h.line, `duplicate section ${id}`));
      continue;
    }
    seen.set(id, h);
    const pr = byId.get(id);
    if (!pr) {
      out.push(problem(file, h.line, `section ${id} is not in the stack overview`));
      continue;
    }
    if (title.trim() !== pr.title) out.push(problem(file, h.line, `${id} section title "${title.trim()}" differs from table title "${pr.title}"`));
    let end = range.end;
    for (let k = h.index + 1; k < doc.headings.length; k++) {
      if (doc.headings[k].level <= 3) {
        end = Math.min(end, doc.headings[k].line);
        break;
      }
    }
    checkLabels(doc, pr, h.line, end, out, file);
  }
  for (const pr of prs) {
    if (!seen.has(pr.id)) out.push(problem(file, pr.line, `${pr.id} has no section under PRs`));
  }
}

function checkLabels(doc, pr, start, end, out, file) {
  const blocks = new Map();
  let current = null;
  for (let n = start + 1; n < end; n++) {
    const line = doc.lines[n - 1];
    const m = doc.fenceLines.has(n) ? null : line.match(LABEL_LINE);
    if (m && LABELS.includes(m[1].trim())) {
      const label = m[1].trim();
      if (blocks.has(label)) {
        out.push(problem(file, n, `${pr.id} has "${label}" twice`));
        current = null;
        continue;
      }
      current = { label, line: n, content: [m[2]] };
      blocks.set(label, current);
      continue;
    }
    if (current) current.content.push(line);
  }
  for (const label of LABELS) {
    if (!blocks.has(label)) out.push(problem(file, start, `${pr.id} missing "${label}"`));
  }
  const text = (label) => {
    const b = blocks.get(label);
    if (!b) return null;
    return b.content
      .map((l) => l.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  };
  const tests = text("Tests.");
  if (tests !== null && (tests === "" || /^(none|n\/a|-)$/i.test(tests))) {
    out.push(problem(file, blocks.get("Tests.").line, `${pr.id} has no tests`));
  }
  pr.tests = tests === null ? [] : [...idsIn(tests, "CT"), ...idsIn(tests, "BB")];
  pr.testsLine = blocks.has("Tests.") ? blocks.get("Tests.").line : pr.line;
  for (const label of LABELS) {
    if (label === "Tests." || label === "Changes.") continue;
    const t = text(label);
    if (t !== null && t === "") out.push(problem(file, blocks.get(label).line, `${pr.id} "${label}" is empty`));
  }
  const changes = text("Changes.");
  if (changes !== null) {
    const listed = idsIn(changes, "C");
    const a = [...listed].sort().join(", ");
    const b = [...pr.changes].sort().join(", ");
    if (a !== b) out.push(problem(file, blocks.get("Changes.").line, `${pr.id} section changes (${listed.join(", ")}) differ from table (${pr.changes.join(", ")})`));
  }
}

export function checkPrPlan(prPlanPath, { planPath, budget = 500, displayPath } = {}) {
  const file = displayPath || prPlanPath;
  const out = [];
  const doc = parseDocument(readFileSync(prPlanPath, "utf8"));
  for (const n of findPlaceholders(doc)) {
    const snippet = doc.lines[n - 1].match(/\{\{[^}]*\}\}?/)?.[0] || "{{";
    out.push(problem(file, n, `template placeholder ${snippet} remains`));
  }
  checkHeadings(doc, out, file);
  const prs = parseTable(doc, out, file, budget);
  const table = tableByHeaders(doc, TABLE_HEADERS);
  const tableLine = table ? table.line : 1;
  const plan = planPath || join(dirname(prPlanPath), "implementation-plan.md");
  if (!existsSync(plan)) {
    out.push(problem(file, 1, `implementation plan not found at ${plan}`));
  } else {
    const ids = readPlanChangeIds(plan);
    if (ids === null) out.push(problem(file, 1, `implementation plan ${plan} has no change table`));
    else checkAssignments(prs, ids, out, file, tableLine);
  }
  checkCycles(prs, out, file);
  checkGraph(doc, prs, out, file);
  checkSections(doc, prs, out, file);
  if (existsSync(plan)) {
    const testIds = readPlanTestIds(plan);
    if (testIds !== null) checkTestAssignments(prs, testIds, out, file, tableLine);
  }
  const rationale = sectionText(doc, "Sequencing rationale");
  const rationaleHead = doc.headings.find((h) => h.level === 2 && h.text === "Sequencing rationale");
  if (rationaleHead && rationale.replace(/<!--[\s\S]*?-->/g, "").trim() === "") {
    out.push(problem(file, rationaleHead.line, "Sequencing rationale is empty"));
  }
  return out;
}

function usage(msg) {
  if (msg) process.stderr.write(`${msg}\n`);
  process.stderr.write("usage: node check-pr-plan.mjs <pr-plan.md> [--plan <implementation-plan.md>] [--budget 500]\n");
  process.exit(2);
}

function main(argv) {
  let prPlan = null;
  let planPath = null;
  let budget = 500;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan") {
      if (i + 1 >= argv.length) usage("--plan needs a path");
      planPath = argv[++i];
    } else if (a.startsWith("--plan=")) {
      planPath = a.slice("--plan=".length);
    } else if (a === "--budget") {
      if (i + 1 >= argv.length) usage("--budget needs a number");
      budget = argv[++i];
    } else if (a.startsWith("--budget=")) {
      budget = a.slice("--budget=".length);
    } else if (a.startsWith("-")) {
      usage(`unknown option ${a}`);
    } else if (prPlan === null) {
      prPlan = a;
    } else {
      usage(`unexpected argument ${a}`);
    }
  }
  if (prPlan === null) usage();
  if (!/^\d+$/.test(String(budget))) usage(`budget must be a whole number, got "${budget}"`);
  if (!existsSync(prPlan)) usage(`file not found: ${prPlan}`);
  const problems = checkPrPlan(prPlan, { planPath, budget: Number(budget) });
  for (const p of problems) process.stdout.write(`${p}\n`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
