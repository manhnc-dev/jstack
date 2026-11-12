#!/usr/bin/env node
// jstack stack verification checker. No dependencies.
// Usage: node check-stack.mjs <stack-bundle-dir> --plan <implementation-plan.md> [--pr-plan <pr-plan.md>] [--repo <path>]
// Exit 0 when clean. Exit 1 with one "file:line: message" per problem.
// The stack bundle proves the feature end to end at the top of the stack:
// one row per plan scenario, each with a component result and a blackbox result.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseDocument, sectionBetween, findPlaceholders, tableByHeaders, columnIndex, idsIn, problem } from "../../../scripts/lib/markdown.mjs";

export const REQUIRED_SECTIONS = ["Stack", "PRs", "Commands", "Test summary", "Scenarios", "Verdict"];
const REQUIRED_ARTIFACTS = ["scenarios.txt", "test-summary-head.txt", "test-summary-base.txt", "new-failures.txt"];
const IGNORE_LINES = ["rerun-*/", "*.log"];
const SHA40 = /^[0-9a-f]{40}$/;
const CITATION = /artifacts\/[\w.\/-]+/g;
const COUNTS = "passed=(\\d+) failed=(\\d+) skipped=(\\d+)\\s*$";
const SCENARIO_HEADERS = ["ID", "Flow", "Actor", "Given", "When", "Then", "Diagrams"];
const COMPONENT_HEADERS = ["ID", "Scenarios", "Test file", "Harness", "Stubs", "Asserts"];
const BLACKBOX_HEADERS = ["ID", "Scenarios", "Test file", "Boot", "Stubs", "Asserts"];

function lines(doc, name) {
  const s = sectionBetween(doc, name);
  if (!s) return [];
  const out = [];
  for (let n = s.start + 1; n < s.end; n++) out.push({ line: n, text: doc.lines[n - 1] });
  return out;
}

function find(ls, re) {
  for (const l of ls) {
    const m = l.text.match(re);
    if (m) return { ...l, m };
  }
  return null;
}

function tableIn(doc, name, headers) {
  const s = sectionBetween(doc, name);
  if (!s) return null;
  const want = headers.map((h) => h.toLowerCase());
  return doc.tables.find((t) => t.line > s.start && t.line < s.end && want.every((w) => t.headers.map((h) => h.trim().toLowerCase()).includes(w))) ?? null;
}

function citations(text) {
  return [...text.matchAll(CITATION)].map((m) => m[0].replace(/[.,;:]+$/, "").replace(/\/$/, "")).filter((c) => c.length > "artifacts/".length);
}

// Plan scenarios and, per scenario, the CT-n and BB-n rows that cover it.
export function readPlanCoverage(planPath) {
  const doc = parseDocument(fs.readFileSync(planPath, "utf8"));
  const sc = tableByHeaders(doc, SCENARIO_HEADERS);
  if (!sc) return null;
  const cover = new Map();
  for (const row of sc.rows) {
    const id = (row.cells[columnIndex(sc, "ID")] || "").trim();
    if (/^S-\d+$/.test(id)) cover.set(id, { component: [], blackbox: [] });
  }
  for (const [headers, prefix, tier] of [[COMPONENT_HEADERS, "CT", "component"], [BLACKBOX_HEADERS, "BB", "blackbox"]]) {
    const t = tableByHeaders(doc, headers);
    if (!t) continue;
    for (const row of t.rows) {
      const id = (row.cells[columnIndex(t, "ID")] || "").trim();
      if (!new RegExp(`^${prefix}-\\d+$`).test(id)) continue;
      for (const s of idsIn(row.cells[columnIndex(t, "Scenarios")] || "", "S")) cover.get(s)?.[tier].push(id);
    }
  }
  return cover;
}

function readPrIds(prPlanPath) {
  const doc = parseDocument(fs.readFileSync(prPlanPath, "utf8"));
  const t = tableByHeaders(doc, ["ID", "Title", "Depends on"]);
  if (!t) return [];
  return t.rows.map((r) => (r.cells[columnIndex(t, "ID")] || "").trim()).filter((x) => /^PR-\d+$/.test(x));
}

// "CT-1 pass, CT-2 fail" -> [{id, result}], or null when the cell is malformed.
function parseCell(cell, prefix) {
  const out = [];
  for (const part of cell.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(new RegExp(`^(${prefix}-\\d+) (pass|fail|not run)$`));
    if (!m) return null;
    out.push({ id: m[1], result: m[2] });
  }
  return out.length ? out : null;
}

export function checkStack(dir, opts = {}) {
  const problems = [];
  const reportPath = path.join(dir, "report.md");
  const artifactsDir = path.join(dir, "artifacts");
  const bad = (line, msg) => problems.push(problem(reportPath, line, msg));
  if (!fs.existsSync(reportPath)) {
    bad(0, "report.md not found");
    return problems;
  }
  const doc = parseDocument(fs.readFileSync(reportPath, "utf8"));
  for (const line of findPlaceholders(doc)) bad(line, `unfilled placeholder ${doc.lines[line - 1].match(/\{\{[^}]*\}?\}?/)[0]}`);

  const h2 = doc.headings.filter((h) => h.level === 2 && REQUIRED_SECTIONS.includes(h.text));
  let last = -1;
  for (const name of REQUIRED_SECTIONS) if (!h2.some((h) => h.text === name)) bad(0, `missing section "${name}"`);
  for (const h of h2) {
    const idx = REQUIRED_SECTIONS.indexOf(h.text);
    if (idx < last) bad(h.line, `section "${h.text}" is out of order`);
    else last = idx;
  }

  // Stack.
  const st = sectionBetween(doc, "Stack");
  if (st) {
    const ls = lines(doc, "Stack");
    if (!find(ls, /^Slug:\s*\S+/)) bad(st.start, 'Stack section needs a "Slug: <slug>" line');
    if (!find(ls, /^Head branch:\s*\S+/)) bad(st.start, 'Stack section needs a "Head branch: <name>" line');
    const repoR = opts.repo ? { status: 0, stdout: path.resolve(opts.repo) } : spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    const repo = repoR.status === 0 ? repoR.stdout.trim() : null;
    for (const label of ["SHA", "Trunk base"]) {
      const l = find(ls, new RegExp(`^${label}:\\s*(\\S*)\\s*$`));
      if (!l || !SHA40.test(l.m[1])) bad(l ? l.line : st.start, `Stack section needs a "${label}: <40 hex>" line`);
      else if (repo && spawnSync("git", ["-C", repo, "cat-file", "-e", `${l.m[1]}^{commit}`]).status !== 0) bad(l.line, `SHA ${l.m[1]} not found in repo`);
    }
  }

  // PRs.
  let prsNotPass = [];
  if (sectionBetween(doc, "PRs")) {
    const t = tableIn(doc, "PRs", ["PR", "Branch", "SHA", "Verdict"]);
    if (!t) bad(sectionBetween(doc, "PRs").start, "PRs section needs a table with columns PR | Branch | SHA | Verdict");
    else {
      const listed = new Map();
      for (const row of t.rows) {
        const id = (row.cells[columnIndex(t, "PR")] || "").trim();
        const verdict = (row.cells[columnIndex(t, "Verdict")] || "").trim();
        listed.set(id, row.line);
        if (!/^(PASS|FAIL|missing)$/.test(verdict)) bad(row.line, `${id} verdict "${verdict}" must be PASS, FAIL, or missing`);
        else if (verdict !== "PASS") prsNotPass.push(id);
      }
      if (opts.prPlan && fs.existsSync(opts.prPlan)) {
        for (const id of readPrIds(opts.prPlan)) if (!listed.has(id)) bad(t.line, `${id} from the PR plan is not listed`);
      }
    }
  }

  // Commands.
  if (sectionBetween(doc, "Commands")) {
    const t = tableIn(doc, "Commands", ["Step", "Command", "Exit", "Artifact"]);
    if (!t) bad(sectionBetween(doc, "Commands").start, "Commands section needs a table with columns Step | Command | Exit | Artifact");
  }

  // Test summary.
  let newFailures = null;
  let blackboxRan = null;
  const ts = sectionBetween(doc, "Test summary");
  if (ts) {
    const ls = lines(doc, "Test summary");
    for (const [label, file] of [["Head", "test-summary-head.txt"], ["Baseline", "test-summary-base.txt"], ["Component", null]]) {
      const l = find(ls, new RegExp(`^${label}: ${COUNTS}`));
      if (!l) {
        bad(ts.start, `Test summary needs a "${label}: passed=<n> failed=<n> skipped=<n>" line`);
        continue;
      }
      // The report's totals are the committed summary's totals, not a retyped number.
      const p = file && path.join(artifactsDir, file);
      if (p && fs.existsSync(p)) {
        const first = fs.readFileSync(p, "utf8").split(/\r?\n/).map((x) => x.match(new RegExp(`^${COUNTS}`))).find(Boolean);
        if (!first) bad(l.line, `artifacts/${file} has no "passed=<n> failed=<n> skipped=<n>" totals line`);
        else if (first.slice(1, 4).join(" ") !== l.m.slice(1, 4).join(" ")) bad(l.line, `${label} line says passed=${l.m[1]} failed=${l.m[2]} skipped=${l.m[3]} but artifacts/${file} says ${first[0].trim()}`);
      }
    }
    const nf = find(ls, /^New failures:\s*(\d+)\s*$/);
    if (!nf) bad(ts.start, 'Test summary needs a "New failures: <n>" line');
    else {
      newFailures = Number(nf.m[1]);
      const p = path.join(artifactsDir, "new-failures.txt");
      if (fs.existsSync(p)) {
        const names = fs.readFileSync(p, "utf8").split(/\r?\n/).filter((x) => x.trim()).length;
        if (names !== newFailures) bad(nf.line, `New failures: ${newFailures} but artifacts/new-failures.txt names ${names}`);
      }
    }
    if (find(ls, new RegExp(`^Blackbox: ${COUNTS}`))) blackboxRan = true;
    else if (find(ls, /^Blackbox: not run \(.+\)\s*$/)) blackboxRan = false;
    else bad(ts.start, 'Test summary needs a "Blackbox: passed=<n> failed=<n> skipped=<n>" or "Blackbox: not run (<reason>)" line');
  }

  // Scenarios.
  let fails = 0;
  let notRun = 0;
  const sc = sectionBetween(doc, "Scenarios");
  if (sc) {
    const t = tableIn(doc, "Scenarios", ["Scenario", "Component", "Blackbox", "Evidence"]);
    const cover = opts.plan && fs.existsSync(opts.plan) ? readPlanCoverage(opts.plan) : null;
    if (opts.plan && !cover) bad(sc.start, `plan ${opts.plan} has no E2E scenarios table`);
    const recorded = new Set();
    const scenariosFile = path.join(artifactsDir, "scenarios.txt");
    if (fs.existsSync(scenariosFile)) {
      for (const l of fs.readFileSync(scenariosFile, "utf8").split(/\r?\n/)) {
        // The fifth field is the test's own title, which starts with its scenario id.
        const m = l.match(/^(S-\d+) (component|blackbox) ((?:CT|BB)-\d+) (pass|fail|not run) (S-\d+)\b/);
        if (m && m[5] === m[1]) recorded.add(`${m[1]} ${m[2]} ${m[3]} ${m[4]}`);
      }
    }
    if (!t) bad(sc.start, "Scenarios section needs a table with columns Scenario | Component | Blackbox | Evidence");
    else {
      const seen = new Map();
      for (const row of t.rows) {
        const id = (row.cells[columnIndex(t, "Scenario")] || "").trim().split(/\s/)[0];
        if (!/^S-\d+$/.test(id)) {
          bad(row.line, `scenario id "${id}" must be S-n`);
          continue;
        }
        if (seen.has(id)) bad(row.line, `duplicate scenario row ${id}`);
        seen.set(id, row.line);
        if (cover && !cover.has(id)) bad(row.line, `${id} is not a scenario in the plan`);
        for (const [tier, prefix, colName] of [["component", "CT", "Component"], ["blackbox", "BB", "Blackbox"]]) {
          const cell = (row.cells[columnIndex(t, colName)] || "").trim();
          const entries = parseCell(cell, prefix);
          if (!entries) {
            bad(row.line, `${id} ${colName} cell "${cell}" must list "${prefix}-n pass|fail|not run", comma separated`);
            continue;
          }
          const want = cover?.get(id)?.[tier];
          if (want) {
            const have = entries.map((e) => e.id);
            for (const w of want) if (!have.includes(w)) bad(row.line, `${id} is covered by ${w} in the plan but the row has no ${w} result`);
            for (const h of have) if (!want.includes(h)) bad(row.line, `${id} lists ${h}, which does not cover it in the plan`);
          }
          for (const e of entries) {
            if (e.result === "fail") fails++;
            if (e.result === "not run") {
              notRun++;
              if (tier === "component") bad(row.line, `${id} ${e.id} is "not run"; component tests run in process and are never skipped`);
              else if (blackboxRan === true) bad(row.line, `${id} ${e.id} is "not run" but the Blackbox line reports counts`);
            } else if (tier === "blackbox" && blackboxRan === false) {
              bad(row.line, `${id} ${e.id} is "${e.result}" but the Blackbox line says not run`);
            }
            if (fs.existsSync(scenariosFile) && !recorded.has(`${id} ${tier} ${e.id} ${e.result}`)) {
              bad(row.line, `${id} ${e.id} ${e.result} has no matching "${id} ${tier} ${e.id} ${e.result} ${id}: <test title>" line in artifacts/scenarios.txt`);
            }
          }
        }
        if (citations(row.cells[columnIndex(t, "Evidence")] || "").length === 0) bad(row.line, `${id} Evidence cell cites no artifacts/ file`);
      }
      if (cover) for (const id of cover.keys()) if (!seen.has(id)) bad(t.line, `${id} from the plan has no row`);
    }
  }

  // Verdict.
  const vd = sectionBetween(doc, "Verdict");
  if (vd) {
    const ls = lines(doc, "Verdict");
    const v = find(ls, /^Verdict:\s*(PASS|PARTIAL|FAIL)\s*$/);
    if (!v) bad(vd.start, 'Verdict section needs "Verdict: PASS", "Verdict: PARTIAL", or "Verdict: FAIL"');
    else if (v.m[1] === "FAIL") {
      if (!find(ls, /^Blocking:\s*\S/)) bad(v.line, "FAIL verdict needs a Blocking: line");
    } else {
      const name = v.m[1];
      if (newFailures) bad(v.line, `verdict ${name} with ${newFailures} new failures`);
      if (fails) bad(v.line, `verdict ${name} with ${fails} failing scenario result${fails === 1 ? "" : "s"}`);
      for (const id of prsNotPass) bad(v.line, `verdict ${name} while ${id} is not PASS`);
      if (name === "PASS" && (notRun || blackboxRan === false)) bad(v.line, "verdict PASS while blackbox results are not run; the verdict is PARTIAL");
      if (name === "PARTIAL") {
        if (!notRun && blackboxRan !== false) bad(v.line, "verdict PARTIAL but every scenario ran in both tiers; the verdict is PASS");
        if (!find(ls, /^Not run:\s*\S/)) bad(v.line, "PARTIAL verdict needs a Not run: line naming what was not executed and why");
      }
    }
  }

  // Artifacts.
  const cited = new Map();
  doc.lines.forEach((l, i) => citations(l).forEach((c) => cited.has(c) || cited.set(c, i + 1)));
  if (!fs.existsSync(artifactsDir)) bad(0, "artifacts/ directory not found");
  const ignorePath = path.join(artifactsDir, ".gitignore");
  const ignored = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, "utf8").split(/\r?\n/).map((x) => x.trim()) : [];
  for (const want of IGNORE_LINES) if (!ignored.includes(want)) bad(0, `artifacts/.gitignore must contain the line "${want}"`);
  for (const name of REQUIRED_ARTIFACTS) {
    if (!fs.existsSync(path.join(artifactsDir, name))) bad(0, `required artifact "artifacts/${name}" not found`);
    else if (!cited.has(`artifacts/${name}`)) bad(0, `required artifact "artifacts/${name}" is not cited in report.md`);
  }
  for (const [c, line] of cited) {
    if (fs.existsSync(path.join(dir, c))) continue;
    if (ignored.includes("*.log") && c.endsWith(".log")) continue;
    bad(line, `cited artifact "${c}" not found`);
  }
  const tracked = spawnSync("git", ["-C", dir, "ls-files", "--", "artifacts"], { encoding: "utf8" });
  if (tracked.status === 0) {
    for (const f of tracked.stdout.split("\n").filter(Boolean)) {
      if (f.endsWith(".log") || /(^|\/)rerun-/.test(f)) bad(0, `"${f}" is committed; raw logs and rerun output stay local (git rm --cached it)`);
    }
  }
  return problems;
}

function main(argv) {
  const opts = {};
  let dir = null;
  const usage = "Usage: node check-stack.mjs <stack-bundle-dir> --plan <implementation-plan.md> [--pr-plan <pr-plan.md>] [--repo <path>]";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plan") opts.plan = path.resolve(argv[++i]);
    else if (argv[i] === "--pr-plan") opts.prPlan = path.resolve(argv[++i]);
    else if (argv[i] === "--repo") opts.repo = argv[++i];
    else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log(usage);
      return 0;
    } else if (!dir) dir = argv[i];
    else {
      console.error(`unexpected argument: ${argv[i]}`);
      return 1;
    }
  }
  if (!dir || !opts.plan) {
    console.error(usage);
    return 1;
  }
  if (!fs.existsSync(opts.plan)) {
    console.error(`plan not found: ${opts.plan}`);
    return 1;
  }
  const problems = checkStack(path.resolve(dir), opts);
  for (const p of problems) console.error(p);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
