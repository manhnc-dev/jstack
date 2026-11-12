// Generates the Cursor and Codex trees under harness/ from the Claude Code root. No dependencies.

import fs from "node:fs";
import path from "node:path";

export const HARNESSES = {
  cursor: {
    label: "Cursor",
    command: (cmd) => `/jstack-${cmd}`,
    adapter: "docs/harness/cursor.md",
  },
  codex: {
    label: "Codex",
    command: (cmd) => `$jstack-${cmd}`,
    adapter: "docs/harness/codex.md",
  },
};

export const ROLES_READ_ONLY_TOOLS = new Set(["Read", "Grep", "Glob", "Bash"]);

// Pipeline order for listings. Commands not named here follow alphabetically.
export const COMMAND_ORDER = ["init", "plan", "pr-plan", "implement", "verify", "verify-stack", "build", "help"];

export function orderCommands(commands) {
  const rank = (c) => (COMMAND_ORDER.includes(c.name) ? COMMAND_ORDER.indexOf(c.name) : COMMAND_ORDER.length);
  return [...commands].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// Claude Code names that must not survive into a generated file unless the harness adapter maps them.
export const CLAUDE_TERMS = [
  "CLAUDE_PLUGIN_ROOT",
  "$ARGUMENTS",
  "/jstack:",
  "jstack:jstack-",
  "Claude Code",
  "~/.claude",
  "claude plugin",
  "subagent_type",
  "isolation:",
  "AskUserQuestion",
  "TodoWrite",
  "Agent tool",
];

const ARGUMENTS_TEXT = "the text after the skill name";

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    data[key] = kv[2] === "" ? [] : unquote(kv[2]);
  }
  return { data, body: text.slice(m[0].length) };
}

function unquote(value) {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

export function transformText(text, harness) {
  const h = HARNESSES[harness];
  if (!h) throw new Error(`unknown harness ${harness}`);
  return text
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/commands\/([a-z][a-z-]*)\.md/g, "<jstack>/skills/jstack-$1/SKILL.md")
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "<jstack>")
    .replace(/\/jstack:([a-z][a-z-]*)/g, (_, cmd) => h.command(cmd))
    .replace(/jstack:jstack-([a-z]+)/g, "jstack-$1")
    .replace(/`\$ARGUMENTS`/g, ARGUMENTS_TEXT)
    .replace(/\$ARGUMENTS/g, ARGUMENTS_TEXT)
    .replace(/~\/\.claude\/plugins\/cache\/jstack\/jstack\/\d[^/\s`]*/g, "<jstack>");
}

export function scanTerms(text, adapterText) {
  return CLAUDE_TERMS.filter((term) => text.includes(term) && !adapterText.includes(term));
}

function walk(dir, rel = "") {
  const out = [];
  for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
    if (name === ".DS_Store" || name === "node_modules") continue;
    const r = rel ? `${rel}/${name}` : name;
    const stat = fs.statSync(path.join(dir, r));
    if (stat.isDirectory()) out.push(...walk(dir, r));
    else out.push(r);
  }
  return out;
}

function fileEntry(abs) {
  return { bytes: fs.readFileSync(abs), executable: (fs.statSync(abs).mode & 0o111) !== 0 };
}

export function readSource(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8"));
  const commands = fs
    .readdirSync(path.join(root, "commands"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(root, "commands", f), "utf8"));
      return { name: f.replace(/\.md$/, ""), description: data.description ?? "", argumentHint: data["argument-hint"] ?? "", body };
    });
  const agents = fs
    .readdirSync(path.join(root, "agents"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(root, "agents", f), "utf8"));
      const tools = typeof data.tools === "string" ? data.tools.split(",").map((t) => t.trim()).filter(Boolean) : data.tools ?? [];
      return {
        name: data.name ?? f.replace(/\.md$/, ""),
        description: data.description ?? "",
        model: data.model ?? "inherit",
        tools,
        skills: Array.isArray(data.skills) ? data.skills : [],
        body,
      };
    });
  const skillsDir = path.join(root, "skills");
  const skills = fs
    .readdirSync(skillsDir)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, "SKILL.md")))
    .sort()
    .map((name) => ({
      name,
      files: walk(skillsDir, name)
        .filter((rel) => !rel.endsWith(".test.mjs"))
        .map((rel) => ({ rel: rel.slice(name.length + 1), ...fileEntry(path.join(skillsDir, rel)) })),
    }));
  const adapters = {};
  for (const [key, h] of Object.entries(HARNESSES)) adapters[key] = fs.readFileSync(path.join(root, h.adapter), "utf8");
  const guide = fs.readFileSync(path.join(root, "docs", "guide", "README.md"), "utf8");
  const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
  const markdownLib = fileEntry(path.join(root, "scripts", "lib", "markdown.mjs"));
  const installAgents = fileEntry(path.join(root, "scripts", "harness-assets", "install-agents.sh"));
  const harnessReadme = fs.readFileSync(path.join(root, "scripts", "harness-assets", "README.md"), "utf8");
  return { manifest, commands, agents, skills, adapters, guide, license, markdownLib, installAgents, harnessReadme };
}

function adapterLine(harness) {
  const h = HARNESSES[harness];
  return `In ${h.label}, read \`<jstack>/${h.adapter}\` once per session before you follow this skill. It maps the Claude Code names jstack uses to ${h.label}.`;
}

const CODEX_INIT_PREAMBLE = `Codex only, before step 1: the jstack agents must be installed as Codex custom agents. If \`~/.codex/agents/jstack-planner.toml\` is missing, or the directory named after \`# jstack root:\` on its first line no longer exists, run \`bash <jstack>/scripts/install-agents.sh\`, then tell the user to start a new Codex session before the next jstack skill, and stop.`;

export function commandToSkill(cmd, harness) {
  const h = HARNESSES[harness];
  const skillName = `jstack-${cmd.name}`;
  const description = transformText(cmd.description, harness);
  const usage = `${h.command(cmd.name)}${cmd.argumentHint ? ` ${cmd.argumentHint}` : ""}`;
  const front = [`name: ${skillName}`, `description: ${yamlString(description)}`];
  if (harness === "cursor") front.push("disable-model-invocation: true");
  const preamble = harness === "codex" && cmd.name === "init" ? `${CODEX_INIT_PREAMBLE}\n\n` : "";
  const body = transformText(cmd.body.replace(/^\s+/, ""), harness);
  const text = `---\n${front.join("\n")}\n---\n\n# ${h.command(cmd.name)}\n\nUsage: \`${usage}\`\n\n${adapterLine(harness)}\n\n${preamble}${body}`;
  const files = [{ rel: `skills/${skillName}/SKILL.md`, bytes: Buffer.from(text), executable: false }];
  if (harness === "codex") {
    const short = description.split(/(?<=\.)\s/)[0].slice(0, 120);
    const yaml = [
      "interface:",
      `  display_name: ${yamlString(`jstack ${cmd.name}`)}`,
      `  short_description: ${yamlString(short)}`,
      `  default_prompt: ${yamlString(`Use ${h.command(cmd.name)} ${cmd.argumentHint}`.trim())}`,
      "",
    ].join("\n");
    files.push({ rel: `skills/${skillName}/agents/openai.yaml`, bytes: Buffer.from(yaml), executable: false });
  }
  return files;
}

export function isReadOnly(agent) {
  return agent.tools.length > 0 && agent.tools.every((t) => ROLES_READ_ONLY_TOOLS.has(t));
}

function readFirstLine(agent, harness) {
  const body = transformText(agent.body, harness);
  const missing = agent.skills.filter((s) => !body.includes(`skills/${s}/SKILL.md`));
  if (missing.length === 0) return "";
  return `Also read before you start: ${missing.map((s) => `\`<jstack>/skills/${s}/SKILL.md\``).join(", ")}.\n\n`;
}

export function agentToCursor(agent) {
  const front = [`name: ${agent.name}`, `description: ${yamlString(transformText(agent.description, "cursor"))}`, "model: inherit"];
  if (isReadOnly(agent)) front.push("readonly: true");
  const body = transformText(agent.body.replace(/^\s+/, ""), "cursor");
  return `---\n${front.join("\n")}\n---\n\n${readFirstLine(agent, "cursor")}${body}`;
}

function tomlBasic(value) {
  return JSON.stringify(String(value));
}

function tomlMultiline(value) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"""/g, '""\\"');
  return `"""\n${escaped}"""`;
}

export function agentToToml(agent) {
  const body = `${readFirstLine(agent, "codex")}${transformText(agent.body.replace(/^\s+/, ""), "codex")}`;
  return [
    "# jstack root: <jstack>",
    `# Generated from agents/${agent.name}.md by scripts/build-harness.mjs. Do not edit; rerun the generator.`,
    `name = ${tomlBasic(agent.name)}`,
    `description = ${tomlBasic(transformText(agent.description, "codex"))}`,
    `developer_instructions = ${tomlMultiline(body)}`,
    "",
  ].join("\n");
}

// Reads the developer_instructions of a TOML produced by agentToToml. For tests and for the adapter fallback.
export function tomlInstructions(toml) {
  const m = toml.match(/developer_instructions = """\n([\s\S]*?)"""\n?$/);
  if (!m) return null;
  return m[1].replace(/""\\"/g, '"""').replace(/\\\\/g, "\\");
}

function identity(manifest) {
  const out = {};
  for (const key of ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"]) {
    if (manifest[key] !== undefined) out[key] = manifest[key];
  }
  return out;
}

function codexInterface(manifest) {
  return {
    displayName: "jstack",
    shortDescription: "Plan, split, implement, verify with agent teams",
    longDescription: manifest.description,
    developerName: manifest.author?.name ?? "",
    category: "Developer Tools",
    capabilities: ["Interactive", "Read", "Write"],
    websiteURL: manifest.homepage ?? "",
    defaultPrompt: ["Use $jstack-plan to turn a requirement into a reviewable implementation plan with sequence diagrams."],
  };
}

export function manifests(manifest, harness) {
  const id = identity(manifest);
  if (harness === "cursor") {
    return {
      ".cursor-plugin/plugin.json": { ...id, displayName: "jstack", category: "developer-tools", skills: "./skills/", agents: "./agents/" },
    };
  }
  return {
    ".codex-plugin/plugin.json": { ...id, skills: "./skills/", interface: codexInterface(manifest) },
    "plugin.json": {
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      ...id,
      extensions: { "com.openai": { interface: codexInterface(manifest) } },
    },
  };
}

function treeReadme(source, harness) {
  const h = HARNESSES[harness];
  const repo = source.manifest.repository ?? "https://github.com/manhnc-dev/jstack";
  const cmds = orderCommands(source.commands).map((c) => `| \`${h.command(c.name)}\` | ${transformText(c.description, harness).split(/(?<=\.)\s/)[0]} |`).join("\n");
  const install =
    harness === "cursor"
      ? [
          "```bash",
          "git clone " + repo + " ~/src/jstack",
          "mkdir -p ~/.cursor/plugins/local",
          "ln -s ~/src/jstack/harness/cursor ~/.cursor/plugins/local/jstack",
          "```",
          "",
          "Then reload Cursor (Developer: Reload Window) and confirm the skills and agents under Customize. A team marketplace can import the repository instead; its `.cursor-plugin/marketplace.json` points here.",
        ]
      : [
          "```bash",
          "codex plugin marketplace add manhnc-dev/jstack   # or a local clone path",
          "codex plugin add jstack@jstack",
          "```",
          "",
          "Start a new Codex session, then run `$jstack-init` in your repo. It installs the six jstack agents into `~/.codex/agents/` the first time (Codex plugins cannot ship agents) and asks you to start one more session.",
        ];
  return [
    `# jstack for ${h.label}`,
    "",
    `This folder is generated from the Claude Code plugin at the repository root by \`node scripts/build-harness.mjs\`. Do not edit it here; edit the root and regenerate. Full documentation: ${repo}.`,
    "",
    "## Install",
    "",
    ...install,
    "",
    "## Commands",
    "",
    "| Skill | Does |",
    "|---|---|",
    cmds,
    "",
    `Commands are skills in ${h.label}. Type the skill name, then the arguments. Human gates after ${h.command("plan")} and ${h.command("pr-plan")}. Nothing merges.`,
    "",
    `Each skill starts by reading \`${h.adapter}\`, which maps the Claude Code names in the shared text to ${h.label}. \`<jstack>\` in any file means this folder once installed.`,
    "",
  ].join("\n");
}

export function renderTree(source, harness) {
  const files = new Map();
  const put = (rel, bytes, executable = false) => files.set(rel, { bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), executable });
  for (const [rel, json] of Object.entries(manifests(source.manifest, harness))) put(rel, JSON.stringify(json, null, 2) + "\n");
  for (const skill of source.skills) {
    for (const f of skill.files) {
      const bytes = f.rel.endsWith(".md") ? Buffer.from(transformText(f.bytes.toString("utf8"), harness)) : f.bytes;
      put(`skills/${skill.name}/${f.rel}`, bytes, f.executable);
    }
  }
  for (const cmd of source.commands) for (const f of commandToSkill(cmd, harness)) put(f.rel, f.bytes, f.executable);
  for (const agent of source.agents) {
    if (harness === "cursor") put(`agents/${agent.name}.md`, agentToCursor(agent));
    else put(`agents/${agent.name}.toml`, agentToToml(agent));
  }
  if (harness === "codex") put("scripts/install-agents.sh", source.installAgents.bytes, true);
  put("scripts/lib/markdown.mjs", source.markdownLib.bytes, source.markdownLib.executable);
  put(HARNESSES[harness].adapter, source.adapters[harness]);
  put("docs/guide/README.md", transformText(source.guide, harness));
  put("LICENSE", source.license);
  put("README.md", treeReadme(source, harness));
  const adapterText = source.adapters[harness];
  const problems = [];
  for (const [rel, entry] of files) {
    if (!rel.endsWith(".md") || rel === HARNESSES[harness].adapter) continue;
    for (const term of scanTerms(entry.bytes.toString("utf8"), adapterText)) problems.push(`${harness}/${rel}: ${term} has no row in ${HARNESSES[harness].adapter}`);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return files;
}

export function renderAll(source) {
  const all = new Map();
  all.set("README.md", { bytes: Buffer.from(source.harnessReadme), executable: false });
  for (const harness of Object.keys(HARNESSES)) {
    for (const [rel, entry] of renderTree(source, harness)) all.set(`${harness}/${rel}`, entry);
  }
  return all;
}

export function writeTree(files, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [rel, entry] of files) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, entry.bytes);
    fs.chmodSync(abs, entry.executable ? 0o755 : 0o644);
  }
}

export function diffTree(files, dir) {
  const out = new Set();
  const existing = fs.existsSync(dir) ? walk(dir) : [];
  for (const rel of existing) if (!files.has(rel)) out.add(`extra ${rel}`);
  for (const [rel, entry] of files) {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) {
      out.add(`missing ${rel}`);
      continue;
    }
    const current = fileEntry(abs);
    if (!current.bytes.equals(entry.bytes)) out.add(`changed ${rel}`);
    else if (current.executable !== entry.executable) out.add(`mode ${rel}`);
  }
  return [...out].sort();
}
