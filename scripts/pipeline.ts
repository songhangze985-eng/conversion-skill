#!/usr/bin/env bun
/**
 * Unified single-process conversion pipeline & standalone Web SKILL bundler (v3.0).
 *
 * Usage:
 *   bun run pipeline -- "两阶段提交协议中协调者宕机导致参与者阻塞"
 *   bun run pipeline -- "两阶段提交协议中协调者宕机" --game 王者荣耀 --json
 *   bun run pipeline -- "乃悟前狼假寐，盖以诱敌。" --json
 *   bun run pipeline -- "死锁的四个必要条件" --author 古龙 --verify draft.md --json
 *   bun run pipeline -- --bundle-web dist-web-skill.md
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeMarkdown, type OutputCheckResult } from "./check-output";
import { renderTemplate } from "./generate-template";
import {
  buildContextAwareFollowupPrompt,
  loadClassicalKnowledgeBase,
  loadGamingKnowledgeBase,
  loadLifeMemesKnowledgeBase,
  loadStoryAuthorsKnowledgeBase,
  queryAuthorStyleByName,
  queryGameTermsByTitle,
  queryLifeMemeByTerm,
  screenThesisKeywords,
  type AuthorStyleQueryResult,
  type GameSpecificQueryResult,
  type KeywordScreeningReport,
  type LifeMemeSpecificQueryResult,
  type StyleSpecCard,
  type UserHabitOption,
} from "./screen-keywords";
import {
  EXPRESSION_STYLES,
  isExpressionStyle,
  isOutputLevel,
  readStdIn,
  stableJson,
  type ExpressionStyle,
  type OutputLevel,
  usageError,
} from "./shared";
import { analyzeInput, type InputAnalysis } from "./validate-input";

export type DefaultRoutingMode =
  | "greeting_or_chitchat"
  | "neutral_direct_gist"
  | "paper_navigation_first"
  | "formula_symbol_grounding"
  | "habit_fast_value"
  | "author_or_story_narrative";

export interface UnifiedPipelineOptions {
  inputText: string;
  topic?: string;
  habit?: UserHabitOption;
  gameTitle?: string;
  memeTerm?: string;
  authorName?: string;
  style?: ExpressionStyle;
  level?: OutputLevel;
  withScaffold?: boolean;
  verifyMarkdown?: string;
  authorProfile?: string;
}

export interface UnifiedPipelineResult {
  version: "3.0.0";
  default_routing: {
    mode: DefaultRoutingMode;
    recommended_style: ExpressionStyle;
    rationale: string;
  };
  input_analysis: InputAnalysis;
  one_shot_fast_value: {
    pithy_gist: string;
    context_followup_prompt: string;
    omitted_steps_notice: string;
  };
  keyword_screening?: KeywordScreeningReport;
  active_style_spec_card?: StyleSpecCard;
  game_lookup?: GameSpecificQueryResult;
  meme_lookup?: LifeMemeSpecificQueryResult;
  author_lookup?: AuthorStyleQueryResult;
  template_scaffold?: string;
  verification?: OutputCheckResult;
  elapsed_ms: number;
}

export function resolveDefaultRouting(
  analysis: InputAnalysis,
  opts: Pick<UnifiedPipelineOptions, "gameTitle" | "memeTerm" | "authorName" | "style">,
): UnifiedPipelineResult["default_routing"] {
  if (analysis.is_empty || analysis.is_chitchat) {
    return {
      mode: "greeting_or_chitchat",
      recommended_style: "neutral",
      rationale: "空输入或寒暄问候：直接输出亲和问候语并引导发送语句、文言文或文献，不强行编造转换。",
    };
  }
  if (opts.authorName) {
    const authorRes = queryAuthorStyleByName(opts.authorName, "");
    const linked = isExpressionStyle(authorRes.linked_skill_style)
      ? authorRes.linked_skill_style
      : "narrative";
    return {
      mode: "author_or_story_narrative",
      recommended_style: opts.style ?? linked,
      rationale: `用户显式指定作家风格「${opts.authorName}」，启用深度叙事与仿真笔法对位。`,
    };
  }
  if (analysis.is_classical_chinese || analysis.is_repetitive_argument) {
    return {
      mode: "neutral_direct_gist",
      recommended_style: opts.style ?? "neutral",
      rationale: "文言文或重复车轱辘话议论文：最高优先级直击要害，采用 neutral 极简直述，禁止套二次元/长篇故事注水。",
    };
  }
  if (analysis.is_academic_paper) {
    return {
      mode: "paper_navigation_first",
      recommended_style: opts.style ?? "war-room",
      rationale: "长篇学术论文/文献：先抽取页码锚点导航与核心机制，再按需展开对应章节。",
    };
  }
  if (analysis.has_formula && !opts.gameTitle && !opts.memeTerm && !opts.style) {
    return {
      mode: "formula_symbol_grounding",
      recommended_style: "neutral",
      rationale: "含数学/理化公式：先拆解每个符号在干什么与整句大白话，避免故事设定遮蔽量纲关系。",
    };
  }
  if (opts.style && opts.style !== "neutral") {
    return {
      mode: "author_or_story_narrative",
      recommended_style: opts.style,
      rationale: `用户显式指定表达文体「${opts.style}」，启用五步法同构叙事。`,
    };
  }
  return {
    mode: "habit_fast_value",
    recommended_style: "neutral",
    rationale: "默认首轮秒懂直出：先给 1-2 句切中要害的大白话与日常/游戏习惯对位，再提供可选深挖分支，不把短概念拉扯成长篇故事。",
  };
}

export function runUnifiedPipeline(options: UnifiedPipelineOptions): UnifiedPipelineResult {
  const t0 = performance.now();
  const habit = options.habit ?? (options.gameTitle ? "gaming" : "auto");
  const input_analysis = analyzeInput(options.inputText, "auto", {
    habit,
    screenKeywords: false,
  });
  const default_routing = resolveDefaultRouting(input_analysis, options);

  const keyword_screening =
    !input_analysis.is_empty && !input_analysis.is_chitchat
      ? screenThesisKeywords(options.inputText, { habit })
      : undefined;

  const game_lookup = options.gameTitle
    ? queryGameTermsByTitle(options.gameTitle, options.inputText)
    : undefined;
  const meme_lookup = options.memeTerm
    ? queryLifeMemeByTerm(options.memeTerm, options.inputText)
    : undefined;
  const author_lookup = options.authorName
    ? queryAuthorStyleByName(options.authorName, options.inputText)
    : undefined;

  const active_style_spec_card =
    author_lookup?.style_spec_card ??
    game_lookup?.style_spec_card ??
    meme_lookup?.style_spec_card;

  const followupPrompt =
    game_lookup?.stage3_followup_prompt ??
    author_lookup?.stage3_followup_prompt ??
    meme_lookup?.stage3_followup_prompt ??
    buildContextAwareFollowupPrompt(options.inputText);

  const pithy_gist = input_analysis.is_empty || input_analysis.is_chitchat
    ? "你好啊，我可以帮你把你不懂的话尽量转换成你能听懂的，告诉你！可以发我语句或文件来处理哦！文言文、文献这些都可以尝试呀"
    : keyword_screening?.classical_translation?.pithy_vernacular ??
      keyword_screening?.pithy_vernacular_summary ??
      options.inputText.slice(0, 120);

  const effectiveStyle = options.style ?? default_routing.recommended_style;
  const effectiveLevel = options.level ?? "default";
  const template_scaffold =
    options.withScaffold && !input_analysis.is_empty && !input_analysis.is_chitchat
      ? renderTemplate(
          options.topic ?? "核心机制通俗转译",
          effectiveStyle,
          effectiveLevel,
          input_analysis.has_formula,
          "standard",
          false,
          options.inputText,
          undefined,
          undefined,
          undefined,
          habit,
        )
      : undefined;

  const verification = options.verifyMarkdown
    ? analyzeMarkdown(options.verifyMarkdown, {
        level: effectiveLevel,
        expectedStyle: options.style,
        authorProfile: options.authorProfile ?? options.authorName,
        strictHumanVoice: true,
        enforceBaselineFloor: true,
        textJudgment: true,
      })
    : undefined;

  return {
    version: "3.0.0",
    default_routing,
    input_analysis,
    one_shot_fast_value: {
      pithy_gist,
      context_followup_prompt: followupPrompt,
      omitted_steps_notice: "（注：中间的术语拆解与映射推导过程已省略，要不要把过程拉出来给你看？）",
    },
    ...(keyword_screening ? { keyword_screening } : {}),
    ...(active_style_spec_card ? { active_style_spec_card } : {}),
    ...(game_lookup ? { game_lookup } : {}),
    ...(meme_lookup ? { meme_lookup } : {}),
    ...(author_lookup ? { author_lookup } : {}),
    ...(template_scaffold ? { template_scaffold } : {}),
    ...(verification ? { verification } : {}),
    elapsed_ms: Math.max(1, Math.round(performance.now() - t0)),
  };
}

/**
 * Compiles a 100% self-contained, zero-dead-link Markdown prompt edition of conversion-skill
 * for Web Chat UIs (ChatGPT / Claude Web / Gemini Web) without local filesystem or Bun CLI access.
 */
export function bundleStandaloneWebSkill(skillRoot = resolve(import.meta.dir, "..")): string {
  const skillMdPath = join(skillRoot, "SKILL.md");
  const rawSkill = readFileSync(skillMdPath, "utf8");

  const gamingKb = loadGamingKnowledgeBase();
  const memesKb = loadLifeMemesKnowledgeBase();
  const classicalKb = loadClassicalKnowledgeBase();
  const authorsKb = loadStoryAuthorsKnowledgeBase();

  // Strip local relative markdown links `[label](references/...)`, `[label](scripts/...)`, `[label](assets/...)` -> `label`
  const cleanedSkillBody = rawSkill
    .replace(/\[([^\]]+)\]\((?:references|scripts|assets)\/[^)]+\)/gu, "$1")
    .replace(/`(?:references|scripts|assets)\/[^`\n]+`/gu, (m) => `内置知识卡片（原 ${m.slice(1, -1)}）`)
    .split(/\r?\n/u)
    .filter((line) => !/bun\s+run\s+/u.test(line))
    .join("\n")
    .trim();

  const gameLines = (gamingKb.popular_games ?? [])
    .map(
      (g) =>
        `- **${g.game_name}**（别名：${g.aliases.slice(0, 3).join("/")}）：核心机制词【${g.signature_terms.slice(0, 5).map((t) => t.term).join("、")}】`,
    )
    .join("\n");

  const authorLines = authorsKb.authors
    .map(
      (a) =>
        `- **${a.author_name_zh}**（${a.tradition}，关联风格 \`${a.linked_skill_style}\`）：节奏【${a.sentence_rhythm_and_diction}】；标志指纹【${a.signature_voice_traits.slice(0, 2).join("；")}】`,
    )
    .join("\n");

  const polysemyLines = (classicalKb.polysemy_disambiguation ?? [])
    .map(
      (p) =>
        `- **「${p.char}」**：${p.senses.map((s) => `${s.sense_label}（${s.note}）`).join("；")}`,
    )
    .join("\n");

  const memeLines = memesKb.entries
    .slice(0, 12)
    .map((m) => `- **${m.term}**：${m.pragmatic_meaning}`)
    .join("\n");

  return [
    cleanedSkillBody,
    "",
    "---",
    "",
    "## 内置离线速查卡片（Web 纯提示词独立版自动内联，零外部文件依赖）",
    "",
    "### 1. 热门游戏核心机制词速查（12 款）",
    gameLines,
    "",
    "### 2. 高频网络热梗与日常机制速查",
    memeLines,
    "",
    "### 3. 文言文一词多义语境消歧速查（信达雅红线）",
    polysemyLines,
    "",
    "### 4. 世界知名作家仿真笔法指纹速查（19 位）",
    authorLines,
    "",
    "### 5. Web 端自检清单（替代本地 CLI 门禁）",
    "1. 映射同构核对：每个核心概念都必须写清「触发条件 -> 动作 -> 限制 -> 结果」，严禁静态贴牌（「节点就是宾客」或「哈希先生」）。",
    "2. 反 AI 腔核对：正文严禁连续「先xx / 别x」两三字祈使短句，严禁连续「不是A，而是B」排比，严禁非人名「·」号与表情包堆砌。",
    "3. 边界诚实核对：文言文与车轱辘话直出大白话要害；跨领域类比必须点明一处比喻失效边界。",
    "",
  ].join("\n");
}

function help(): void {
  process.stdout.write(`conversion-skill 统一单次管线与 Web 独立打包器 (v3.0)

用法：
  bun run pipeline -- "待转译的专业语句、文言文或论文段落" [选项]
  bun run pipeline -- - --game 王者荣耀 --json < input.txt
  bun run pipeline -- --bundle-web <输出路径.md | ->

选项：
  -f, --file <路径>          从文件读取输入源文本
  --topic <标题>             指定生成骨架时的主题标题
  --habit <auto|gaming|daily|workplace> 指定习惯域（默认 auto）
  --game <游戏名>            一步联动查询游戏词库并生成结构化槽位卡
  --meme <热梗或口头禅>      一步联动查询网络热梗/生活用语库并生成槽位卡
  --author <作家名>          一步联动查询知名作家仿真指纹并生成槽位卡
  --style <风格名>           指定输出文体 (${EXPRESSION_STYLES.join("|")})
  --level <default|expand|long> 指定篇幅档位（默认 default）
  --scaffold                 同时输出预填好的五步法 Markdown 模板骨架
  --verify <文稿路径.md>     同时对已完成文稿执行机械+人味+作家档位一体化门禁校验
  --author-profile <档位>    指定校验时的作家豁免档位（如 古龙 / 鲁迅）
  --bundle-web <路径|->      导出零死链、内联四大知识库精华的纯 Web 独立版 SKILL.md
  --json                     输出完整 JSON 结构
  --deterministic            固定 JSON 键序并忽略耗时波动
  -h, --help                 查看帮助
`);
}

async function main(argv: string[]): Promise<void> {
  let inputArg: string | undefined;
  let filePath: string | undefined;
  let topic: string | undefined;
  let habit: UserHabitOption = "auto";
  let gameTitle: string | undefined;
  let memeTerm: string | undefined;
  let authorName: string | undefined;
  let style: ExpressionStyle | undefined;
  let level: OutputLevel = "default";
  let withScaffold = false;
  let verifyPath: string | undefined;
  let authorProfile: string | undefined;
  let bundleWebOut: string | undefined;
  let json = false;
  let deterministic = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      help();
      process.exit(0);
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--deterministic") {
      deterministic = true;
      continue;
    }
    if (arg === "--scaffold") {
      withScaffold = true;
      continue;
    }
    if (arg === "-f" || arg === "--file") {
      filePath = argv[++i];
      if (!filePath) usageError(`${arg} 需要文件路径`);
      continue;
    }
    if (arg === "--topic") {
      topic = argv[++i];
      if (!topic) usageError("--topic 需要标题文本");
      continue;
    }
    if (arg === "--habit") {
      const val = argv[++i] as UserHabitOption | undefined;
      if (!val || !["auto", "gaming", "daily", "workplace"].includes(val)) {
        usageError("--habit 只能是 auto、gaming、daily 或 workplace");
      }
      habit = val;
      continue;
    }
    if (arg === "--game") {
      gameTitle = argv[++i];
      if (!gameTitle) usageError("--game 需要具体游戏名");
      continue;
    }
    if (arg === "--meme") {
      memeTerm = argv[++i];
      if (!memeTerm) usageError("--meme 需要具体热梗或日常词");
      continue;
    }
    if (arg === "--author") {
      authorName = argv[++i];
      if (!authorName) usageError("--author 需要作家姓名");
      continue;
    }
    if (arg === "--style") {
      const val = argv[++i];
      if (!val || !isExpressionStyle(val)) usageError(`--style 只能是 ${EXPRESSION_STYLES.join("、")}`);
      style = val;
      continue;
    }
    if (arg === "--level") {
      const val = argv[++i];
      if (!val || !isOutputLevel(val)) usageError("--level 只能是 default、expand 或 long");
      level = val;
      continue;
    }
    if (arg === "--verify") {
      verifyPath = argv[++i];
      if (!verifyPath) usageError("--verify 需要待校验 Markdown 文件路径");
      continue;
    }
    if (arg === "--author-profile") {
      authorProfile = argv[++i];
      if (!authorProfile) usageError("--author-profile 需要作家名或档位");
      continue;
    }
    if (arg === "--bundle-web") {
      bundleWebOut = argv[++i];
      if (!bundleWebOut) usageError("--bundle-web 需要输出文件路径或 -");
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") usageError(`未知选项：${arg}`);
    if (inputArg) usageError("只接受一个输入源文本参数");
    inputArg = arg;
  }

  if (bundleWebOut) {
    const bundled = bundleStandaloneWebSkill();
    if (bundleWebOut === "-") {
      process.stdout.write(bundled);
    } else {
      writeFileSync(resolve(bundleWebOut), bundled, "utf8");
      process.stdout.write(`已导出零死链纯 Web 独立版 SKILL：${resolve(bundleWebOut)} (${Buffer.byteLength(bundled, "utf8")} bytes)\n`);
    }
    process.exit(0);
  }

  let inputText = "";
  if (filePath) {
    const full = resolve(filePath);
    if (!existsSync(full)) usageError(`输入文件不存在：${full}`);
    inputText = readFileSync(full, "utf8");
  } else if (inputArg === "-") {
    inputText = await readStdIn();
  } else if (inputArg !== undefined) {
    inputText = inputArg;
  } else {
    usageError("请提供待转译文本、-f <文件>、-（标准输入）或 --bundle-web <输出路径>");
  }

  const verifyMarkdown = verifyPath ? readFileSync(resolve(verifyPath), "utf8") : undefined;
  const result = runUnifiedPipeline({
    inputText,
    topic,
    habit,
    gameTitle,
    memeTerm,
    authorName,
    style,
    level,
    withScaffold,
    verifyMarkdown,
    authorProfile,
  });

  if (deterministic) {
    result.elapsed_ms = 0;
  }

  if (json) {
    process.stdout.write(deterministic ? stableJson(result) : `${JSON.stringify(result, null, 2)}\n`);
  } else {
    const lines = [
      `=== conversion-skill v${result.version} 一体化管线 ===`,
      `默认路由: ${result.default_routing.mode} (推荐风格: ${result.default_routing.recommended_style})`,
      `路由理由: ${result.default_routing.rationale}`,
      `首轮秒懂直出: ${result.one_shot_fast_value.pithy_gist}`,
      `省略提示: ${result.one_shot_fast_value.omitted_steps_notice}`,
      `追问引导: ${result.one_shot_fast_value.context_followup_prompt}`,
    ];
    if (result.active_style_spec_card) {
      const card = result.active_style_spec_card;
      lines.push(
        `风格规格卡: [${card.mode}:${card.requested_entity}] 匹配=${card.matched_in_kb ? "命中知识库" : "动态同构回退"} | 待映射槽位=${card.target_concept_slots.join("、") || "自动提取"}`,
      );
      if (card.unmatched_guidance) lines.push(`未入库指引: ${card.unmatched_guidance}`);
    }
    if (result.verification) {
      lines.push(`文稿门禁结论: ${result.verification.verdict} (词数=${result.verification.word_count})`);
    }
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  process.exit(result.verification && result.verification.verdict === "FAIL" ? 1 : 0);
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
