#!/usr/bin/env bun
/** Generate the five-step Markdown skeleton for a selected expression style. */

import { isExpressionStyle, isOutputLevel, type ExpressionStyle, type OutputLevel, usageError } from "./shared";

const STYLE_DESCRIPTIONS: Record<ExpressionStyle, string> = {
  anime: "二次元叙事：用角色、场景和少量对白承载机制，不能把设定当解释。",
  detective: "侦探推理：用线索、证据与判断更新承载因果，不能伪造证据。",
  "war-room": "项目战情室：用角色分工、信息流和约束承载协作，不能把比喻写成结论。",
  "nature-documentary": "自然纪录片：用观察、环境变化和系统演化承载时空机制，不能拟人化到改变关系。",
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

export function renderTemplate(
  topic: string,
  style: ExpressionStyle,
  level: OutputLevel,
  withFormula: boolean,
  intensity = "standard",
): string {
  const formulaSection = withFormula
    ? `### 公式含义

- 每个符号在干什么：
- 整句大白话：

`
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

- 关键概念：
- 关系：
- 约束：

### 3. 意象映射

| 知识概念 | 故事元素 | 对应理由 |
| --- | --- | --- |
|  |  |  |

### 门禁自检

- 会皱眉的词：
- 外行复述：

</details>

## 正文

<!-- ${STYLE_DESCRIPTIONS[style]} ${LEVEL_DESCRIPTIONS[level]} -->

## 知识点校验

- 用 1-3 句严谨复述核心机制：
`;
}

function help(): void {
  process.stdout.write(`生成五步转换骨架（Bun/TypeScript）\n\n用法：\n  bun run generate-template -- -t \"快速排序\"\n  bun run generate-template -- -t \"时空预测\" -s nature-documentary -l expand\n\n选项：\n  -t, --topic <文本>\n  -s, --style <anime|detective|war-room|nature-documentary|neutral>\n  -l, --level <default|expand|long>\n      --with-formula\n\n兼容：旧的 --style light|standard|heavy 会映射为 anime，并保留表达强度。\n`);
}

function parseArgs(argv: string[]): { topic: string; style: ExpressionStyle; level: OutputLevel; withFormula: boolean; intensity: string } {
  let topic: string | undefined;
  let style: ExpressionStyle = "anime";
  let level: OutputLevel = "default";
  let withFormula = false;
  let intensity = "standard";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
    usageError(`未知选项：${arg}`);
  }
  if (!topic) usageError("请通过 -t 或 --topic 提供主题");
  return { topic, style, level, withFormula, intensity };
}

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  process.stdout.write(`${renderTemplate(args.topic, args.style, args.level, args.withFormula, args.intensity)}\n`);
}
