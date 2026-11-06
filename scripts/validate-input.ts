#!/usr/bin/env bun
/**
 * Input preflight for conversion-skill.
 *
 * Compatibility:
 *   bun run validate-input -- "贝叶斯定理 P(A|B)=..."
 *   echo "你好" | bun run validate-input -- -
 *   bun run validate-input -- --kind academic-paper -
 */

import { analyzeWithHanLP, analyzeWithHanLPSync, consumeHanlpArg, evaluateTextRecognitionJudgment, parseHanLPCliOptions, type HanLPDocumentAnalysis, type HanLPOptions, type TextRecognitionJudgment } from "./hanlp-helper";
import { detectDiscourseMode, detectUserHabit, isClassicalChineseText, screenThesisKeywords, type KeywordScreeningReport, type NarrativeBoundaryMode, type UserHabit, type UserHabitOption } from "./screen-keywords";
import { printJson, readStdIn, usageError } from "./shared";

type ContentKind = "auto" | "text" | "academic-paper";

const CHITCHAT_KEYWORDS = [
  "你好", "您好", "早上好", "下午好", "晚上好", "嗨", "哈喽", "hello", "hi",
  "谢谢", "感谢", "多谢", "辛苦了", "thanks", "thank",
  "今天", "明天", "昨天", "周末",
  "哈哈", "嘿嘿", "呵呵", "嘻嘻", "啊啊", "呜呜",
  "再见", "拜拜", "bye", "在吗", "在不在", "忙吗", "吃了吗", "早安", "晚安",
  "how are you", "how's it going", "what's up", "good morning", "good afternoon",
  "good evening", "see you", "have a nice", "let us", "let's", "grab a coffee",
  "nice day", "how about",
];

const WEATHER_SMALLTALK = [
  /^(?:今(?:天)?|这(?:天)?|外面)?天气(?:真|很|太)?(?:好|不错|冷|热|糟|晴|如何|怎么样)[！!。？?]?$/u,
  /^今(?:天)?天气(?:不错|真好|真热|真冷)[！!。]?$/u,
];

const KNOWLEDGE_HINTS = [
  "定理", "定律", "原理", "公式", "定义", "概念", "算法", "函数", "方程",
  "矩阵", "向量", "微积分", "概率", "统计", "回归", "分布", "假设",
  "模型", "架构", "协议", "机制", "流程", "结构", "参数", "变量",
  "区块链", "神经网络", "编译", "递归", "复杂度", "天气预报", "时空",
  "论文", "摘要", "方法", "结论", "预测", "transformer", "regularization",
  "algorithm", "architecture", "protocol", "forecast", "neural", "model", "method",
];

const PAPER_MARKERS = [
  "摘要", "关键词", "引言", "方法", "实验", "结果", "结论", "参考文献",
  "abstract", "keywords", "introduction", "method", "methodology", "experiment",
  "results", "conclusion", "references",
];

const LATEX_PATTERNS = [
  /\$\$[\s\S]+?\$\$/u,
  /(?<!\\)\$(?!\s*\d+(?:\.\d+)?\s*\$)[^$\n]+?\$/u,
  /\\(?:d?frac|tfrac|sum|int|prod|lim|sqrt|alpha|beta|theta|lambda|partial|nabla|infty|le|ge|ne|approx|equiv|cdot|times|div|pm)\b/u,
  /\\(?:begin|end)\{/u,
  /(?:[A-Z][a-z]?\d*\s*(?:\+\s*)?){2,}\s*(?:→|⟶|->)\s*(?:[A-Z][a-z]?\d*\s*(?:\+\s*)?)+/u,
  /(?<=[A-Za-z)])\s*=\s*(?=[A-Za-z])/u,
];

const LARGE_INPUT_CHARS = 6000;
const LONGFORM_HINTS = ["10000", "一万", "万字", "大量文本", "专业层", "长篇连载", "写水文"];
const EXPAND_HINTS = ["详细一点", "再展开", "写成篇", "展开讲"];
const BEGINNER_HINTS = [
  "小白", "零基础", "理解能力差", "理解力差", "脑子笨", "完全看不懂", "看天书",
  "说人话", "大白话", "用最简单的话", "用最笨的话", "再简单点", "给小学生", "外行",
];
const CHITCHAT_MAX_LEN = 80;

export interface InputAnalysis {
  is_empty: boolean;
  is_chitchat: boolean;
  has_formula: boolean;
  has_mixed_content: boolean;
  is_too_large: boolean;
  wants_longform: boolean;
  is_academic_paper: boolean;
  is_unreadable?: boolean;
  wants_beginner_mode?: boolean;
  is_classical_chinese?: boolean;
  is_repetitive_argument?: boolean;
  detected_user_habit?: UserHabit;
  narrative_mode?: NarrativeBoundaryMode;
  content_kind: ContentKind;
  recommend_level: "简约" | "展开" | "长篇";
  recommend_action: "ask_for_input" | "explain_formula_first" | "navigate_paper" | "refuse_volume" | "refuse_length" | "refuse_unreadable" | "proceed";
  hanlp_enrichment?: {
    backend: string;
    sentence_count: number;
    keyphrases: Array<{ phrase: string; score: number }>;
    entities: Array<{ text: string; type: string }>;
    srl_mechanisms: Array<{
      trigger: string[];
      actor: string[];
      predicate: string;
      target: string[];
      constraint: string[];
    }>;
    avg_dep_depth: number;
  };
  text_recognition_judgment?: TextRecognitionJudgment;
  keyword_screening?: KeywordScreeningReport;
}

export function isUnreadableSource(text: string): boolean {
  if (!text) return false;
  return /文本层损坏|关键页也?看不清|扫描件模糊|乱码严重|图文矛盾|缺页无法|corrupted\s+pdf|unreadable\s+text\s+layer/iu.test(text);
}

export function isAcademicPaper(text: string, kind: ContentKind = "auto"): boolean {
  if (kind === "academic-paper") return true;
  if (kind === "text" || !text) return false;
  const lowered = text.toLocaleLowerCase();
  const markerCount = PAPER_MARKERS.filter((marker) => lowered.includes(marker)).length;
  const hasExplicitPaperCue = /(?:学术)?(?:论文|pdf)|paper\s+title|doi\s*[:：]/iu.test(text);
  const zhStructureHits = [
    /(?:^|\n)\s*摘\s*要\s*(?:[:：]|\n)/u,
    /(?:^|\n)\s*关键词\s*[:：]/u,
    /(?:^|\n)\s*(?:引言|绪论)/u,
    /(?:^|\n)\s*(?:研究方法|实验与分析|模型架构)/u,
    /(?:^|\n)\s*参考文献\s*(?:\n|$)/u,
    /基金项目|国家自然科学基金|通讯作者/u,
  ].filter((pattern) => pattern.test(text)).length;
  return markerCount >= 4 || (text.length >= 800 && markerCount >= 3) || (hasExplicitPaperCue && (markerCount >= 2 || /核心贡献|页码/u.test(text))) || zhStructureHits >= 2;
}

function hasKnowledgeSignal(text: string): boolean {
  const lowered = text.toLocaleLowerCase();
  if (KNOWLEDGE_HINTS.some((hint) => lowered.includes(hint))) return true;
  if (isClassicalChineseText(text)) return true;
  if (/\b(?:please\s+)?(?:explain|describe|define|what\s+is|how\s+does|why\s+does)\s+\S+/iu.test(lowered)) {
    return !/\bhow\s+are\s+you\b|\bwhat(?:'s|\s+is)\s+up\b/iu.test(lowered);
  }
  return false;
}

export function isChitchat(text: string): boolean {
  const stripped = text.trim();
  if (!stripped || stripped.length > CHITCHAT_MAX_LEN || hasKnowledgeSignal(stripped)) return false;
  const lowered = stripped.toLocaleLowerCase();
  const keywordHit = CHITCHAT_KEYWORDS.some((keyword) => {
    if (/[a-z]/iu.test(keyword)) {
      return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "iu").test(lowered);
    }
    return lowered.includes(keyword);
  });
  return keywordHit || WEATHER_SMALLTALK.some((pattern) => pattern.test(stripped));
}

export function hasFormula(text: string): boolean {
  return Boolean(text) && LATEX_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasMixedContent(text: string): boolean {
  if (!text) return false;
  const lines = text.split(/\r?\n/u);
  const hasTable = text.includes("|") && lines.filter((line) => line.trim()).length >= 2;
  const hasList = lines.filter((line) => /^\s*[-*]\s+/u.test(line)).length >= 2;
  const hasFormulaMarker = text.includes("$") || hasFormula(text);
  return [hasTable, hasList, hasFormulaMarker].filter(Boolean).length >= 2;
}

function hanlpEnrichment(analysis: HanLPDocumentAnalysis): NonNullable<InputAnalysis["hanlp_enrichment"]> {
  return {
    backend: analysis.backendUsed,
    sentence_count: analysis.sentences.length,
    keyphrases: analysis.keyphrases,
    entities: analysis.entities.map((entity) => ({ text: entity.text, type: entity.type })),
    srl_mechanisms: analysis.srlFrames.map((frame) => ({
      trigger: frame.triggerOrCondition,
      actor: frame.actorArg0,
      predicate: frame.predicate,
      target: frame.targetArg1,
      constraint: frame.constraintsOrManner,
    })),
    avg_dep_depth: analysis.depDiagnostics.avgTreeDepth,
  };
}

export function isBeginnerRequest(text: string): boolean {
  if (!text) return false;
  return BEGINNER_HINTS.some((hint) => text.includes(hint));
}

export function analyzeInput(
  text: string,
  kind: ContentKind = "auto",
  hanlp?: {
    options?: HanLPOptions;
    analysis?: HanLPDocumentAnalysis;
    textJudgment?: boolean;
    screenKeywords?: boolean;
    habit?: UserHabitOption;
  },
): InputAnalysis {
  const is_empty = text.trim().length === 0;
  const is_unreadable = isUnreadableSource(text);
  const is_academic_paper = isAcademicPaper(text, kind);
  const is_chitchat = isChitchat(text);
  const has_formula = hasFormula(text);
  const has_mixed_content = hasMixedContent(text);
  const is_too_large = text.length >= LARGE_INPUT_CHARS;
  const wants_longform = LONGFORM_HINTS.some((hint) => text.includes(hint));
  const wants_beginner_mode = isBeginnerRequest(text);

  const discourse = !is_empty && !is_chitchat ? detectDiscourseMode(text) : undefined;
  const is_classical_chinese = discourse?.mode === "classical_chinese";
  const is_repetitive_argument = discourse?.mode === "repetitive_argument";
  const detected_user_habit = !is_empty && !is_chitchat ? detectUserHabit(text, hanlp?.habit ?? "auto") : undefined;
  const narrative_mode: NarrativeBoundaryMode | undefined = !is_empty && !is_chitchat
    ? (is_classical_chinese || is_repetitive_argument ? "direct_pithy_gist" : "daily_habit_analogy")
    : undefined;

  let recommend_action: InputAnalysis["recommend_action"] = "proceed";
  if (is_empty || is_chitchat) recommend_action = "ask_for_input";
  else if (is_unreadable) recommend_action = "refuse_unreadable";
  else if (is_academic_paper) recommend_action = "navigate_paper";
  else if (is_too_large) recommend_action = "refuse_volume";
  else if (wants_longform) recommend_action = "refuse_length";
  else if (has_formula) recommend_action = "explain_formula_first";

  const analysis = !is_empty && hanlp?.options?.enabled
    ? hanlp.analysis ?? analyzeWithHanLPSync(text, hanlp.options)
    : undefined;
  const enrichment = analysis ? hanlpEnrichment(analysis) : undefined;
  const text_recognition_judgment = !is_empty && (hanlp?.options?.enabled || hanlp?.textJudgment)
    ? evaluateTextRecognitionJudgment(text)
    : undefined;
  const keyword_screening = !is_empty && !is_chitchat && (hanlp?.screenKeywords || is_classical_chinese || is_repetitive_argument)
    ? screenThesisKeywords(text, { habit: hanlp?.habit ?? "auto" })
    : undefined;

  const recommend_level: InputAnalysis["recommend_level"] = wants_longform
    ? "长篇"
    : EXPAND_HINTS.some((hint) => text.includes(hint)) || (enrichment !== undefined && (enrichment.avg_dep_depth >= 5 || enrichment.entities.length >= 6))
      ? "展开"
      : "简约";

  return {
    is_empty,
    is_chitchat,
    has_formula,
    has_mixed_content,
    is_too_large,
    wants_longform,
    is_academic_paper,
    ...(is_unreadable ? { is_unreadable } : {}),
    ...(wants_beginner_mode ? { wants_beginner_mode } : {}),
    ...(is_classical_chinese ? { is_classical_chinese } : {}),
    ...(is_repetitive_argument ? { is_repetitive_argument } : {}),
    ...(detected_user_habit ? { detected_user_habit } : {}),
    ...(narrative_mode ? { narrative_mode } : {}),
    content_kind: kind,
    recommend_level,
    recommend_action,
    ...(enrichment ? { hanlp_enrichment: enrichment } : {}),
    ...(text_recognition_judgment ? { text_recognition_judgment } : {}),
    ...(keyword_screening ? { keyword_screening } : {}),
  };
}

function help(): void {
  process.stdout.write(`输入校验（Bun/TypeScript）\n\n用法：\n  bun run validate-input -- \"贝叶斯定理 P(A|B)=...\"\n  echo \"你好\" | bun run validate-input -- -\n  bun run validate-input -- --kind academic-paper -\n\n选项：\n  --kind <auto|text|academic-paper>  指定内容类型（默认 auto）\n  --paper                            等同于 --kind academic-paper\n  --hanlp                            附加本地或 HanLP 术语、语义角色、句法深度与文本识别评判\n  --text-judgment                    附加文本识别评判（readme表达审查 + 词句关键破解 + 语法识别）\n  --screen-keywords                  附加切中观点的关键词筛选、文言文翻译破译与日常/游戏话术映射\n  --habit <auto|gaming|daily|workplace> 指定用户习惯类比域（默认 auto）\n  --hanlp-mode <auto|restful|native|local-fallback>\n  --hanlp-url <url>\n  --hanlp-auth <key>\n  --hanlp-lang <zh|mul|en>\n  --custom-dict <path>\n  --no-hanlp                         关闭环境变量 HANLP_ENABLED\n`);
}

async function main(argv: string[]): Promise<void> {
  const hanlpOptions = parseHanLPCliOptions(argv);
  let kind: ContentKind = "auto";
  let textJudgment = false;
  let screenKeywords = false;
  let habit: UserHabitOption = "auto";
  let positional: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const hanlpEnd = consumeHanlpArg(argv, index);
    if (hanlpEnd !== null) {
      index = hanlpEnd;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help();
      return;
    }
    if (arg === "--paper") {
      kind = "academic-paper";
      continue;
    }
    if (arg === "--text-judgment") {
      textJudgment = true;
      continue;
    }
    if (arg === "--screen-keywords") {
      screenKeywords = true;
      continue;
    }
    if (arg === "--habit") {
      const value = argv[index + 1] as UserHabitOption | undefined;
      if (!value || !["auto", "gaming", "daily", "workplace"].includes(value)) {
        usageError("--habit 只能是 auto、gaming、daily 或 workplace");
      }
      habit = value;
      index += 1;
      continue;
    }
    if (arg === "--kind") {
      const value = argv[index + 1];
      if (value !== "auto" && value !== "text" && value !== "academic-paper") {
        usageError("--kind 只能是 auto、text 或 academic-paper");
      }
      kind = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-" ) && arg !== "-") usageError(`未知选项：${arg}`);
    if (positional !== undefined) usageError("只接受一段待校验文本");
    positional = arg;
  }
  const text = positional === undefined || positional === "-" ? await readStdIn() : positional;
  const analysis = hanlpOptions.enabled ? await analyzeWithHanLP(text, hanlpOptions) : undefined;
  printJson(analyzeInput(text, kind, { options: hanlpOptions, analysis, textJudgment, screenKeywords, habit }));
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
