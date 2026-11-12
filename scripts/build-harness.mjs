#!/usr/bin/env node
// Usage: node scripts/build-harness.mjs [--check] [--out <dir>]
// Writes harness/cursor and harness/codex from the Claude Code root. --check renders in memory
// and exits 1 when the committed trees differ from what would be written.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSource, renderAll, writeTree, diffTree } from "./lib/harness.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(ROOT, "harness");

let files;
try {
  files = renderAll(readSource(ROOT));
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
}

if (check) {
  const diff = diffTree(files, out);
  if (diff.length > 0) {
    for (const line of diff) console.log(`STALE ${line}`);
    console.log(`harness trees are stale; run: node scripts/build-harness.mjs`);
    process.exit(1);
  }
  console.log(`harness trees are fresh (${files.size} files)`);
} else {
  writeTree(files, out);
  console.log(`wrote ${files.size} files to ${path.relative(process.cwd(), out) || "."}`);
}
