#!/usr/bin/env node
// jstack verification bundle checker. No dependencies.
// Usage: node check-verification.mjs <bundle-dir> [--repo <path>] [--lane L]
// Exit 0 when clean. Exit 1 with one "file:line: message" per problem.
// Warnings (artifacts over 200 KB) go to stdout and do not fail the check.
// --lane L is the gates lane's own run: the Audits section is skipped, so it can exit 0
// before the coordinator folds the audit lanes in. The coordinator runs without it.
// Raw *.log artifacts are local evidence: cited, gitignored, never committed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  parseDocument,
  sectionBetween,
  findPlaceholders,
  columnIndex,
  problem,
} from "../../../scripts/lib/markdown.mjs";

export const REQUIRED_SECTIONS = [
  "PR",
  "Commands",
  "Test summary",
  "Baseline",
  "Size",
  "Plan conformance",
  "Live evidence",
  "Audits",
  "Rerun",
  "Verdict",
];

const SIZE_WARN_KB = 200;
const SHA40 = /^[0-9a-f]{40}$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const CITATION = /artifacts\/[\w.\/-]+/g;
// Committed with the bundle. Raw logs stay on the machine that ran them.
const REQUIRED_ARTIFACTS = ["size.txt", "test-summary-head.txt", "test-summary-base.txt", "new-failures.txt"];
const IGNORE_LINES = ["rerun-*/", "*.log"];
const FINDING = /^- \[(A1|A2)\] \[(block|should|nit)\] (.+); (fix|park: \S.*|dismissed: \S.*)$/;

function sectionLines(doc, name) {
  const s = sectionBetween(doc, name);
  if (!s) return [];
  const out = [];
  for (let n = s.start + 1; n < s.end; n++) out.push({ line: n, text: doc.lines[n - 1] });
  return out;
}

function findLine(lines, re) {
  for (const l of lines) {
    const m = l.text.match(re);
    if (m) return { ...l, m };
  }
  return null;
}

function tableIn(doc, name, headers) {
  const s = sectionBetween(doc, name);
  if (!s) return null;
  const want = headers.map((h) => h.toLowerCase());
  for (const t of doc.tables) {
    if (t.line <= s.start || t.line >= s.end) continue;
    const have = t.headers.map((h) => h.trim().toLowerCase());
    if (want.every((w) => have.includes(w))) return t;
  }
  return null;
}

function citationsIn(text) {
  const out = [];
  let m;
  while ((m = CITATION.exec(text))) {
    const token = m[0].replace(/[.,;:]+$/, "").replace(/\/$/, "");
    if (token.length > "artifacts/".length) out.push(token);
  }
  return out;
}

function walkArtifacts(dir, rel = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (/^rerun-/.test(entry.name)) continue;
      out.push(...walkArtifacts(path.join(dir, entry.name), relPath));
    } else if (entry.name !== ".gitignore") {
      out.push(relPath);
    }
  }
  return out;
}

function resolveRepo(bundleDir, repoOpt) {
  if (repoOpt) return path.resolve(repoOpt);
  const r = spawnSync("git", ["-C", bundleDir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status === 0) return r.stdout.trim();
  return null;
}

function commitExists(repo, sha) {
  const r = spawnSync("git", ["-C", repo, "cat-file", "-e", `${sha}^{commit}`], { encoding: "utf8" });
  return r.status === 0;
}

export function checkBundle(bundleDir, opts = {}) {
  const problems = [];
  const warnings = [];
  const reportPath = path.join(bundleDir, "report.md");
  const rerunPath = path.join(bundleDir, "rerun.sh");
  const artifactsDir = path.join(bundleDir, "artifacts");
  const bad = (line, msg) => problems.push(problem(reportPath, line, msg));

  if (!fs.existsSync(reportPath)) {
    bad(0, "report.md not found");
    return { problems, warnings };
  }
  const text = fs.readFileSync(reportPath, "utf8");
  const doc = parseDocument(text);

  const audits = opts.gatesOnly ? sectionBetween(doc, "Audits") : null;
  for (const line of findPlaceholders(doc)) {
    // With --lane L the Audits section is still the coordinator's to fill.
    if (audits && line > audits.start && line < audits.end) continue;
    const token = doc.lines[line - 1].match(/\{\{[^}]*\}?\}?/)[0];
    bad(line, `unfilled placeholder ${token}`);
  }

  // Sections: presence and order.
  const h2 = doc.headings.filter((h) => h.level === 2);
  const found = h2.filter((h) => REQUIRED_SECTIONS.includes(h.text));
  for (const name of REQUIRED_SECTIONS) {
    if (!found.some((h) => h.text === name)) bad(0, `missing section "${name}"`);
  }
  let lastIdx = -1;
  for (const h of found) {
    const idx = REQUIRED_SECTIONS.indexOf(h.text);
    if (idx < lastIdx) {
      bad(h.line, `section "${h.text}" is out of order (expected before "${REQUIRED_SECTIONS[lastIdx]}")`);
    } else {
      lastIdx = idx;
    }
  }

  // PR section.
  const pr = sectionLines(doc, "PR");
  if (sectionBetween(doc, "PR")) {
    const prLine = sectionBetween(doc, "PR").start;
    if (!findLine(pr, /^PR:\s*PR-\d+\s*$/)) bad(prLine, 'PR section needs a "PR: PR-n" line');
    if (!findLine(pr, /^Branch:\s*\S+/)) bad(prLine, 'PR section needs a "Branch: <name>" line');
    const shas = [];
    for (const [label, key] of [["SHA", "SHA: <40 hex>"], ["Base", "Base: <40 hex>"]]) {
      const l = findLine(pr, new RegExp(`^${label}:\\s*(\\S*)\\s*$`));
      if (!l || !SHA40.test(l.m[1])) {
        bad(l ? l.line : prLine, `PR section needs a "${key}" line`);
      } else {
        shas.push({ sha: l.m[1], line: l.line });
      }
    }
    const repo = resolveRepo(bundleDir, opts.repo);
    if (repo) {
      for (const { sha, line } of shas) {
        if (!commitExists(repo, sha)) bad(line, `SHA ${sha} not found in repo`);
      }
    }
  }

  // Commands table.
  if (sectionBetween(doc, "Commands")) {
    const t = tableIn(doc, "Commands", ["Step", "Command", "Exit", "Artifact"]);
    if (!t) {
      bad(sectionBetween(doc, "Commands").start, "Commands section needs a table with columns Step | Command | Exit | Artifact");
    } else {
      const iStep = columnIndex(t, "Step");
      const iExit = columnIndex(t, "Exit");
      const iArt = columnIndex(t, "Artifact");
      for (const row of t.rows) {
        const step = row.cells[iStep] ?? "";
        const exit = row.cells[iExit] ?? "";
        const art = row.cells[iArt] ?? "";
        // "-" marks a step that did not run (no install, blackbox unavailable); it carries no artifact.
        if (exit === "-") {
          if (art !== "-") bad(row.line, `Commands row "${step}" did not run (exit "-") so its artifact must be "-"`);
        } else if (!/^\d+$/.test(exit)) bad(row.line, `Commands row "${step}" exit "${exit}" must be a number, or "-" for a step that did not run`);
        if (art !== "-" && !/^artifacts\/\S+$/.test(art)) {
          bad(row.line, `Commands row "${step}" artifact "${art}" must be artifacts/<file> or -`);
        }
      }
    }
  }

  // Test summary.
  let newFailures = null;
  if (sectionBetween(doc, "Test summary")) {
    const ts = sectionLines(doc, "Test summary");
    const start = sectionBetween(doc, "Test summary").start;
    const counts = /passed=(\d+) failed=(\d+) skipped=(\d+)\s*$/;
    if (!findLine(ts, new RegExp(`^Head: ${counts.source}`))) {
      bad(start, 'Test summary needs a "Head: passed=<n> failed=<n> skipped=<n>" line');
    }
    if (!findLine(ts, new RegExp(`^Baseline: ${counts.source}`))) {
      bad(start, 'Test summary needs a "Baseline: passed=<n> failed=<n> skipped=<n>" line');
    }
    const nf = findLine(ts, /^New failures:\s*(\d+)\s*$/);
    if (!nf) bad(start, 'Test summary needs a "New failures: <n>" line');
    else {
      newFailures = Number(nf.m[1]);
      const nfPath = path.join(artifactsDir, "new-failures.txt");
      if (fs.existsSync(nfPath)) {
        const names = fs.readFileSync(nfPath, "utf8").split(/\r?\n/).filter((x) => x.trim()).length;
        if (names !== newFailures) bad(nf.line, `New failures: ${newFailures} but artifacts/new-failures.txt names ${names}`);
      }
    }
    if (!findLine(ts, new RegExp(`^Component: ${counts.source}`))) {
      bad(start, 'Test summary needs a "Component: passed=<n> failed=<n> skipped=<n>" line');
    }
    const bb = findLine(ts, new RegExp(`^Blackbox: (?:${counts.source}|not run \\(.+\\)\\s*$)`));
    if (!bb) bad(start, 'Test summary needs a "Blackbox: passed=<n> failed=<n> skipped=<n>" or "Blackbox: not run (<reason>)" line');
  }

  // Size.
  if (sectionBetween(doc, "Size")) {
    const sz = sectionLines(doc, "Size");
    const start = sectionBetween(doc, "Size").start;
    const l = findLine(sz, /^Changed lines:\s*(\d+) of (\d+) \((OK|OVER)\)\s*$/);
    if (!l) {
      bad(start, 'Size needs a "Changed lines: <n> of <budget> (OK|OVER)" line');
    } else {
      const n = Number(l.m[1]);
      const budget = Number(l.m[2]);
      const expect = n > budget ? "OVER" : "OK";
      if (l.m[3] !== expect) bad(l.line, `Changed lines ${n} of ${budget} should be marked ${expect}`);
    }
    const body = sz.map((x) => x.text).join("\n");
    if (!citationsIn(body).includes("artifacts/size.txt")) bad(start, "Size section must cite artifacts/size.txt");
  }

  // Plan conformance.
  if (sectionBetween(doc, "Plan conformance")) {
    const t = tableIn(doc, "Plan conformance", ["Change", "Present", "Note"]);
    if (!t) bad(sectionBetween(doc, "Plan conformance").start, "Plan conformance section needs a table with columns Change | Present | Note");
    else if (t.rows.length === 0) bad(t.line, "Plan conformance table has no rows");
  }

  // Live evidence.
  if (sectionBetween(doc, "Live evidence")) {
    const lv = sectionLines(doc, "Live evidence");
    const body = lv.map((x) => x.text).join("\n");
    const unavailable = findLine(lv, /^Live: unavailable \(.+\)\s*$/);
    if (!unavailable && citationsIn(body).length === 0) {
      bad(sectionBetween(doc, "Live evidence").start, 'Live evidence needs "Live: unavailable (<reason>)" or a cited artifact');
    }
  }

  // Audits.
  let auditBlocks = 0;
  let missingLanes = [];
  let fixFindings = 0;
  if (sectionBetween(doc, "Audits") && !opts.gatesOnly) {
    const au = sectionLines(doc, "Audits");
    const start = sectionBetween(doc, "Audits").start;
    for (const lane of ["A1", "A2"]) {
      const counts = findLine(au, new RegExp(`^${lane}: findings=(\\d+) block=(\\d+) should=(\\d+) nit=(\\d+)\\s*$`));
      const missing = findLine(au, new RegExp(`^${lane}: missing \\(.+\\)\\s*$`));
      if (counts) {
        const [findings, block, should, nit] = counts.m.slice(1, 5).map(Number);
        if (findings !== block + should + nit) {
          bad(counts.line, `${lane} findings=${findings} does not equal block+should+nit=${block + should + nit}`);
        }
        auditBlocks += block;
        const listed = { block: 0, should: 0, nit: 0 };
        for (const l of au) {
          const m = l.text.match(FINDING);
          if (m && m[1] === lane) listed[m[2]]++;
        }
        for (const [sev, n] of [["block", block], ["should", should], ["nit", nit]]) {
          if (listed[sev] !== n) bad(counts.line, `${lane} reports ${sev}=${n} but lists ${listed[sev]} ${sev} finding${listed[sev] === 1 ? "" : "s"} with a disposition`);
        }
      } else if (missing) {
        missingLanes.push(lane);
      } else {
        bad(start, `Audits needs an "${lane}: findings=<n> block=<n> should=<n> nit=<n>" or "${lane}: missing (<reason>)" line`);
      }
    }
    for (const l of au) {
      if (!/^- \[A\d\]/.test(l.text)) continue;
      const m = l.text.match(FINDING);
      if (!m) {
        bad(l.line, 'audit finding must read "- [A1|A2] [block|should|nit] <finding>; <fix | park: <owner> | dismissed: <reason>>"');
        continue;
      }
      if (m[2] === "block" && m[4] !== "fix") bad(l.line, `block finding must be disposed as fix, not "${m[4].split(":")[0]}"`);
      if (m[4] === "fix") fixFindings++;
    }
  }

  // Rerun.
  if (sectionBetween(doc, "Rerun")) {
    const rr = sectionLines(doc, "Rerun");
    const start = sectionBetween(doc, "Rerun").start;
    if (!findLine(rr, /^rerun\.sh exit code:\s*\d+\s*$/)) bad(start, 'Rerun section has no "rerun.sh exit code:" line');
    const ran = findLine(rr, /^Ran at:\s*(\S+)\s*$/);
    if (!ran) bad(start, 'Rerun section has no "Ran at: <ISO timestamp>" line');
    else if (!ISO_TS.test(ran.m[1])) bad(ran.line, `Ran at "${ran.m[1]}" is not an ISO timestamp`);
  }

  // Verdict.
  if (sectionBetween(doc, "Verdict")) {
    const vd = sectionLines(doc, "Verdict");
    const start = sectionBetween(doc, "Verdict").start;
    const v = findLine(vd, /^Verdict:\s*(PASS|FAIL)\s*$/);
    if (!v) {
      bad(start, 'Verdict section needs "Verdict: PASS" or "Verdict: FAIL"');
    } else if (v.m[1] === "FAIL") {
      if (!findLine(vd, /^Blocking:\s*\S/)) bad(v.line, "FAIL verdict needs a Blocking: line");
    } else {
      if (newFailures !== null && newFailures > 0) bad(v.line, `verdict PASS with ${newFailures} new failures`);
      if (auditBlocks > 0) bad(v.line, `verdict PASS with ${auditBlocks} blocking audit finding${auditBlocks === 1 ? "" : "s"}`);
      for (const lane of missingLanes) bad(v.line, `verdict PASS with audit lane ${lane} missing`);
      if (fixFindings > auditBlocks) {
        const n = fixFindings - auditBlocks;
        bad(v.line, `verdict PASS with ${n} should or nit finding${n === 1 ? "" : "s"} disposed as fix (fix means a fix round, so FAIL; otherwise park or dismiss)`);
      }
    }
  }

  // Artifact cross-check.
  const cited = new Map();
  doc.lines.forEach((l, idx) => {
    for (const c of citationsIn(l)) if (!cited.has(c)) cited.set(c, idx + 1);
  });
  if (!fs.existsSync(artifactsDir)) {
    bad(0, "artifacts/ directory not found");
  }
  const ignorePath = path.join(artifactsDir, ".gitignore");
  const ignored = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, "utf8").split(/\r?\n/).map((x) => x.trim()) : [];
  for (const want of IGNORE_LINES) {
    if (!ignored.includes(want)) bad(0, `artifacts/.gitignore must contain the line "${want}"`);
  }
  const logsLocal = ignored.includes("*.log");
  for (const name of REQUIRED_ARTIFACTS) {
    if (!fs.existsSync(path.join(artifactsDir, name))) bad(0, `required artifact "artifacts/${name}" not found`);
    else if (!cited.has(`artifacts/${name}`)) bad(0, `required artifact "artifacts/${name}" is not cited in report.md`);
  }
  for (const [c, line] of cited) {
    if (fs.existsSync(path.join(bundleDir, c))) continue;
    // A raw log is local evidence: absent in a fresh clone, present where the run happened.
    if (logsLocal && c.endsWith(".log")) continue;
    bad(line, `cited artifact "${c}" not found`);
  }
  const tracked = spawnSync("git", ["-C", bundleDir, "ls-files", "--", "artifacts"], { encoding: "utf8" });
  if (tracked.status === 0) {
    for (const f of tracked.stdout.split("\n").filter(Boolean)) {
      if (f.endsWith(".log") || /(^|\/)rerun-/.test(f)) bad(0, `"${f}" is committed; raw logs and rerun output stay local (git rm --cached it)`);
    }
  }
  for (const rel of walkArtifacts(artifactsDir)) {
    const full = `artifacts/${rel}`;
    const covered = cited.has(full) || [...cited.keys()].some((c) => full.startsWith(`${c}/`));
    if (!covered && !REQUIRED_ARTIFACTS.includes(rel)) bad(0, `artifact "${full}" is not cited in report.md`);
    const size = fs.statSync(path.join(artifactsDir, rel)).size;
    const kb = Math.round(size / 1024);
    if (kb > SIZE_WARN_KB) warnings.push(`warning: ${full} is ${kb} KB, over ${SIZE_WARN_KB} KB`);
  }

  // rerun.sh.
  if (!fs.existsSync(rerunPath)) {
    problems.push(problem(rerunPath, 0, "rerun.sh not found"));
  } else {
    const mode = fs.statSync(rerunPath).mode;
    if ((mode & 0o111) === 0) problems.push(problem(rerunPath, 0, "rerun.sh is not executable"));
    const src = fs.readFileSync(rerunPath, "utf8");
    if (!src.startsWith("#!/usr/bin/env bash")) problems.push(problem(rerunPath, 1, "rerun.sh must start with #!/usr/bin/env bash"));
    if (!/^\s*set -euo pipefail\s*$/m.test(src)) problems.push(problem(rerunPath, 0, 'rerun.sh must contain "set -euo pipefail"'));
    const r = spawnSync("bash", ["-n", rerunPath], { encoding: "utf8" });
    if (r.status !== 0) problems.push(problem(rerunPath, 0, `rerun.sh failed bash -n: ${r.stderr.trim().split("\n")[0]}`));
  }

  return { problems, warnings };
}

function main(argv) {
  let bundleDir = null;
  let repo = null;
  let gatesOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") repo = argv[++i];
    else if (argv[i] === "--lane") {
      if (argv[++i] !== "L") {
        console.error("--lane takes L (the gates lane, before the coordinator folds the audits)");
        return 1;
      }
      gatesOnly = true;
    }
    else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log("Usage: node check-verification.mjs <bundle-dir> [--repo <path>] [--lane L]");
      return 0;
    } else if (!bundleDir) bundleDir = argv[i];
    else {
      console.error(`unexpected argument: ${argv[i]}`);
      return 1;
    }
  }
  if (!bundleDir) {
    console.error("Usage: node check-verification.mjs <bundle-dir> [--repo <path>] [--lane L]");
    return 1;
  }
  const { problems, warnings } = checkBundle(path.resolve(bundleDir), { repo, gatesOnly });
  for (const w of warnings) console.log(w);
  for (const p of problems) console.error(p);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
