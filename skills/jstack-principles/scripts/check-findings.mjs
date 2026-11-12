#!/usr/bin/env node
// jstack review findings ledger checker. No dependencies.
// Usage: node check-findings.mjs <findings.md> [--stage plan] [--stage pr-plan]
// Exit 0 when clean. Exit 1 with one "file:line: message" per problem.
// Every reviewer finding gets a disposition before the next command runs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument, columnIndex, problem } from "../../../scripts/lib/markdown.mjs";

export const HEADERS = ["ID", "Stage", "Severity", "Location", "Finding", "Disposition"];
export const STAGES = ["plan", "pr-plan"];
const SEVERITIES = ["block", "should", "nit"];
const DISPOSITION = /^(fixed|park|dismissed): \S/;

export function checkFindings(file, opts = {}) {
  const problems = [];
  const bad = (line, msg) => problems.push(problem(file, line, msg));
  if (!fs.existsSync(file)) {
    bad(0, "findings ledger not found; the review of this stage has not been recorded");
    return problems;
  }
  const text = fs.readFileSync(file, "utf8");
  const doc = parseDocument(text);
  const want = HEADERS.map((h) => h.toLowerCase());
  const table = doc.tables.find((t) => want.every((w, i) => (t.headers[i] ?? "").trim().toLowerCase() === w));
  if (!table) {
    bad(0, `ledger needs a table with columns ${HEADERS.join(" | ")}`);
    return problems;
  }
  const col = Object.fromEntries(HEADERS.map((h) => [h, columnIndex(table, h)]));
  const seen = new Map();
  const perStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const row of table.rows) {
    const cell = (h) => (row.cells[col[h]] ?? "").trim();
    const id = cell("ID");
    if (!/^F-\d+$/.test(id)) bad(row.line, `finding id "${id}" must be F-n`);
    else if (seen.has(id)) bad(row.line, `duplicate finding id ${id} (first at line ${seen.get(id)})`);
    else seen.set(id, row.line);
    const stage = cell("Stage");
    if (!STAGES.includes(stage)) bad(row.line, `${id} stage "${stage}" must be one of ${STAGES.join(", ")}`);
    else perStage[stage]++;
    const sev = cell("Severity");
    if (!SEVERITIES.includes(sev)) bad(row.line, `${id} severity "${sev}" must be one of ${SEVERITIES.join(", ")}`);
    if (!cell("Finding")) bad(row.line, `${id} has an empty Finding cell`);
    const disp = cell("Disposition");
    if (!DISPOSITION.test(disp)) {
      bad(row.line, `${id} has no disposition; write "fixed: <what changed>", "park: <owner>", or "dismissed: <reason>"`);
    } else if (sev === "block" && !disp.startsWith("fixed:")) {
      bad(row.line, `${id} is a block finding and must be fixed, not ${disp.split(":")[0]}`);
    }
  }
  const lines = text.split(/\r?\n/);
  for (const stage of opts.stages ?? []) {
    const re = new RegExp(`^${stage}: findings=(\\d+)\\s*$`);
    const idx = lines.findIndex((l) => re.test(l));
    if (idx < 0) {
      bad(0, `no "${stage}: findings=<n>" line; the ${stage} review has not been recorded`);
      continue;
    }
    const n = Number(lines[idx].match(re)[1]);
    if (n !== perStage[stage]) bad(idx + 1, `${stage}: findings=${n} but the table holds ${perStage[stage]} ${stage} row${perStage[stage] === 1 ? "" : "s"}`);
  }
  return problems;
}

function main(argv) {
  let file = null;
  const stages = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--stage") {
      const s = argv[++i];
      if (!STAGES.includes(s)) {
        console.error(`unknown stage: ${s}`);
        return 1;
      }
      stages.push(s);
    } else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log("Usage: node check-findings.mjs <findings.md> [--stage plan] [--stage pr-plan]");
      return 0;
    } else if (!file) file = argv[i];
    else {
      console.error(`unexpected argument: ${argv[i]}`);
      return 1;
    }
  }
  if (!file) {
    console.error("Usage: node check-findings.mjs <findings.md> [--stage plan] [--stage pr-plan]");
    return 1;
  }
  const problems = checkFindings(path.resolve(file), { stages });
  for (const p of problems) console.error(p);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
