#!/usr/bin/env bun
/** Generate the five-step Markdown skeleton for a selected expression style. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { analyzeWithHanLP, analyzeWithHanLPSync, consumeHanlpArg, parseHanLPCliOptions, type HanLPDocumentAnalysis, type HanLPOptions } from "./hanlp-helper";
import { isExpressionStyle, isOutputLevel, type ExpressionStyle, type OutputLevel, usageError } from "./shared";

const STYLE_DESCRIPTIONS: Record<ExpressionStyle, string> = {
  anime: "二次元叙事：用角色、场景和少量对白承载机制，不能把设定当解释。",
  detective: "侦探推理：用线索、证据与判断更新承载因果，不能伪造证据。",
  "war-room": "项目战情室：用角色分工、信息流和约束承载协作，不能把比喻写成结论。",
  "nature-documentary": "自然纪录片：用观察、环境变化和系统演化承载时空机制，不能拟人化到改变关系。",
  verse: "诗篇：用短句和反复出现的规则承载步骤，不能用典故或韵脚漏掉机制。",
  narrative: "记叙文：按时间写下输入、动作、约束和结果，不能编造原文没有的转折。",
  podcast: "播客对谈：用一问一答推进步骤，不能用寒暄代替机制。",
  neutral: "中性说明：直接讲机制；当任何皮肤会破坏同构时自动回退到此模式。",
};

const LEVEL_DESCRIPTIONS: Record<OutputLevel, string> = {
  default: "默认：正文不超过 800 字。",
  expand: "展开：正文 800-2500 字。",
  long: "长篇：只在用户明确要求时使用。",
};

const LEGACY_STYLE_ALIASES: Record<string, { style: ExpressionStyle; intensity: string }> = {
  light: { style: "anime", intensity: "light" },
  standard: { style: "anime", intensity: "standard" },
  heavy: { style: "anime", intensity: "heavy" },
};

function prefillFromSource(sourceText: string, hanlpOptions?: HanLPOptions, analysis?: HanLPDocumentAnalysis): { facts: string; mappingRows: string } {
  const resolved = analysis ?? analyzeWithHanLPSync(sourceText, hanlpOptions?.enabled ? hanlpOptions : { ...hanlpOptions, enabled: false, mode: "local-fallback" });
  const factLines = resolved.srlFrames.slice(0, 4).map((frame) => {
    const trigger = frame.triggerOrCondition.join("、") || "（待填写触发条件）";
    const actor = frame.actorArg0.join("、") || "（待填写主体）";
    const target = frame.targetArg1.join("、") || "（待填写对象）";
    const constraint = frame.constraintsOrManner.join("、") || "（待填写约束）";
    return `- [条件] ${trigger} -> [主体] ${actor} -> [动作] ${frame.predicate} -> [对象] ${target} -> [限制] ${constraint}`;
  });
  const concepts = [...new Set([
    ...resolved.keyphrases.map((item) => item.phrase),
    ...resolved.entities.map((entity) => entity.text),
  ])].filter((term) => term.trim().length >= 2).slice(0, 6);
  return {
    facts: factLines.length > 0
      ? `- 原文事实：\n${factLines.join("\n")}`
      : "- 原文事实：",
    mappingRows: concepts.length > 0
      ? concepts.map((concept) => `| ${concept} |  |  |  |`).join("\n")
      : "|  |  |  |  |",
  };
}

export function renderTemplate(
  topic: string,
  style: ExpressionStyle,
  level: OutputLevel,
  withFormula: boolean,
  intensity = "standard",
  withComprehension = false,
  sourceText?: string,
  hanlpOptions?: HanLPOptions,
  analysis?: HanLPDocumentAnalysis,
): string {
  const prefill = sourceText?.trim() ? prefillFromSource(sourceText, hanlpOptions, analysis) : undefined;
  const formulaSection = withFormula
    ? `### 公式含义

- 每个符号在干什么：
- 整句大白话：

`
    : "";
  const comprehensionSection = withComprehension
    ? `

## 理解检验

- 复述问题（检查核心机制）：
- 迁移问题（换一个场景仍用同一机制）：

<!-- 可选。默认不要强制出题。用户说不要理解检验时删除本段。 -->`
    : "";

  return `# ${topic}

> 表达风格：\`${style}\`
> 表达强度：\`${intensity}\`
> 篇幅：\`${level}\`
> 风格约束：${STYLE_DESCRIPTIONS[style]}
> 篇幅约束：${LEVEL_DESCRIPTIONS[level]}

<details>
<summary>分析过程（点击展开）</summary>

${formulaSection}### 1. 理解

- 原文含义复述：
- 核心难点：
- 假设：

### 2. 提炼

${prefill?.facts ?? "- 原文事实："}
- 必要推导：
- 理解用类比（还不是事实）：
- 尚未确认：

### 3. 意象映射

| 知识概念 | 类比元素 | 对应机制 | 适用边界 |
| --- | --- | --- | --- |
${prefill?.mappingRows ?? "|  |  |  |  |"}

### 门禁自检

- 会皱眉的词：
- 外行复述：

</details>

## 正文

<!-- ${STYLE_DESCRIPTIONS[style]} ${LEVEL_DESCRIPTIONS[level]} -->

## 知识点校验

- 用 1-3 句严谨复述核心机制：
${comprehensionSection}`;
}

function help(): void {
  process.stdout.write(`生成五步转换骨架（Bun/TypeScript）\n\n用法：\n  bun run generate-template -- -t \"快速排序\"\n  bun run generate-template -- -t \"时空预测\" -s nature-documentary -l expand --with-comprehension\n\n选项：\n  -t, --topic <文本>\n  -s, --style <anime|detective|war-room|nature-documentary|verse|narrative|podcast|neutral>\n  -l, --level <default|expand|long>\n      --with-formula\n      --with-comprehension   追加可选理解检验占位，默认不输出\n      --source <文本或文件>  用 HanLP/本地分析预填事实骨架与知识概念列\n  -o, --output <路径>\n      --hanlp\n      --hanlp-mode <auto|restful|native|local-fallback>\n      --hanlp-url <url>\n      --hanlp-auth <key>\n      --hanlp-lang <zh|mul|en>\n      --custom-dict <path>\n\n兼容：旧的 --style light|standard|heavy 会映射为 anime，并保留表达强度。未提供 --source 时骨架与旧版一致。\n`);
}

function readSource(value: string): string {
  if (existsSync(value)) return readFileSync(value, "utf8");
  return value;
}

function parseArgs(argv: string[]): { topic: string; style: ExpressionStyle; level: OutputLevel; withFormula: boolean; intensity: string; withComprehension: boolean; sourceText?: string; outputPath?: string; hanlp: HanLPOptions } {
  const hanlp = parseHanLPCliOptions(argv);
  let topic: string | undefined;
  let style: ExpressionStyle = "anime";
  let level: OutputLevel = "default";
  let withFormula = false;
  let intensity = "standard";
  let withComprehension = false;
  let sourceText: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const hanlpEnd = consumeHanlpArg(argv, index);
    if (hanlpEnd !== null) {
      index = hanlpEnd;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help();
      process.exit(0);
    }
    if (arg === "-t" || arg === "--topic") {
      topic = argv[index + 1];
      if (!topic) usageError(`${arg} 需要主题文本`);
      index += 1;
      continue;
    }
    if (arg === "-s" || arg === "--style") {
      const value = argv[index + 1];
      if (!value) usageError(`${arg} 需要风格名称`);
      if (value in LEGACY_STYLE_ALIASES) {
        ({ style, intensity } = LEGACY_STYLE_ALIASES[value]);
      } else if (isExpressionStyle(value)) {
        style = value;
      } else {
        usageError(`未知表达风格：${value}`);
      }
      index += 1;
      continue;
    }
    if (arg === "-l" || arg === "--level") {
      const value = argv[index + 1];
      if (!value || !isOutputLevel(value)) usageError("--level 只能是 default、expand 或 long");
      level = value;
      index += 1;
      continue;
    }
    if (arg === "--with-formula") {
      withFormula = true;
      continue;
    }
    if (arg === "--with-comprehension") {
      withComprehension = true;
      continue;
    }
    if (arg === "--source") {
      const value = argv[index + 1];
      if (!value) usageError("--source 需要文本或文件路径");
      sourceText = value;
      index += 1;
      continue;
    }
    if (arg === "-o" || arg === "--output") {
      outputPath = argv[index + 1];
      if (!outputPath) usageError(`${arg} 需要路径`);
      index += 1;
      continue;
    }
    usageError(`未知选项：${arg}`);
  }
  if (!topic) usageError("请通过 -t 或 --topic 提供主题");
  return { topic, style, level, withFormula, intensity, withComprehension, sourceText, outputPath, hanlp };
}

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  const sourceText = args.sourceText ? readSource(args.sourceText) : undefined;
  const write = async (): Promise<void> => {
    const analysis = args.hanlp.enabled && sourceText ? await analyzeWithHanLP(sourceText, args.hanlp) : undefined;
    const markdown = renderTemplate(
      args.topic,
      args.style,
      args.level,
      args.withFormula,
      args.intensity,
      args.withComprehension,
      sourceText,
      args.hanlp,
      analysis,
    );
    if (args.outputPath) writeFileSync(args.outputPath, `${markdown}\n`);
    else process.stdout.write(`${markdown}\n`);
  };
  write().catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
