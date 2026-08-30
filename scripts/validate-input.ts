#!/usr/bin/env bun
/**
 * Input preflight for conversion-skill.
 *
 * Compatibility:
 *   bun run validate-input -- "贝叶斯定理 P(A|B)=..."
 *   echo "你好" | bun run validate-input -- -
 *   bun run validate-input -- --kind academic-paper -
 */

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
const CHITCHAT_MAX_LEN = 80;

export interface InputAnalysis {
  is_empty: boolean;
  is_chitchat: boolean;
  has_formula: boolean;
  has_mixed_content: boolean;
  is_too_large: boolean;
  wants_longform: boolean;
  is_academic_paper: boolean;
  content_kind: ContentKind;
  recommend_level: "简约" | "展开" | "长篇";
  recommend_action: "ask_for_input" | "explain_formula_first" | "navigate_paper" | "refuse_volume" | "refuse_length" | "proceed";
}

export function isAcademicPaper(text: string, kind: ContentKind = "auto"): boolean {
  if (kind === "academic-paper") return true;
  if (kind === "text" || !text) return false;
  const lowered = text.toLocaleLowerCase();
  const markerCount = PAPER_MARKERS.filter((marker) => lowered.includes(marker)).length;
  const hasExplicitPaperCue = /(?:学术)?论文|paper\s+title|doi\s*[:：]/iu.test(text);
  return markerCount >= 4 || (text.length >= 800 && markerCount >= 3) || (hasExplicitPaperCue && markerCount >= 2);
}

function hasKnowledgeSignal(text: string): boolean {
  const lowered = text.toLocaleLowerCase();
  if (KNOWLEDGE_HINTS.some((hint) => lowered.includes(hint))) return true;
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

export function analyzeInput(text: string, kind: ContentKind = "auto"): InputAnalysis {
  const is_empty = text.trim().length === 0;
  const is_academic_paper = isAcademicPaper(text, kind);
  const is_chitchat = isChitchat(text);
  const has_formula = hasFormula(text);
  const has_mixed_content = hasMixedContent(text);
  const is_too_large = text.length >= LARGE_INPUT_CHARS;
  const wants_longform = LONGFORM_HINTS.some((hint) => text.includes(hint));

  let recommend_action: InputAnalysis["recommend_action"] = "proceed";
  if (is_empty || is_chitchat) recommend_action = "ask_for_input";
  else if (is_academic_paper) recommend_action = "navigate_paper";
  else if (is_too_large) recommend_action = "refuse_volume";
  else if (wants_longform) recommend_action = "refuse_length";
  else if (has_formula) recommend_action = "explain_formula_first";

  const recommend_level: InputAnalysis["recommend_level"] = wants_longform
    ? "长篇"
    : EXPAND_HINTS.some((hint) => text.includes(hint))
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
    content_kind: kind,
    recommend_level,
    recommend_action,
  };
}

function help(): void {
  process.stdout.write(`输入校验（Bun/TypeScript）\n\n用法：\n  bun run validate-input -- \"贝叶斯定理 P(A|B)=...\"\n  echo \"你好\" | bun run validate-input -- -\n  bun run validate-input -- --kind academic-paper -\n\n选项：\n  --kind <auto|text|academic-paper>  指定内容类型（默认 auto）\n  --paper                            等同于 --kind academic-paper\n`);
}

async function main(argv: string[]): Promise<void> {
  let kind: ContentKind = "auto";
  let positional: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help();
      return;
    }
    if (arg === "--paper") {
      kind = "academic-paper";
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
  printJson(analyzeInput(text, kind));
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
