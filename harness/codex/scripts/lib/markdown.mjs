// Shared markdown parsing for jstack checkers. No dependencies.

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  // A pipe inside a code span, or escaped as \|, belongs to the cell.
  const cells = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      cur += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  // An unclosed backtick is not a code span: fall back to the plain split.
  if (inCode) return s.split("|").map((c) => c.trim());
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export function parseDocument(text) {
  const lines = text.split(/\r?\n/);
  const headings = [];
  const tables = [];
  const fences = [];
  const fenceLines = new Set();
  let i = 0;
  let lastHeading = "";
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;
    const open = line.match(FENCE_OPEN);
    if (open) {
      const marker = open[1];
      const lang = open[2] || "";
      const body = [];
      fenceLines.add(lineNo);
      let j = i + 1;
      for (; j < lines.length; j++) {
        fenceLines.add(j + 1);
        const t = lines[j].trim();
        if (t.startsWith(marker[0]) && t.replace(/\s+$/, "") === marker[0].repeat(t.trim().length) && t.length >= marker.length) break;
        body.push(lines[j]);
      }
      fences.push({ line: lineNo, lang, body: body.join("\n"), headingText: lastHeading });
      i = j + 1;
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      lastHeading = h[2];
      headings.push({ level: h[1].length, text: h[2], line: lineNo });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const headers = splitRow(line);
      const rows = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        if (!lines[j].trim().startsWith("|")) break;
        rows.push({ line: j + 1, cells: splitRow(lines[j]) });
      }
      tables.push({ line: lineNo, headers, rows, headingText: lastHeading });
      i = j;
      continue;
    }
    i++;
  }
  return { lines, headings, tables, fences, fenceLines };
}

export function sectionBetween(doc, headingText) {
  const idx = doc.headings.findIndex((h) => h.text === headingText);
  if (idx < 0) return null;
  const h = doc.headings[idx];
  let end = doc.lines.length + 1;
  for (let k = idx + 1; k < doc.headings.length; k++) {
    if (doc.headings[k].level <= h.level) {
      end = doc.headings[k].line;
      break;
    }
  }
  return { start: h.line, end };
}

export function sectionText(doc, headingText) {
  const s = sectionBetween(doc, headingText);
  if (!s) return "";
  return doc.lines.slice(s.start, s.end - 1).join("\n");
}

export function findPlaceholders(doc) {
  const out = [];
  doc.lines.forEach((l, idx) => {
    const n = idx + 1;
    if (doc.fenceLines.has(n)) return;
    if (l.includes("{{")) out.push(n);
  });
  return out;
}

export function tableByHeaders(doc, required) {
  const want = required.map((r) => r.trim().toLowerCase());
  for (const t of doc.tables) {
    const have = t.headers.map((h) => h.trim().toLowerCase());
    if (want.every((w) => have.includes(w))) return t;
  }
  return null;
}

export function columnIndex(table, name) {
  const n = name.trim().toLowerCase();
  return table.headers.findIndex((h) => h.trim().toLowerCase() === n);
}

export function idsIn(text, prefix) {
  const re = new RegExp(`\\b${prefix}-(\\d+)\\b`, "g");
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const id = `${prefix}-${m[1]}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

const ARROW = /^\s*([A-Za-z_][\w.]*)\s*(-->>|->>|-->|->|--\)|-\)|--x|-x)\s*([A-Za-z_][\w.]*)\s*:\s*(.*)$/;

export function mermaidMessages(body) {
  const out = [];
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(ARROW);
    if (m) out.push({ from: m[1], to: m[3], text: m[4].trim() });
  }
  return out;
}

export function problem(file, line, msg) {
  return `${file}:${line}: ${msg}`;
}
