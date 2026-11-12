import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDocument,
  sectionBetween,
  findPlaceholders,
  tableByHeaders,
  idsIn,
  mermaidMessages,
  problem,
} from "./markdown.mjs";

const sample = `# Title

## Summary

Hello {{name}}.

## Change table

| ID | File | Method |
|---|---|---|
| C-1 | a.mjs | run(x): void |
| C-2 | b.mjs | stop(): void |

### SD-1: Start flow

\`\`\`mermaid
sequenceDiagram
  participant A
  A->>B: run(x): void
  B-->>A: ok
  A-)C: fire()
  {{inside fence}}
\`\`\`

## Open questions
`;

test("parseDocument finds headings with level and line", () => {
  const doc = parseDocument(sample);
  const h = doc.headings.map((x) => [x.level, x.text, x.line]);
  assert.deepEqual(h[0], [1, "Title", 1]);
  assert.deepEqual(h[1], [2, "Summary", 3]);
  assert.deepEqual(h[2], [2, "Change table", 7]);
  assert.deepEqual(h[3], [3, "SD-1: Start flow", 14]);
});

test("parseDocument parses tables with trimmed cells", () => {
  const doc = parseDocument(sample);
  assert.equal(doc.tables.length, 1);
  const t = doc.tables[0];
  assert.deepEqual(t.headers, ["ID", "File", "Method"]);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows[0].cells, ["C-1", "a.mjs", "run(x): void"]);
  assert.equal(t.rows[0].line, 11);
  assert.equal(t.line, 9);
});

test("parseDocument records fences with language, body and nearest heading", () => {
  const doc = parseDocument(sample);
  assert.equal(doc.fences.length, 1);
  const f = doc.fences[0];
  assert.equal(f.lang, "mermaid");
  assert.equal(f.headingText, "SD-1: Start flow");
  assert.ok(f.body.startsWith("sequenceDiagram"));
  assert.equal(f.line, 16);
});

test("findPlaceholders reports {{ outside fences only", () => {
  const doc = parseDocument(sample);
  assert.deepEqual(findPlaceholders(doc), [5]);
});

test("sectionBetween returns line range of a heading section", () => {
  const doc = parseDocument(sample);
  const s = sectionBetween(doc, "Summary");
  assert.deepEqual(s, { start: 3, end: 7 });
  assert.equal(sectionBetween(doc, "Nope"), null);
});

test("tableByHeaders is case-insensitive and requires all headers", () => {
  const doc = parseDocument(sample);
  assert.ok(tableByHeaders(doc, ["id", "method"]));
  assert.equal(tableByHeaders(doc, ["ID", "Class"]), null);
});

test("idsIn returns deduplicated ids in order", () => {
  assert.deepEqual(idsIn("C-1, C-12 and C-1, SD-3", "C"), ["C-1", "C-12"]);
  assert.deepEqual(idsIn("C-1, SD-3", "SD"), ["SD-3"]);
  assert.deepEqual(idsIn("PR-2 depends on PR-1", "PR"), ["PR-2", "PR-1"]);
});

test("mermaidMessages parses arrows", () => {
  const doc = parseDocument(sample);
  const m = mermaidMessages(doc.fences[0].body);
  assert.deepEqual(m, [
    { from: "A", to: "B", text: "run(x): void" },
    { from: "B", to: "A", text: "ok" },
    { from: "A", to: "C", text: "fire()" },
  ]);
});

test("problem formats file:line: message", () => {
  assert.equal(problem("p.md", 4, "bad"), "p.md:4: bad");
});

test("a pipe inside a code span or escaped with a backslash stays in its cell", () => {
  const doc = parseDocument("| A | B |\n|---|---|\n| `x | y` | a \\| b |\n| `open | c |\n");
  assert.deepEqual(doc.tables[0].rows[0].cells, ["`x | y`", "a | b"]);
  assert.deepEqual(doc.tables[0].rows[1].cells, ["`open", "c"]);
});
