import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFrontmatter,
  transformText,
  scanTerms,
  commandToSkill,
  agentToCursor,
  agentToToml,
  tomlInstructions,
  isReadOnly,
  manifests,
  readSource,
  renderTree,
  renderAll,
  writeTree,
  diffTree,
  orderCommands,
} from "./harness.mjs";

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach((d) => rmSync(d, { recursive: true, force: true })));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function tmp() {
  const d = mkdtempSync(join(tmpdir(), "jstack-harness-"));
  TEMP_DIRS.push(d);
  return d;
}

test("parseFrontmatter reads scalars, quoted strings, and lists", () => {
  const { data, body } = parseFrontmatter(`---\nname: x\nargument-hint: "<PR-n> [--fix \\"<f>\\"]"\nskills:\n  - a\n  - b\ntools: Read, Bash\n---\n\nbody here\n`);
  assert.equal(data.name, "x");
  assert.equal(data["argument-hint"], '<PR-n> [--fix "<f>"]');
  assert.deepEqual(data.skills, ["a", "b"]);
  assert.equal(data.tools, "Read, Bash");
  assert.equal(body, "\nbody here\n");
});

test("transformText applies the rules in order for cursor", () => {
  const src = "Read `${CLAUDE_PLUGIN_ROOT}/commands/verify.md` and `${CLAUDE_PLUGIN_ROOT}/skills/pr-plan/SKILL.md`. Spawn `jstack:jstack-explorer`. Then `/jstack:pr-plan`. Arguments: `$ARGUMENTS`. Path ~/.claude/plugins/cache/jstack/jstack/0.1.0/skills/x";
  const out = transformText(src, "cursor");
  assert.equal(
    out,
    "Read `<jstack>/skills/jstack-verify/SKILL.md` and `<jstack>/skills/pr-plan/SKILL.md`. Spawn `jstack-explorer`. Then `/jstack-pr-plan`. Arguments: the text after the skill name. Path <jstack>/skills/x",
  );
});

test("transformText uses the $ prefix for codex and rewrites inline $ARGUMENTS", () => {
  assert.equal(transformText("run `/jstack:plan` then `/jstack:build --no-gate`", "codex"), "run `$jstack-plan` then `$jstack-build --no-gate`");
  assert.equal(transformText("Answer the question in `$ARGUMENTS` with", "codex"), "Answer the question in the text after the skill name with");
  assert.throws(() => transformText("x", "vscode"), /unknown harness/);
  assert.equal(transformText("`~/.claude/plugins/cache/jstack/jstack/<version>` in Claude Code", "codex"), "`~/.claude/plugins/cache/jstack/jstack/<version>` in Claude Code");
});

test("scanTerms reports Claude-only terms the adapter does not mention", () => {
  assert.deepEqual(scanTerms("use TodoWrite and ${CLAUDE_PLUGIN_ROOT}", "maps CLAUDE_PLUGIN_ROOT only"), ["TodoWrite"]);
  assert.deepEqual(scanTerms("plain text", ""), []);
  assert.deepEqual(scanTerms("Claude Code names", "| Claude Code | Cursor |"), []);
});

const implement = {
  name: "implement",
  description: "Implement one PR. Then runs /jstack:verify unless --no-verify.",
  argumentHint: '<PR-n | slug/PR-n> [--fix "<finding>"] [--no-verify]',
  body: "\nImplement exactly one PR. A fresh `jstack:jstack-implementer` writes the code.\n\nArguments: `$ARGUMENTS`\n\n1. Read `${CLAUDE_PLUGIN_ROOT}/skills/jstack-principles/SKILL.md`.\n8. Continue with `${CLAUDE_PLUGIN_ROOT}/commands/verify.md`.\n",
};

test("commandToSkill for cursor: name, usage, adapter line, disable-model-invocation", () => {
  const files = commandToSkill(implement, "cursor");
  assert.deepEqual(files.map((f) => f.rel), ["skills/jstack-implement/SKILL.md"]);
  const text = files[0].bytes.toString("utf8");
  assert.match(text, /^---\nname: jstack-implement\ndescription: "Implement one PR\. Then runs \/jstack-verify unless --no-verify\."\ndisable-model-invocation: true\n---\n/);
  assert.ok(text.includes('Usage: `/jstack-implement <PR-n | slug/PR-n> [--fix "<finding>"] [--no-verify]`'));
  assert.ok(text.includes("read `<jstack>/docs/harness/cursor.md` once per session"));
  assert.ok(text.includes("Arguments: the text after the skill name"));
  assert.ok(text.includes("A fresh `jstack-implementer` writes"));
  assert.ok(text.includes("Continue with `<jstack>/skills/jstack-verify/SKILL.md`."));
  assert.ok(!text.includes("$ARGUMENTS") && !text.includes("CLAUDE_PLUGIN_ROOT"));
});

test("commandToSkill for codex: $ names, openai.yaml with interface metadata only, no cursor-only key", () => {
  const files = commandToSkill(implement, "codex");
  assert.deepEqual(files.map((f) => f.rel), ["skills/jstack-implement/SKILL.md", "skills/jstack-implement/agents/openai.yaml"]);
  const skill = files[0].bytes.toString("utf8");
  assert.ok(!skill.includes("disable-model-invocation"));
  assert.ok(skill.includes("# $jstack-implement\n\nUsage: `$jstack-implement <PR-n | slug/PR-n>"));
  const yaml = files[1].bytes.toString("utf8");
  assert.ok(yaml.includes('display_name: "jstack implement"'));
  assert.ok(yaml.includes('short_description: "Implement one PR."'));
  assert.ok(!yaml.includes("allow_implicit_invocation"), "the policy block hides the skill from Codex's listing entirely");
});

test("codex init skill carries the agent install preamble, others do not", () => {
  const init = commandToSkill({ name: "init", description: "d", argumentHint: "", body: "\nSteps:\n" }, "codex")[0].bytes.toString("utf8");
  assert.ok(init.includes("Codex only, before step 1"));
  assert.ok(init.includes("bash <jstack>/scripts/install-agents.sh"));
  assert.ok(!commandToSkill(implement, "codex")[0].bytes.toString("utf8").includes("Codex only"));
  assert.ok(!commandToSkill({ name: "init", description: "d", argumentHint: "", body: "\nSteps:\n" }, "cursor")[0].bytes.toString("utf8").includes("Codex only"));
});

const explorer = {
  name: "jstack-explorer",
  description: "Read-only grounding agent. Use for /jstack:plan.",
  model: "sonnet",
  tools: ["Read", "Grep", "Glob", "Bash"],
  skills: ["jstack-principles", "repo-profile"],
  body: "\nYou ground plans.\n\nRead first: `${CLAUDE_PLUGIN_ROOT}/skills/jstack-principles/SKILL.md`.\n",
};
const verifier = { name: "jstack-verifier", description: "Verifier.", model: "opus", tools: ["Read", "Grep", "Glob", "Bash", "Write"], skills: ["jstack-principles"], body: "\nRead first: `${CLAUDE_PLUGIN_ROOT}/skills/jstack-principles/SKILL.md`.\n" };
const implementer = { name: "jstack-implementer", description: "Implements.", model: "inherit", tools: [], skills: ["jstack-principles"], body: "\nRead first: `${CLAUDE_PLUGIN_ROOT}/skills/jstack-principles/SKILL.md`.\n" };

test("isReadOnly only when every tool is read-only and tools are declared", () => {
  assert.equal(isReadOnly(explorer), true);
  assert.equal(isReadOnly(verifier), false);
  assert.equal(isReadOnly(implementer), false);
});

test("agentToCursor rewrites frontmatter and adds the skills the body does not name", () => {
  const text = agentToCursor(explorer);
  assert.ok(text.startsWith('---\nname: jstack-explorer\ndescription: "Read-only grounding agent. Use for /jstack-plan."\nmodel: inherit\nreadonly: true\n---\n\n'));
  assert.ok(!/^tools:|^skills:/m.test(text));
  assert.ok(text.includes("Also read before you start: `<jstack>/skills/repo-profile/SKILL.md`."));
  assert.ok(!text.includes("Also read before you start: `<jstack>/skills/jstack-principles"));
  const v = agentToCursor(verifier);
  assert.ok(!v.includes("readonly"));
  assert.ok(!v.includes("Also read before you start"));
});

test("agentToToml writes name, description, developer_instructions and round-trips tricky bodies", () => {
  const text = agentToToml(explorer);
  assert.ok(text.startsWith("# jstack root: <jstack>\n"));
  assert.ok(text.includes('name = "jstack-explorer"'));
  assert.ok(text.includes('description = "Read-only grounding agent. Use for $jstack-plan."'));
  assert.ok(text.includes('developer_instructions = """\n'));
  assert.equal(tomlInstructions(text), 'Also read before you start: `<jstack>/skills/repo-profile/SKILL.md`.\n\nYou ground plans.\n\nRead first: `<jstack>/skills/jstack-principles/SKILL.md`.\n');
  const tricky = { ...implementer, skills: [], body: '\nUse """ and a back\\slash and "quotes".\n' };
  assert.equal(tomlInstructions(agentToToml(tricky)), 'Use """ and a back\\slash and "quotes".\n');
});

test("manifests derive identity from the root manifest", () => {
  const root = { name: "jstack", version: "9.9.9", description: "d", author: { name: "A" }, homepage: "h", repository: "r", license: "MIT", keywords: ["k"] };
  const cursor = manifests(root, "cursor")[".cursor-plugin/plugin.json"];
  assert.equal(cursor.version, "9.9.9");
  assert.equal(cursor.skills, "./skills/");
  assert.equal(cursor.agents, "./agents/");
  assert.equal(cursor.category, "developer-tools");
  const codex = manifests(root, "codex");
  assert.equal(codex[".codex-plugin/plugin.json"].interface.displayName, "jstack");
  assert.equal(codex[".codex-plugin/plugin.json"].skills, "./skills/");
  assert.equal(codex["plugin.json"].$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(codex["plugin.json"].extensions["com.openai"].interface.developerName, "A");
  assert.equal(codex["plugin.json"].version, "9.9.9");
});

test("orderCommands follows the pipeline", () => {
  const names = orderCommands(["help", "build", "verify-stack", "verify", "implement", "pr-plan", "plan", "init", "zzz"].map((name) => ({ name }))).map((c) => c.name);
  assert.deepEqual(names, ["init", "plan", "pr-plan", "implement", "verify", "verify-stack", "build", "help", "zzz"]);
});

test("renderTree over the real root: inventory, modes, and no unmapped Claude terms", () => {
  const source = readSource(ROOT);
  for (const harness of ["cursor", "codex"]) {
    const files = renderTree(source, harness);
    for (const cmd of ["init", "plan", "pr-plan", "implement", "verify", "verify-stack", "build", "help"]) assert.ok(files.has(`skills/jstack-${cmd}/SKILL.md`), `${harness} ${cmd}`);
    for (const skill of ["implementation-plan", "pr-plan", "verification-bundle", "jstack-principles", "sequence-diagrams", "repo-profile"]) assert.ok(files.has(`skills/${skill}/SKILL.md`), `${harness} ${skill}`);
    assert.ok(files.has("scripts/lib/markdown.mjs"));
    assert.ok(files.has("LICENSE") && files.has("README.md") && files.has("docs/guide/README.md"));
    assert.equal(files.get("skills/pr-plan/scripts/pr-size.sh").executable, true);
    assert.equal(files.get("skills/verification-bundle/references/example-bundle/rerun.sh").executable, true);
    assert.ok(![...files.keys()].some((k) => k.endsWith(".test.mjs")));
  }
  const cursor = renderTree(source, "cursor");
  assert.ok(cursor.has(".cursor-plugin/plugin.json") && cursor.has("docs/harness/cursor.md"));
  assert.match(cursor.get("agents/jstack-explorer.md").bytes.toString(), /^readonly: true$/m);
  assert.match(cursor.get("agents/jstack-reviewer.md").bytes.toString(), /^readonly: true$/m);
  assert.doesNotMatch(cursor.get("agents/jstack-verifier.md").bytes.toString(), /readonly/);
  assert.ok(!cursor.has("plugin.json") && !cursor.has("scripts/install-agents.sh"));
  const codex = renderTree(source, "codex");
  assert.ok(codex.has(".codex-plugin/plugin.json") && codex.has("plugin.json") && codex.has("docs/harness/codex.md"));
  assert.equal(codex.get("scripts/install-agents.sh").executable, true);
  for (const role of ["explorer", "planner", "splitter", "implementer", "verifier", "reviewer"]) {
    assert.ok(codex.has(`agents/jstack-${role}.toml`));
    assert.ok(codex.has(`skills/jstack-${role === "explorer" ? "init" : "plan"}/agents/openai.yaml`));
  }
});

test("renderTree throws when a source file carries a Claude-only term the adapter does not map", () => {
  const source = readSource(ROOT);
  const poisoned = { ...source, commands: [...source.commands, { name: "zap", description: "d", argumentHint: "", body: "\nUse TodoWrite here.\n" }] };
  assert.throws(() => renderTree(poisoned, "cursor"), /cursor\/skills\/jstack-zap\/SKILL\.md: TodoWrite has no row in docs\/harness\/cursor\.md/);
});

test("writeTree then diffTree is empty; a changed, missing, extra, or mode-flipped file is reported", () => {
  const source = readSource(ROOT);
  const files = renderAll(source);
  const dir = tmp();
  writeTree(files, dir);
  assert.deepEqual(diffTree(files, dir), []);
  assert.equal((statSync(join(dir, "codex/scripts/install-agents.sh")).mode & 0o111) !== 0, true);
  writeFileSync(join(dir, "cursor/README.md"), "stale");
  rmSync(join(dir, "codex/LICENSE"));
  mkdirSync(join(dir, "cursor/extra"), { recursive: true });
  writeFileSync(join(dir, "cursor/extra/file.txt"), "x");
  assert.deepEqual(diffTree(files, dir), ["changed cursor/README.md", "extra cursor/extra/file.txt", "missing codex/LICENSE"]);
  assert.equal(readFileSync(join(dir, "README.md"), "utf8").includes("generated"), true);
});
