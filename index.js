/**
 * DeepSeek Harness plugin entry for conversion-skill.
 *
 * Layout matches the bundle in the DSH publish guide and the working plugins
 * dsh-humanizer / dsh-ronge-gongzhonghao: package.json `dsh.bundle.patch`,
 * cordis.patch.yml, and this module's `inject` + `apply`. Tools are registered
 * with the host `tools` service (ronge's plain register shape, no extra
 * dependency). Each tool shells out to the existing Bun script so the skill
 * install path does not grow a second implementation.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PACKAGE_JSON = JSON.parse(readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf8"));

export const name = "conversion-skill";
export const inject = ["tools"];
export const version = PACKAGE_JSON.version;

export const TOOL_NAMES = [
  "pipeline",
  "screen_keywords",
  "check_output",
  "score_card",
  "evaluate_pdf",
  "voice_import",
  "voice_profile",
  "voice_score",
  "voice_remove",
];

function toolText(value) {
  return JSON.stringify(value, null, 2);
}

function toolsService(ctx) {
  if (ctx && typeof ctx.get === "function") {
    try {
      const fromGet = ctx.get("tools");
      if (fromGet && typeof fromGet.register === "function") return fromGet;
    } catch {
      /* host may throw when the service is absent */
    }
  }
  if (ctx && ctx.tools && typeof ctx.tools.register === "function") return ctx.tools;
  return null;
}

export function runBunScript(scriptName, args, timeoutMs = 120000) {
  const bun = process.env.BUN_BIN || "bun";
  const script = path.join(PACKAGE_DIR, "scripts", scriptName);
  const result = spawnSync(bun, [script, ...args], {
    cwd: PACKAGE_DIR,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error && result.error.code === "ENOENT") {
    return {
      ok: false,
      exitCode: 127,
      error: "本机没有 bun。DSH 里的这些工具会去跑仓库 scripts/ 下的 Bun 脚本，请先安装 Bun，或设置 BUN_BIN。",
    };
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  let json = null;
  const trimmed = stdout.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = null;
    }
  }
  const exitCode = result.status ?? 1;
  if (result.error && !stdout) {
    return { ok: false, exitCode, error: String(result.error.message || result.error), stderr };
  }
  return { ok: exitCode === 0 || json !== null, exitCode, stdout, stderr, json };
}

function withTempText(text, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "conversion-skill-"));
  const file = path.join(dir, "input.md");
  try {
    writeFileSync(file, text, "utf8");
    return run(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function storageArgs(config) {
  const configured = config && typeof config.storagePath === "string" ? config.storagePath.trim() : "";
  if (!configured) return [];
  return ["--store", configured];
}

function registerTools(ctx, config) {
  const tools = toolsService(ctx);
  if (!tools) {
    throw new Error("conversion-skill 需要 DSH 的 tools 服务。cordis.patch.yml 插入本包后，宿主会按 inject 注入。");
  }
  const disposers = [];
  const store = storageArgs(config);

  const add = (spec) => {
    disposers.push(tools.register(spec));
  };

  add({
    name: "pipeline",
    description:
      "Run conversion-skill's single-shot pipeline: route the input, pull a style slot from the JSON knowledge bases, and return the fast plain-language gist. Deterministic Bun tool, no model call.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Source text to route and explain. Ignored when file is set." },
        file: { type: "string", description: "Optional path to a source file." },
        game: { type: "string", description: "Game title for a habit-aligned slot, e.g. 王者荣耀." },
        meme: { type: "string", description: "Meme or daily phrase, e.g. 甩锅." },
        author: { type: "string", description: "Famous-author style name from the 19-author library, e.g. 古龙." },
        style: { type: "string", description: "Expression style: anime, detective, war-room, nature-documentary, verse, narrative, podcast, neutral." },
        habit: { type: "string", description: "auto, gaming, daily, or workplace." },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      const flags = ["--json", "--deterministic"];
      if (args.game) flags.push("--game", String(args.game));
      if (args.meme) flags.push("--meme", String(args.meme));
      if (args.author) flags.push("--author", String(args.author));
      if (args.style) flags.push("--style", String(args.style));
      if (args.habit) flags.push("--habit", String(args.habit));
      const file = args.file ? String(args.file) : "";
      const text = args.text ? String(args.text) : "";
      if (!file && !text.trim()) return { ok: false, error: "text 或 file 至少给一个" };
      const run = (inputPath) => runBunScript("pipeline.ts", [...flags, "-f", inputPath]);
      const result = file ? run(file) : withTempText(text, run);
      if (result.json) return { ok: result.exitCode !== 2, exitCode: result.exitCode, ...result.json };
      return result;
    },
  });

  add({
    name: "screen_keywords",
    description:
      "Screen a passage for its thesis keywords, classical-Chinese sense, and game/meme/author style card. Deterministic Bun tool, no model call.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Passage to screen. Ignored when file is set." },
        file: { type: "string", description: "Optional path to a text file." },
        habit: { type: "string", description: "auto, gaming, daily, or workplace." },
        game: { type: "string", description: "Game title." },
        meme: { type: "string", description: "Meme term." },
        author: { type: "string", description: "Author name." },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      const flags = ["--json", "--deterministic"];
      if (args.habit) flags.push("--habit", String(args.habit));
      if (args.game) flags.push("--game", String(args.game));
      if (args.meme) flags.push("--meme", String(args.meme));
      if (args.author) flags.push("--author", String(args.author));
      const file = args.file ? String(args.file) : "";
      const text = args.text ? String(args.text) : "";
      if (!file && !text.trim()) return { ok: false, error: "text 或 file 至少给一个" };
      const run = (inputPath) => runBunScript("screen-keywords.ts", [...flags, inputPath]);
      const result = file ? run(file) : withTempText(text, run);
      if (result.json) return { ok: result.exitCode !== 2, exitCode: result.exitCode, ...result.json };
      return result;
    },
  });

  add({
    name: "check_output",
    description:
      "Run the mechanical conversion gate on a Markdown draft. Default report is the existing long check. Pass scoreCard true for the one-page score card. Deterministic Bun tool, no model call.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Markdown draft. Ignored when path is set." },
        path: { type: "string", description: "Path to a Markdown draft." },
        style: { type: "string", description: "Expected expression style." },
        authorProfile: { type: "string", description: "Author gate profile, e.g. 古龙 or 鲁迅." },
        level: { type: "string", description: "default, expand, or long." },
        scoreCard: { type: "boolean", description: "Return the one-page score card instead of the long gate JSON." },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      return runCheck(args, Boolean(args.scoreCard));
    },
  });

  add({
    name: "score_card",
    description:
      "One-page score card for a conversion draft: overall score 0-100, grade, hits with line numbers, and a concrete fix for each hit. Does not replace the default check_output report.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Markdown draft. Ignored when path is set." },
        path: { type: "string", description: "Path to a Markdown draft." },
        style: { type: "string", description: "Expected expression style." },
        authorProfile: { type: "string", description: "Author gate profile." },
        level: { type: "string", description: "default, expand, or long." },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      return runCheck(args, true);
    },
  });

  add({
    name: "evaluate_pdf",
    description:
      "Prepare a two-column academic PDF for conversion: reading order, section anchors, and a draft fact ledger written outside the repo. Requires a local PDF path. Deterministic Bun tool, no model call.",
    parameters: {
      type: "object",
      properties: {
        pdfPath: { type: "string", description: "Path to the PDF." },
        workspace: { type: "string", description: "Empty directory outside the repo. A temp dir is created when omitted." },
        style: { type: "string", description: "Expression style. Default neutral." },
      },
      required: ["pdfPath"],
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      const pdfPath = String(args.pdfPath || "");
      if (!pdfPath) return { ok: false, error: "pdfPath 必填" };
      const ownWorkspace = !args.workspace;
      const workspace = ownWorkspace ? mkdtempSync(path.join(tmpdir(), "conversion-pdf-")) : String(args.workspace);
      const style = args.style ? String(args.style) : "neutral";
      const result = runBunScript("evaluate-pdf.ts", [pdfPath, "--workspace", workspace, "--style", style, "--deterministic"]);
      if (result.json) {
        return { ok: result.exitCode !== 2, exitCode: result.exitCode, workspace, ...result.json };
      }
      return { ...result, workspace };
    },
  });

  add({
    name: "voice_import",
    description:
      "Import the user's own writing samples and store a deterministic voice fingerprint (sentence length, punctuation, stance, wording). Use only when the user asks to write in their own voice. Does not replace the 19-author library.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Profile id, e.g. 我的." },
        samples: { type: "array", items: { type: "string" }, description: "One or more texts the user wrote." },
        files: { type: "array", items: { type: "string" }, description: "Optional sample file paths." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      const profileName = String(args.name || "").trim();
      if (!profileName) return { ok: false, error: "name 必填" };
      const flags = ["import", "--name", profileName, "--json", ...store];
      const samples = Array.isArray(args.samples) ? args.samples.map((item) => String(item)) : [];
      const files = Array.isArray(args.files) ? args.files.map((item) => String(item)) : [];
      for (const sample of samples) flags.push("--text", sample);
      for (const file of files) flags.push("--file", file);
      if (samples.length + files.length === 0) return { ok: false, error: "samples 或 files 至少给一个" };
      const result = runBunScript("voice-profile.ts", flags);
      if (result.json) return { ok: result.exitCode !== 2, exitCode: result.exitCode, ...result.json };
      return result;
    },
  });

  add({
    name: "voice_profile",
    description: "Read one stored voice profile, or list all profiles when name is omitted.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Profile id. Omit to list." },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      const profileName = args.name ? String(args.name) : "";
      const flags = profileName
        ? ["show", "--name", profileName, "--json", ...store]
        : ["list", "--json", ...store];
      const result = runBunScript("voice-profile.ts", flags);
      if (result.json) return { ok: result.exitCode !== 2, exitCode: result.exitCode, ...result.json };
      return result;
    },
  });

  add({
    name: "voice_score",
    description:
      "Score a draft against a stored voice profile. Returns 0-100 plus sub-scores for sentence length, rhythm, punctuation, stance, wording, and paragraph shape.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Profile id." },
        text: { type: "string", description: "Draft text. Ignored when file is set." },
        file: { type: "string", description: "Optional draft path." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      const profileName = String(args.name || "").trim();
      if (!profileName) return { ok: false, error: "name 必填" };
      const flags = ["score", "--name", profileName, "--json", ...store];
      if (args.file) flags.push("--file", String(args.file));
      else if (args.text) flags.push("--text", String(args.text));
      else return { ok: false, error: "text 或 file 至少给一个" };
      const result = runBunScript("voice-profile.ts", flags);
      if (result.json) return { ok: result.exitCode !== 2, exitCode: result.exitCode, ...result.json };
      return result;
    },
  });

  add({
    name: "voice_remove",
    description: "Delete a stored voice profile by id.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Profile id to delete." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => toolText(value) },
    async execute(args = {}) {
      const profileName = String(args.name || "").trim();
      if (!profileName) return { ok: false, error: "name 必填" };
      const result = runBunScript("voice-profile.ts", ["remove", "--name", profileName, "--json", ...store]);
      if (result.json) return { ok: result.exitCode !== 2, exitCode: result.exitCode, ...result.json };
      return result;
    },
  });

  return disposers;
}

function runCheck(args, scoreCard) {
  const flags = ["--json"];
  if (scoreCard) flags.push("--score-card");
  if (args.style) flags.push("--style", String(args.style));
  if (args.authorProfile) flags.push("--author-profile", String(args.authorProfile));
  if (args.level) flags.push("--level", String(args.level));
  const file = args.path ? String(args.path) : "";
  const text = args.text ? String(args.text) : "";
  if (!file && !text.trim()) return Promise.resolve({ ok: false, error: "text 或 path 至少给一个" });
  const run = (inputPath) => runBunScript("check-output.ts", [...flags, inputPath]);
  const result = file ? run(file) : withTempText(text, run);
  if (result.json) return Promise.resolve({ ok: result.exitCode !== 2, exitCode: result.exitCode, ...result.json });
  return Promise.resolve(result);
}

export function apply(ctx, config = {}) {
  const disposers = registerTools(ctx, config);
  const dispose = () => {
    for (const disposer of disposers) {
      try {
        if (typeof disposer === "function") disposer();
      } catch {
        /* host disposer is best-effort */
      }
    }
  };
  if (ctx && typeof ctx.effect === "function") ctx.effect(() => dispose);
  return dispose;
}
