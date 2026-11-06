import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * HanLP Auxiliary Engine for `conversion-skill`
 *
 * Bridges `hankcs/HanLP` (RESTful API + Native Python API + Offline Fallback)
 * into `conversion-skill`'s 5-step knowledge conversion workflow:
 *  1. Fine/Coarse Tokenization (`tok/fine`, `tok/coarse`) & Custom Dictionary rules (`dict_force`, `dict_combine`)
 *  2. Part-of-Speech Tagging (`pos/ctb`, `pos/pku`) & Named Entity Recognition (`ner/msra`, `ner/ontonotes`)
 *  3. Semantic Role Labeling (`srl`) -> Extracts `ARG0` (Actor), `PRED` (Core Action), `ARG1` (Target),
 *     `ARGM-CND` / `ARGM-TMP` (Trigger Condition / Constraint) for Step 2 Fact Skeletons
 *  4. Dependency Parsing (`dep`) -> Computes syntactic tree depth & clause complexity for Step 5 Lao-Yu Gate
 *  5. Semantic Textual Similarity (`sts`) & Keyphrase Extraction -> Enhances Step 0 Paper Navigation & Step 5 Fact Verification
 */

export type HanLPBackendMode = "auto" | "restful" | "native" | "local-fallback";
export type HanLPLanguage = "zh" | "mul" | "en";

export interface HanLPOptions {
  enabled?: boolean;
  mode?: HanLPBackendMode;
  apiUrl?: string;
  auth?: string | null;
  language?: HanLPLanguage;
  customDictPath?: string;
  timeoutMs?: number;
}

export interface HanLPEntity {
  text: string;
  type: string;
  sentenceIndex: number;
  start: number;
  end: number;
}

export interface HanLPSrlFrame {
  sentence: string;
  triggerOrCondition: string[];
  actorArg0: string[];
  predicate: string;
  targetArg1: string[];
  constraintsOrManner: string[];
}

export interface HanLPDepDiagnostics {
  sentenceCount: number;
  maxTreeDepth: number;
  avgTreeDepth: number;
  maxSentenceTokens: number;
  complexSentences: Array<{
    sentence: string;
    tokenCount: number;
    treeDepth: number;
  }>;
}

export type AiProducedLabel = "ai生产" | "正常";

export interface ReadmeExpressionReview {
  is_ai_produced: boolean;
  label: AiProducedLabel;
  emoji_count: number;
  emojis_found: string[];
  emoji_overuse: boolean;
  severe_fragmentation: boolean;
  fragmentation_ratio: number;
  standardized_patterns_found: string[];
  colon_bold_bullet_count: number;
  over_standardized: boolean;
  reasons: string[];
}

export interface MicroSentenceMatch {
  text: string;
  char_length: 2 | 3;
  pattern_type: "xian_bie_imperative" | "standalone_short_sentence";
  context: string;
}

export interface MicroSentenceCrackerResult {
  is_ai_produced: boolean;
  label: AiProducedLabel;
  matched_count: number;
  matched_sentences: MicroSentenceMatch[];
  rhetorical_qna_shells: string[];
  negative_parallelism_matches: string[];
  hollow_epigrams: string[];
  reasons: string[];
}

export type GrammarIssueKind =
  | "svo_order_error"
  | "anglicized_inversion"
  | "anglicized_de_stacking"
  | "anglicized_passive"
  | "inanimate_plural_men";

export interface GrammarIssueItem {
  sentence: string;
  markdown_emphasized: string;
  kind: GrammarIssueKind;
  pattern_name: string;
  reason: string;
  suggestion: string;
}

export interface GrammarInspectionResult {
  has_issues: boolean;
  issue_count: number;
  issues: GrammarIssueItem[];
  emphasized_markdown_list: string;
  annotated_markdown: string;
}

export interface AnalogyAuthenticityReview {
  is_ai_produced: boolean;
  label: AiProducedLabel;
  sticker_label_terms: string[];
  ungrounded_story_elements: string[];
  reasons: string[];
}

export interface LaypersonRetellingAnchor {
  has_clear_anchor: boolean;
  retellability_score: number;
  best_anchor_sentence: string;
  covered_stages: string[];
}

export interface BeginnerFriendlinessReview {
  is_beginner_friendly: boolean;
  beginner_score: number;
  condescending_phrases: string[];
  opening_jargon_free: boolean;
  avg_clause_chars: number;
  working_memory_load_ok: boolean;
  concrete_sensory_signals: number;
  reasons: string[];
}

export interface NarrativeBoundaryReview {
  within_boundary: boolean;
  story_bloat_detected: boolean;
  story_bloat_matches: string[];
  habit_lingo_domains: string[];
  habit_lingo_hits: string[];
  conciseness_score: number;
  reasons: string[];
}

export interface TextRecognitionJudgment {
  overall_ai_produced: boolean;
  labels: string[];
  readme_expression_review: ReadmeExpressionReview;
  micro_sentence_cracker: MicroSentenceCrackerResult;
  grammar_inspection: GrammarInspectionResult;
  analogy_authenticity_review: AnalogyAuthenticityReview;
  layperson_retelling_anchor: LaypersonRetellingAnchor;
  beginner_friendliness: BeginnerFriendlinessReview;
  narrative_boundary_review: NarrativeBoundaryReview;
}

export interface HumanVoiceDiagnostics {
  paragraphCount: number;
  singleSentenceParagraphCount: number;
  singleSentenceParagraphRatio: number;
  nonEntityMiddleDotCount: number;
  bulletLineCount: number;
  bulletLineRatio: number;
  sentenceLengthCv: number;
  aiClichesFound: string[];
  humanVoiceScore: number;
  issue1Warnings: string[];
  textRecognitionJudgment?: TextRecognitionJudgment;
}

export interface HanLPDocumentAnalysis {
  backendUsed: HanLPBackendMode;
  sentences: string[];
  tokensFine: string[][];
  tokensCoarse: string[][];
  posTags: string[][];
  entities: HanLPEntity[];
  srlFrames: HanLPSrlFrame[];
  keyphrases: Array<{ phrase: string; score: number }>;
  extractiveSummary: string[];
  depDiagnostics: HanLPDepDiagnostics;
}

export interface CustomDictionary {
  force: string[];
  combine: string[];
  synonyms: Record<string, string[]>;
}

const DEFAULT_HANLP_URL = "https://www.hanlp.com/api";

const STOPWORDS_ZH = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很",
  "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "与", "及",
  "或", "等", "中", "对", "为", "以", "将", "通过", "进行", "可以", "如果", "因为", "所以", "但是",
  "或者", "以及", "这个", "那个", "什么", "怎么", "如何", "我们", "他们", "它们"
]);

const AI_CLICHE_PHRASES = [
  "总而言之",
  "综上所述",
  "值得注意的是",
  "需要指出的是",
  "不言而喻",
  "众所周知",
  "让我们来看看",
  "想象一下",
  "简单来说",
  "换句话说",
  "不仅仅",
  "赋能",
  "抓手",
  "底层逻辑",
  "生态闭环",
];

const AI_README_STANDARDIZED_PHRASES = [
  "为什么选择",
  "核心特性",
  "核心亮点",
  "核心优势",
  "痛点与解决方案",
  "旨在解决",
  "致力于提供",
  "一站式解决方案",
  "开箱即用",
  "赋能",
  "抓手",
  "生态闭环",
  "全链路",
  "极致性能",
  "丝滑体验",
  "零门槛",
  "保姆级",
  "未来规划",
  "总而言之",
  "综上所述",
  "不言而喻",
  "众所周知",
  "值得注意的是",
];

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{26A1}\u{2728}]/gu;

const STOPWORDS_EN = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "as", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "shall", "should", "can", "could", "may", "might",
  "this", "that", "these", "those", "it", "its", "we", "our", "their", "which", "who"
]);

const HANLP_VALUE_FLAGS = ["--hanlp-mode", "--hanlp-url", "--hanlp-auth", "--hanlp-lang", "--custom-dict"] as const;

export function consumeHanlpArg(argv: string[], index: number): number | null {
  const arg = argv[index];
  if (arg === "--hanlp" || arg === "--no-hanlp") return index;
  if ((HANLP_VALUE_FLAGS as readonly string[]).includes(arg) && argv[index + 1]) return index + 1;
  return null;
}

export function parseHanLPCliOptions(argv: string[]): HanLPOptions {
  const opts: HanLPOptions = {
    enabled: process.env.HANLP_ENABLED === "1",
    mode: (process.env.HANLP_MODE as HanLPBackendMode) || "auto",
    apiUrl: process.env.HANLP_API_URL || DEFAULT_HANLP_URL,
    auth: process.env.HANLP_AUTH || null,
    language: (process.env.HANLP_LANG as HanLPLanguage) || "zh",
    customDictPath: process.env.HANLP_CUSTOM_DICT || undefined,
    timeoutMs: 8000,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--hanlp") {
      opts.enabled = true;
    } else if (arg === "--no-hanlp") {
      opts.enabled = false;
    } else if (arg === "--hanlp-mode" && argv[i + 1]) {
      opts.enabled = true;
      opts.mode = argv[++i] as HanLPBackendMode;
    } else if (arg === "--hanlp-url" && argv[i + 1]) {
      opts.enabled = true;
      opts.apiUrl = argv[++i];
    } else if (arg === "--hanlp-auth" && argv[i + 1]) {
      opts.enabled = true;
      opts.auth = argv[++i];
    } else if (arg === "--hanlp-lang" && argv[i + 1]) {
      opts.enabled = true;
      opts.language = argv[++i] as HanLPLanguage;
    } else if (arg === "--custom-dict" && argv[i + 1]) {
      opts.customDictPath = argv[++i];
    }
  }
  return opts;
}

export function loadCustomDictionary(dictPath?: string): CustomDictionary {
  const empty: CustomDictionary = { force: [], combine: [], synonyms: {} };
  if (!dictPath) return empty;
  const resolved = resolve(dictPath);
  if (!existsSync(resolved)) return empty;
  try {
    const raw = JSON.parse(readFileSync(resolved, "utf-8"));
    if (Array.isArray(raw)) {
      return { force: raw.map(String), combine: [], synonyms: {} };
    }
    return {
      force: Array.isArray(raw.force) ? raw.force.map(String) : [],
      combine: Array.isArray(raw.combine) ? raw.combine.map(String) : [],
      synonyms: typeof raw.synonyms === "object" && raw.synonyms ? raw.synonyms : {},
    };
  } catch {
    return empty;
  }
}

export function splitSentencesMultilingual(text: string): string[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!cleaned) return [];

  const parts = cleaned
    .split(/(?<=[。！？；!?;]|\.\s+|\n+)/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^#{1,6}\s/.test(s) && !/^\|.*\|$/.test(s));
  return parts.length > 0 ? parts : [cleaned];
}

export function segmentTextLocal(text: string, customDict?: CustomDictionary): string[] {
  const dictTerms = [...(customDict?.force ?? []), ...(customDict?.combine ?? [])].sort(
    (a, b) => b.length - a.length
  );

  let working = text;
  const placeholders: Map<string, string> = new Map();
  dictTerms.forEach((term, idx) => {
    if (term && working.includes(term)) {
      const key = `__HANLP_TERM_${idx}__`;
      placeholders.set(key, term);
      working = working.split(term).join(` ${key} `);
    }
  });

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    const rawTokens: string[] = [];
    for (const seg of segmenter.segment(working)) {
      const t = seg.segment.trim();
      if (!t) continue;
      if (placeholders.has(t)) {
        rawTokens.push(placeholders.get(t)!);
      } else {
        rawTokens.push(t);
      }
    }
    return rawTokens;
  }

  const matches = working.match(/__HANLP_TERM_\d+__|[A-Za-z0-9_+-]+|[\u4e00-\u9fff]{1,4}|[^\s]/g) ?? [];
  return matches.map((m) => placeholders.get(m) ?? m);
}

export function evaluateReadmeExpression(rawMarkdown: string): ReadmeExpressionReview {
  const withoutCode = rawMarkdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "");

  const emojiMatches = withoutCode.match(EMOJI_REGEX) ?? [];
  const emojis_found = [...new Set(emojiMatches)];
  const emoji_count = emojiMatches.length;

  const lines = withoutCode.split(/\r?\n/);
  const headingOrBulletEmojis = lines.filter(
    (line) => /^(?:#{1,6}\s+|[-*+•]\s+|\d+[.)、]\s+)/u.test(line.trim()) && EMOJI_REGEX.test(line)
  ).length;
  const emoji_overuse = emoji_count >= 3 || headingOrBulletEmojis >= 2;

  const paragraphs = withoutCode
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^#{1,6}\s/.test(p) && !/^\|.*\|$/.test(p) && !/^>\s/.test(p) && !/^---+\s*$/.test(p));

  const bulletRegex = /^(?:[-*+•·]|\d+[.)、])\s+/;
  const proseParagraphs = paragraphs.filter((p) => !bulletRegex.test(p));
  let singleSentParagraphs = 0;
  let totalParagraphChars = 0;
  for (const para of proseParagraphs) {
    totalParagraphChars += para.length;
    const sents = para.split(/(?<=[。！？!?]|\.\s+)/g).map((s) => s.trim()).filter(Boolean);
    if (sents.length <= 1 && para.length < 52) {
      singleSentParagraphs += 1;
    }
  }
  const fragmentation_ratio =
    proseParagraphs.length > 0 ? Number((singleSentParagraphs / proseParagraphs.length).toFixed(3)) : 0;
  const avgParagraphChars = proseParagraphs.length > 0 ? totalParagraphChars / proseParagraphs.length : 100;
  const severe_fragmentation =
    (proseParagraphs.length >= 2 && fragmentation_ratio >= 0.45) ||
    (proseParagraphs.length >= 3 && avgParagraphChars < 42);

  const withoutQuotedExamples = withoutCode.replace(/「[^」]{1,40}」|`[^`\n]{1,40}`/gu, "");
  const standardized_patterns_found = AI_README_STANDARDIZED_PHRASES.filter((phrase) =>
    withoutQuotedExamples.includes(phrase)
  );
  const colonBoldRegex = /^\s*(?:[-*+•]|\d+[.)、])\s*(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{26A1}\u{2728}]\s*)?\*\*[^*\n]{2,14}\*\*\s*[：:]/gmu;
  const colon_bold_bullet_count = (withoutCode.match(colonBoldRegex) ?? []).length;
  const over_standardized =
    standardized_patterns_found.length >= 2 ||
    (standardized_patterns_found.length >= 1 && colon_bold_bullet_count >= 2) ||
    colon_bold_bullet_count >= 3;

  const reasons: string[] = [];
  if (emoji_overuse) {
    reasons.push(`多表情元素：检测到 ${emoji_count} 处表情符号 (${emojis_found.slice(0, 6).join(" ")})`);
  }
  if (severe_fragmentation && over_standardized) {
    reasons.push(
      `分段严重且说明过于标准化：碎段占比 ${Math.round(fragmentation_ratio * 100)}%，命中标准化模板表达 ${standardized_patterns_found.length} 项、「**词条**：说明」机械排比 ${colon_bold_bullet_count} 处`
    );
  }

  const is_ai_produced = reasons.length > 0;
  return {
    is_ai_produced,
    label: is_ai_produced ? "ai生产" : "正常",
    emoji_count,
    emojis_found,
    emoji_overuse,
    severe_fragmentation,
    fragmentation_ratio,
    standardized_patterns_found,
    colon_bold_bullet_count,
    over_standardized,
    reasons,
  };
}

export function evaluateMicroSentenceCracker(rawMarkdown: string): MicroSentenceCrackerResult {
  const withoutScaffold = rawMarkdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "")
    .replace(/「[^」]{0,30}」|“[^”]{0,30}”|`[^`\n]{1,40}`/gu, "引用内容");

  const rawLines = withoutScaffold
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,6}\s/.test(line) && !/^\|.*\|$/.test(line) && !/^>\s/.test(line) && !/^---+\s*$/.test(line));

  const matched_sentences: MicroSentenceMatch[] = [];
  const seen = new Set<string>();
  const imperativePrefixRegex = /^(?:先[\u4e00-\u9fff]{1,2}|别[\u4e00-\u9fff]{1,2}|再[\u4e00-\u9fff]{1,2}|莫[\u4e00-\u9fff]{1,2}|勿[\u4e00-\u9fff]{1,2}|看[\u4e00-\u9fff]{1,2}|听[\u4e00-\u9fff]{1,2}|记住|注意)$/u;
  const bulletPrefixRegex = /^(?:[-*+•·]|\d+[.)、])\s+/u;

  for (const rawLine of rawLines) {
    const isBullet = bulletPrefixRegex.test(rawLine);
    const line = rawLine.replace(bulletPrefixRegex, "").trim();

    // 1. Check punctuated sentences (ending with 。！？!?) or non-bullet standalone short lines
    const punctuatedMatches = [...line.matchAll(/(?:^|[。！？!?]\s*)([^。！？!?\n]+?)(?=[。！？!?])/gu)].map((m) => m[1].trim());
    const candidates = !isBullet && !/[。！？!?]/u.test(line) ? [line] : punctuatedMatches;

    for (const seg of candidates) {
      const cleanedSeg = seg.replace(/^[“”"''‘’「」『』（）()【】\[\]\s]+|[“”"''‘’「」『』（）()【】\[\]\s]+$/gu, "");
      if (/^[\u4e00-\u9fff]{2,3}$/u.test(cleanedSeg)) {
        const len = cleanedSeg.length as 2 | 3;
        const isImperative = imperativePrefixRegex.test(cleanedSeg);
        const key = `${cleanedSeg}@${line.slice(0, 20)}`;
        if (!seen.has(key)) {
          seen.add(key);
          matched_sentences.push({
            text: cleanedSeg,
            char_length: len,
            pattern_type: isImperative ? "xian_bie_imperative" : "standalone_short_sentence",
            context: line.slice(0, 48),
          });
        }
      }
    }

    // 2. Check all clauses (including comma/colon/period-separated) for explicit 2-3 char AI imperative micro-phrases like "先xx，", "别x，"
    const allSegments = line.split(/[。！？!?，,：:—；;]+/u).map((c) => c.trim().replace(/^[“”"''‘’「」『』\s]+|[“”"''‘’「」『』\s]+$/gu, "")).filter(Boolean);
    for (const clause of allSegments) {
      if (/^[\u4e00-\u9fff]{2,3}$/u.test(clause) && imperativePrefixRegex.test(clause)) {
        const len = clause.length as 2 | 3;
        const key = `${clause}@${line.slice(0, 20)}`;
        if (!seen.has(key)) {
          seen.add(key);
          matched_sentences.push({
            text: clause,
            char_length: len,
            pattern_type: "xian_bie_imperative",
            context: line.slice(0, 48),
          });
        }
      }
    }
  }

  // 3. Rhetorical Q&A shells & theatrical transitions (设问自答与废话过渡壳)
  const qnaRegex = /(?:你可能会问|有人可能会问|那么问题来了|这是为什么呢[？?]\s*(?:原因在于|其实很简单|答案很明显)|这意味着什么(?:呢)?[？?]\s*这意味着|到底什么是[^，。！？\n]{1,12}呢[？?]\s*其实说白了)/gu;
  const rhetorical_qna_shells = [...new Set((withoutScaffold.match(qnaRegex) ?? []).map((m) => m.trim()))];

  // 4. Negative-contrast parallelism addiction ("不是A，而是B" / "不仅A，更是B" overuse >= 2)
  const negParallelRegex = /(?:不是[^，。！？；\n]{1,18}[，,]\s*而是[^，。！？；\n]{1,20}|不在于[^，。！？；\n]{1,18}[，,]\s*而在于[^，。！？；\n]{1,20}|不仅是一(?:场|次|种)[^，。！？；\n]{1,14}[，,]\s*更是一(?:场|次|种)[^，。！？；\n]{1,16})/gu;
  const negative_parallelism_matches = [...(withoutScaffold.match(negParallelRegex) ?? [])].map((m) => m.trim());

  // 5. Hollow epigrammatic endings (伪金句与空洞拔高收尾)
  const epigramRegex = /(?:这就是[\u4e00-\u9fffA-Za-z0-9]{1,12}的魅力所在|掌握了[\u4e00-\u9fffA-Za-z0-9]{1,10}[，,]\s*你就掌握了[\u4e00-\u9fff]{2,12}的钥匙|大道至简[，,]\s*[\u4e00-\u9fffA-Za-z0-9]{2,12}亦是如此|一切复杂的[\u4e00-\u9fff]{2,8}[，,]\s*归根结底都是)/gu;
  const hollow_epigrams = [...new Set((withoutScaffold.match(epigramRegex) ?? []).map((m) => m.trim()))];

  const reasons = matched_sentences.map(
    (m) =>
      `捕获${m.char_length}字独立短句「${m.text}」(${m.pattern_type === "xian_bie_imperative" ? "先xx/别x式指令短句" : "独立两三字短句"})`
  );
  if (rhetorical_qna_shells.length > 0) {
    reasons.push(`捕获 AI 设问自答过渡壳：${rhetorical_qna_shells.join("；")}`);
  }
  if (negative_parallelism_matches.length >= 2) {
    reasons.push(`捕获高频「不是…而是…/不仅…更是…」排比成瘾 (${negative_parallelism_matches.length} 处)：${negative_parallelism_matches.slice(0, 2).join("；")}`);
  }
  if (hollow_epigrams.length > 0) {
    reasons.push(`捕获伪金句空洞拔高：${hollow_epigrams.join("；")}`);
  }

  const is_ai_produced =
    matched_sentences.length > 0 ||
    rhetorical_qna_shells.length > 0 ||
    negative_parallelism_matches.length >= 2 ||
    hollow_epigrams.length > 0;

  return {
    is_ai_produced,
    label: is_ai_produced ? "ai生产" : "正常",
    matched_count: matched_sentences.length,
    matched_sentences,
    rhetorical_qna_shells,
    negative_parallelism_matches,
    hollow_epigrams,
    reasons,
  };
}

export function evaluateGrammarInspection(rawMarkdown: string): GrammarInspectionResult {
  const withoutScaffold = rawMarkdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "")
    .replace(/「[^」]{1,40}」|`[^`\n]{1,40}`/gu, "引用示例");

  const sentences = splitSentencesMultilingual(withoutScaffold);
  const issues: GrammarIssueItem[] = [];
  const seenSentences = new Set<string>();

  for (const rawSent of sentences) {
    const sent = rawSent.trim().replace(/^\*\*|\*\*$/g, "");
    if (sent.length < 6 || seenSentences.has(sent)) continue;

    // 1. Anglicized Inversion: Post-posed conditional/temporal clause (...，当/如果/一旦...的时候/时/的话)
    const postCondMatch = sent.match(
      /^([^，,。！？；\n]{4,}?)[，,]\s*((?:当(?![场然时前作下初今代局地])[^。！？；\n]{2,}?(?:的时候|之时|时|之后|之前)|(?:如果|若|假如|要是)[^。！？；\n]{2,}?(?:的话|的时候|之时|时)?|(?:一旦|每当|只要|除非)[^。！？；\n]{2,}?(?:的时候|之时|时|的话)))[。！？!?]?$/u
    );
    if (
      postCondMatch &&
      !/^(?:当|如果|若|一旦|每当|只要|除非|假如|无论|不管|即使|即便|哪怕|虽然|尽管)/u.test(postCondMatch[1].trim()) &&
      !/(?:即可|就能|便能|才能|就会|便会|方可)/u.test(postCondMatch[2].trim())
    ) {
      const mainClause = postCondMatch[1].trim();
      const condClause = postCondMatch[2].trim();
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "anglicized_inversion",
        pattern_name: "postposed_conditional_or_temporal",
        reason: `英式思维倒装句：条件/时间从句「${condClause}」后置，违背中文「先条件后结果」的自然语序`,
        suggestion: `${condClause}，${mainClause}。`,
      });
      continue;
    }

    // 2. Anglicized Inversion: Post-posed scope/prepositional phrase (...，对于...而言/来说 | ...，在...的情况下)
    const postScopeMatch = sent.match(
      /^([^，,。！？；\n]{4,}?)[，,]\s*((?:对于|关于|针对|就)[^。！？；\n]{2,}?(?:而言|来说|来看)|在[^。！？；\n]{2,}?(?:的情况下|的条件之下|的前提下|的基础之上))[。！？!?]?$/u
    );
    if (postScopeMatch && !/^(?:对于|关于|针对|就|在)/u.test(postScopeMatch[1].trim())) {
      const mainClause = postScopeMatch[1].trim();
      const scopeClause = postScopeMatch[2].trim();
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "anglicized_inversion",
        pattern_name: "postposed_scope_or_condition_frame",
        reason: `英式思维倒装句：限定状语「${scopeClause}」后置，属于典型英文直译语序`,
        suggestion: `${scopeClause}，${mainClause}。`,
      });
      continue;
    }

    // 3. Anglicized Inversion: Post-posed causal "...，因为...的缘故/原因"
    const postCausalMatch = sent.match(
      /^([^，,。！？；\n]{4,}?)[，,]\s*((?:因为|由于)[^。！？；\n]{2,}?(?:的缘故|的原因))[。！？!?]?$/u
    );
    if (postCausalMatch) {
      const mainClause = postCausalMatch[1].trim();
      const causalClause = postCausalMatch[2].trim().replace(/(?:的缘故|的原因)$/u, "");
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "anglicized_inversion",
        pattern_name: "postposed_because_reason",
        reason: `英式思维倒装句：原因从句「${postCausalMatch[2].trim()}」后置且冗余叠加「的缘故/原因」`,
        suggestion: `${causalClause}，所以${mainClause}。`,
      });
      continue;
    }

    // 4. SVO Word Order Error: 把/对...通过/利用... (object placed before instrument adverbial)
    const baInstrumentMatch = sent.match(
      /([^，,。！？；\n]*?)(把|将)([\u4e00-\u9fffA-Za-z0-9]{1,10}?)(通过|利用|使用|借助)([\u4e00-\u9fffA-Za-z0-9]{2,10})(?:来)?(?:进行|完成)?([\u4e00-\u9fff]{2})(?=[，,。！？；\n]|$)/u
    );
    if (baInstrumentMatch) {
      const [, prefix, ba, obj, prep, inst, verb] = baInstrumentMatch;
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "svo_order_error",
        pattern_name: "object_before_instrument_adverbial",
        reason: `主谓宾与状语语序错误：受事宾语「${ba}${obj}」被错误置于方式状语「${prep}${inst}」之前`,
        suggestion: sent.replace(baInstrumentMatch[0], `${prefix}${prep}${inst}${ba}${obj}${verb}`),
      });
      continue;
    }

    // 5. SVO Word Order Error: 实现了/完成了/进行了 + <Object> + 的 + <ActionVerb> (inverted VO nominalization)
    const invertedVoMatch = sent.match(
      /(?:实现|完成|进行|执行|达成)了([\u4e00-\u9fffA-Za-z0-9]{2,10}?)的(建立|提交|复制|清除|锁定|更新|排序|收敛|解决|验证|计算|拆分|分区|达成)/u
    );
    if (invertedVoMatch) {
      const [, obj, realVerb] = invertedVoMatch;
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "svo_order_error",
        pattern_name: "inverted_verb_object_nominalization",
        reason: `主谓宾语序颠倒：真实谓语动词「${realVerb}」被后置塞入宾语「${obj}」的定语后方`,
        suggestion: sent.replace(invertedVoMatch[0], `${realVerb}了${obj}`),
      });
      continue;
    }

    // 6. SVO Word Order Error: 对/把/将 + <Object> + 进行了 + <Modifier>的 + <Verb>
    const dummyVerbMatch = sent.match(
      /(?:对|把|将)([\u4e00-\u9fffA-Za-z0-9]{1,10}?)(?:进行了|加以了|予以了)([\u4e00-\u9fff]{1,6}?)的([\u4e00-\u9fff]{2,4})/u
    );
    if (dummyVerbMatch) {
      const [, obj, mod, realVerb] = dummyVerbMatch;
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "svo_order_error",
        pattern_name: "dummy_verb_svo_inversion",
        reason: `主谓宾语序不当：虚化动词「进行了」导致谓语「${realVerb}」与宾语「${obj}」语序颠倒`,
        suggestion: sent.replace(dummyVerbMatch[0], `${mod}地${realVerb}了${obj}`),
      });
      continue;
    }

    // 7. Anglicized De-Stacking: 3+ nested "的" pre-modifiers stacked in a single unbroken NP span (excluding parallel conjunctions/prepositions)
    const deStackMatch = sent.match(
      /([\u4e00-\u9fffA-Za-z0-9]{2,10}的[^\s，,。！？；：:\n和与或及把将让使是]{2,12}的[^\s，,。！？；：:\n和与或及把将让使是]{2,12}的[\u4e00-\u9fffA-Za-z0-9]{2,10})/u
    );
    if (deStackMatch) {
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "anglicized_de_stacking",
        pattern_name: "multi_layered_de_modifier_stack",
        reason: `欧化长定语堆叠：单分句内连续叠加 3 个以上「的」字定语（${deStackMatch[1]}），破坏中文线性呼吸感`,
        suggestion: `请拆分为动宾短句或后置说明，避免多层「的」字包孕定语。`,
      });
      continue;
    }

    // 8. Anglicized Weak Passive: 被用来进行 / 能够被很好地解决
    const anglicizedPassiveMatch = sent.match(
      /(?:(?:可以|能够|会)?被(?:用来|用于)(?:进行|完成|实现)?([\u4e00-\u9fff]{2,8})|被(很好地|成功地|有效地|快速地)(解决|完成|实现|执行|处理))/u
    );
    if (anglicizedPassiveMatch) {
      seenSentences.add(sent);
      const rewrite = anglicizedPassiveMatch[1]
        ? sent.replace(anglicizedPassiveMatch[0], `可用于${anglicizedPassiveMatch[1]}`)
        : sent.replace(anglicizedPassiveMatch[0], `得以${anglicizedPassiveMatch[2]}${anglicizedPassiveMatch[3]}`);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "anglicized_passive",
        pattern_name: "awkward_translated_passive",
        reason: `欧化被动句表达：生硬套用英文「be used to / be well solved」被动语态（${anglicizedPassiveMatch[0]}）`,
        suggestion: rewrite,
      });
      continue;
    }

    // 9. Anglicized Inanimate Plural "们": 节点们 / 参数们 / 数据包们 / 向量们
    const inanimateMenMatch = sent.match(
      /(节点|参数|向量|矩阵|数据包|线程|进程|梯度|请求|指针|字节|特征|模块|组件|函数|变量|分片|副本|区块)们/u
    );
    if (inanimateMenMatch) {
      seenSentences.add(sent);
      issues.push({
        sentence: sent,
        markdown_emphasized: `**${sent}**`,
        kind: "inanimate_plural_men",
        pattern_name: "inanimate_noun_plural_men",
        reason: `欧化复数「们」滥用：对无生命技术名词「${inanimateMenMatch[1]}」硬加复数后缀「们」`,
        suggestion: sent.replace(inanimateMenMatch[0], `各个${inanimateMenMatch[1]}`),
      });
      continue;
    }
  }

  let annotated_markdown = rawMarkdown;
  for (const item of issues) {
    annotated_markdown = annotated_markdown.split(item.sentence).join(item.markdown_emphasized);
  }

  const emphasized_markdown_list = issues
    .map(
      (item, idx) =>
        `${idx + 1}. ${item.markdown_emphasized}\n   - 类型：\`${item.kind}\`（${item.reason}）\n   - 建议改写：${item.suggestion}`
    )
    .join("\n");

  return {
    has_issues: issues.length > 0,
    issue_count: issues.length,
    issues,
    emphasized_markdown_list,
    annotated_markdown,
  };
}

export function evaluateAnalogyAuthenticity(rawMarkdown: string): AnalogyAuthenticityReview {
  const withoutQuotes = rawMarkdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/「[^」]{1,30}」|`[^`\n]{1,30}`/gu, "");

  // 1. Sticker-label pseudo-personification (e.g., 哈希先生, 梯度队长, 递归老师, 皮沃特老师)
  const stickerRegex =
    /(?:(?:哈希|递归|梯度|矩阵|向量|指针|线程|进程|协议|路由|缓存|队列|堆栈|注意力|贝叶斯|卷积|正则|分片|共识|参数|算子|接口|组件|字节|套接字|吞吐量)(?:先生|女士|老师|同学|大叔|爷爷|奶奶|精灵|小精灵|队长|将军|大臣|魔法师|卫兵|使者|宝宝|小哥|老哥)|(?:皮沃特|帕克特|托肯|诺德|赫德)(?:先生|老师|同学|队长|大叔)?)/gu;
  const sticker_label_terms = [...new Set((withoutQuotes.match(stickerRegex) ?? []).map((m) => m.trim()))];

  // 2. Check if mapping table story elements are grounded in the narrative body
  const ungrounded_story_elements: string[] = [];
  const detailsMatch = rawMarkdown.match(/<details[\s\S]*?<\/details>/iu);
  if (detailsMatch && detailsMatch.index !== undefined) {
    const detailsBlock = detailsMatch[0];
    const bodyText = rawMarkdown.slice(detailsMatch.index + detailsBlock.length);
    const tableLines = detailsBlock
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && l.endsWith("|"));
    if (tableLines.length >= 3) {
      for (const rowLine of tableLines.slice(2)) {
        const cells = rowLine
          .replace(/^\|/u, "")
          .replace(/\|$/u, "")
          .split("|")
          .map((c) => c.trim());
        const storyCell = cells[1] ?? "";
        if (storyCell && storyCell.length >= 2) {
          const coreTokens = segmentTextLocal(storyCell).filter((t) => /^[\u4e00-\u9fffA-Za-z0-9]{2,}$/u.test(t) && !STOPWORDS_ZH.has(t));
          const grounded = coreTokens.length === 0 || coreTokens.some((tok) => bodyText.includes(tok));
          if (!grounded) {
            ungrounded_story_elements.push(storyCell);
          }
        }
      }
    }
  }

  const reasons: string[] = [];
  if (sticker_label_terms.length > 0) {
    reasons.push(`检测到「术语贴标签/生硬音译」伪类比：${sticker_label_terms.join("、")}（违反核心原则第 2 条，请改用真实生活场景动作承载机制）`);
  }
  if (ungrounded_story_elements.length > 0) {
    reasons.push(`映射表中的类比元素未进入正文叙事：${ungrounded_story_elements.join("、")}`);
  }

  const is_ai_produced = sticker_label_terms.length > 0;
  return {
    is_ai_produced,
    label: is_ai_produced ? "ai生产" : "正常",
    sticker_label_terms,
    ungrounded_story_elements,
    reasons,
  };
}

export function evaluateLaypersonRetelling(rawMarkdown: string): LaypersonRetellingAnchor {
  const withoutScaffold = rawMarkdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "");

  const sentences = splitSentencesMultilingual(withoutScaffold).filter(
    (s) => s.length >= 12 && s.length <= 85 && !/^>\s/.test(s) && !/^\*\*知识点校验\*\*$/.test(s)
  );

  let bestSentence = "";
  let bestScore = 0;
  let bestStages: string[] = [];

  for (const sent of sentences) {
    const stages = [
      /(?:当|遇到|一旦|如果|若|要是|每当|面对|只要|起初|为了|需要)/u.test(sent) ? "trigger" : "",
      /(?:先|再|接着|随后|把|按|选|点|算|分|比|挪|查|贴|推|留|交)/u.test(sent) ? "action" : "",
      /(?:但是|然而|不过|但|只|除非|直到|不能|不可|否则|前提)/u.test(sent) ? "constraint" : "",
      /(?:最终|结果|就|才|因此|所以|从此|定|清|成|完)/u.test(sent) ? "outcome" : "",
    ].filter(Boolean);

    const clauses = sent.split(/[，,；;：:]/u).map((c) => c.trim()).filter(Boolean);
    const maxClauseLen = Math.max(0, ...clauses.map((c) => c.length));
    const deCount = (sent.match(/的/gu) ?? []).length;

    let score = stages.length * 25;
    if (maxClauseLen <= 22 && clauses.length >= 2) score += 15;
    else if (maxClauseLen > 32) score -= 20;
    if (deCount > 3) score -= (deCount - 3) * 8;
    score = Math.max(0, Math.min(100, score));

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sent;
      bestStages = stages;
    }
  }

  return {
    has_clear_anchor: bestScore >= 60 && bestSentence.length > 0,
    retellability_score: bestScore,
    best_anchor_sentence: bestSentence,
    covered_stages: bestStages,
  };
}

const CONDESCENDING_PHRASES = [
  "其实很简单",
  "显而易见",
  "不难发现",
  "不难理解",
  "不难看出",
  "稍有常识",
  "只要稍微想一下",
  "小学生都能懂",
  "傻瓜都能懂",
  "顾名思义",
  "不言自明",
];

export function evaluateBeginnerFriendliness(rawMarkdown: string): BeginnerFriendlinessReview {
  const withoutScaffold = rawMarkdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/「[^」]{1,35}」|`[^`\n]{1,35}`/gu, "引用内容");

  const condescending_phrases = CONDESCENDING_PHRASES.filter((phrase) => withoutScaffold.includes(phrase));

  const bodyLines = withoutScaffold
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^#{1,6}\s/.test(l) && !/^>\s/.test(l) && !/^\|.*\|$/.test(l) && !/^\*\*知识点校验\*\*/.test(l));

  const firstPara = bodyLines[0] ?? "";
  const openingSlice = firstPara.slice(0, 45);
  const openingHasHeavyJargon = /(?:[A-Z]{3,}|定理|方程组|偏导数|特征值|正交矩阵|马尔可夫|最大似然|同态加密|拜占庭容错)/u.test(openingSlice);
  const opening_jargon_free = !openingHasHeavyJargon;

  const allProse = bodyLines.join("\n");
  const clauses = allProse
    .split(/[。！？!?，,；;：:\n]+/u)
    .map((c) => c.trim())
    .filter((c) => c.length >= 2);
  const avg_clause_chars =
    clauses.length > 0
      ? Number((clauses.reduce((sum, c) => sum + c.length, 0) / clauses.length).toFixed(1))
      : 12;
  const working_memory_load_ok = avg_clause_chars <= 20;

  const sensoryMatches =
    allProse.match(
      /[手眼耳嘴脚拿放抓摸看听闻尝排队桌椅门锁盒包袋本纸笔菜汤火锅盐水茶杯刀秤账票抽屉印章哨牌楼墙路桥车船]/gu
    ) ?? [];
  const concrete_sensory_signals = sensoryMatches.length;

  const reasons: string[] = [];
  let score = 100;
  if (condescending_phrases.length > 0) {
    score -= condescending_phrases.length * 18;
    reasons.push(`检测到易引发小白挫败感的居高临下词：${condescending_phrases.join("、")}（建议直接给具体场景，不说“其实很简单/显而易见”）`);
  }
  if (!opening_jargon_free) {
    score -= 15;
    reasons.push("开篇前 45 字直接抛出高密度专业术语或缩写，缺少日常体感冷启动阶梯");
  }
  if (!working_memory_load_ok) {
    score -= Math.min(25, Math.round((avg_clause_chars - 20) * 3));
    reasons.push(`小句平均长度偏长 (${avg_clause_chars} 字 > 20 字)，超出低理解力读者单步工作记忆负荷`);
  }
  if (allProse.length >= 150 && concrete_sensory_signals < 2) {
    score -= 12;
    reasons.push("全文缺少日常器物或身体动作锚点，抽象度偏高");
  }
  score = Math.max(0, Math.min(100, score));

  return {
    is_beginner_friendly: score >= 75 && condescending_phrases.length === 0,
    beginner_score: score,
    condescending_phrases,
    opening_jargon_free,
    avg_clause_chars,
    working_memory_load_ok,
    concrete_sensory_signals,
    reasons,
  };
}

const STORY_BLOAT_CLICHES = [
  "在很久很久以前",
  "遥远的魔法王国",
  "阳光透过窗户洒在",
  "微风轻轻拂过",
  "微风拂过脸庞",
  "夕阳的余晖染红了",
  "端起一杯冒着热气的咖啡",
  "淅淅沥沥的小雨",
  "命运的齿轮开始转动",
  "空气中弥漫着紧张而又神秘的气息",
];

const HABIT_DOMAIN_LEXICON: Record<string, string[]> = {
  gaming: ["技能", "冷却", "CD", "蓝条", "充能", "仇恨", "副本", "开荒", "团本", "Boss", "读档", "存档", "掉帧", "词条", "配装", "闪现", "大招", "集火", "视野"],
  daily: ["外卖", "快递", "排队", "做饭", "炒菜", "锅", "盐", "抽屉", "钥匙", "门禁", "闸机", "调料", "账单", "取号"],
  workplace: ["工单", "排期", "审批", "复盘", "周报", "看板", "值班", "归档", "交接"],
};

export function evaluateNarrativeBoundary(rawMarkdown: string): NarrativeBoundaryReview {
  const withoutScaffold = rawMarkdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "")
    .replace(/「[^」]{1,40}」|`[^`\n]{1,40}`/gu, "引用内容");

  const story_bloat_matches = STORY_BLOAT_CLICHES.filter((phrase) => withoutScaffold.includes(phrase));
  const story_bloat_detected = story_bloat_matches.length > 0;

  const habit_lingo_domains: string[] = [];
  const habit_lingo_hits: string[] = [];

  for (const [domain, terms] of Object.entries(HABIT_DOMAIN_LEXICON)) {
    const hits = terms.filter((t) => withoutScaffold.includes(t));
    if (hits.length > 0) {
      habit_lingo_domains.push(domain);
      for (const h of hits) {
        if (!habit_lingo_hits.includes(h)) habit_lingo_hits.push(h);
      }
    }
  }

  let conciseness_score = 100;
  const reasons: string[] = [];
  if (story_bloat_detected) {
    conciseness_score -= story_bloat_matches.length * 25;
    reasons.push(
      `检测到无机制增量的长篇故事环境/剧情注水描写：${story_bloat_matches.join("、")}（违反叙述边界原则：通俗易懂不是长篇大论讲故事，请改用日常/游戏话术直接对位机制）`
    );
  }
  conciseness_score = Math.max(0, Math.min(100, conciseness_score));

  return {
    within_boundary: !story_bloat_detected && conciseness_score >= 75,
    story_bloat_detected,
    story_bloat_matches,
    habit_lingo_domains,
    habit_lingo_hits: habit_lingo_hits.slice(0, 10),
    conciseness_score,
    reasons,
  };
}

export function evaluateTextRecognitionJudgment(rawMarkdown: string): TextRecognitionJudgment {
  const readme_expression_review = evaluateReadmeExpression(rawMarkdown);
  const micro_sentence_cracker = evaluateMicroSentenceCracker(rawMarkdown);
  const grammar_inspection = evaluateGrammarInspection(rawMarkdown);
  const analogy_authenticity_review = evaluateAnalogyAuthenticity(rawMarkdown);
  const layperson_retelling_anchor = evaluateLaypersonRetelling(rawMarkdown);
  const beginner_friendliness = evaluateBeginnerFriendliness(rawMarkdown);
  const narrative_boundary_review = evaluateNarrativeBoundary(rawMarkdown);

  const overall_ai_produced =
    readme_expression_review.is_ai_produced ||
    micro_sentence_cracker.is_ai_produced ||
    analogy_authenticity_review.is_ai_produced ||
    narrative_boundary_review.story_bloat_detected;

  const labels: string[] = [];
  if (overall_ai_produced) {
    labels.push("ai生产");
  }
  if (analogy_authenticity_review.sticker_label_terms.length > 0) {
    labels.push("伪类比贴标签");
  }
  if (narrative_boundary_review.story_bloat_detected) {
    labels.push("长篇剧情注水");
  }
  if (grammar_inspection.has_issues) {
    labels.push("语法待修正");
  }
  if (beginner_friendliness.condescending_phrases.length > 0) {
    labels.push("含居高临下词");
  }

  return {
    overall_ai_produced,
    labels,
    readme_expression_review,
    micro_sentence_cracker,
    grammar_inspection,
    analogy_authenticity_review,
    layperson_retelling_anchor,
    beginner_friendliness,
    narrative_boundary_review,
  };
}

export function evaluateHumanVoiceAndAntiSlop(
  bodyText: string,
  nlp: HanLPDocumentAnalysis,
  style = "anime",
): HumanVoiceDiagnostics {
  const cleanedBody = bodyText.replace(/<!--[\s\S]*?-->/g, "");
  const rawLines = cleanedBody
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,6}\s/.test(line) && !/^\|.*\|$/.test(line));
  const paragraphs = cleanedBody
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !/^#{1,6}\s/.test(paragraph) && !/^\|.*\|$/.test(paragraph));
  const bulletRegex = /^(?:[-*+•·]|\d+[.)、])\s+/;
  const bulletLineCount = rawLines.filter((line) => bulletRegex.test(line)).length;
  const bulletLineRatio = rawLines.length > 0 ? Number((bulletLineCount / rawLines.length).toFixed(3)) : 0;

  let singleSentenceParagraphCount = 0;
  for (const paragraph of paragraphs) {
    if (bulletRegex.test(paragraph)) continue;
    const sentences = paragraph.split(/(?<=[。！？!?]|\.\s+)/g).map((sentence) => sentence.trim()).filter(Boolean);
    if (sentences.length <= 1 && paragraph.length < 45) singleSentenceParagraphCount += 1;
  }
  const singleSentenceParagraphRatio = paragraphs.length > 0
    ? Number((singleSentenceParagraphCount / paragraphs.length).toFixed(3))
    : 0;

  const personEntities = new Set(
    nlp.entities.filter((entity) => ["PERSON", "PER", "NR", "nr"].includes(entity.type)).map((entity) => entity.text),
  );
  let maskedForDots = cleanedBody;
  for (const person of personEntities) {
    if (person.includes("·")) maskedForDots = maskedForDots.split(person).join("");
  }
  const nonEntityMiddleDotCount = (maskedForDots.match(/[·•]/g) ?? []).length;

  const sentLengths = nlp.tokensFine
    .map((tokens) => tokens.filter((token) => !/^[\p{P}\s]+$/u.test(token)).length)
    .filter((length) => length > 0);
  let sentenceLengthCv = 0.45;
  if (sentLengths.length >= 3) {
    const mean = sentLengths.reduce((sum, length) => sum + length, 0) / sentLengths.length;
    const variance = sentLengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / sentLengths.length;
    sentenceLengthCv = mean > 0 ? Number((Math.sqrt(variance) / mean).toFixed(3)) : 0;
  }

  const aiClichesFound = AI_CLICHE_PHRASES.filter((phrase) => cleanedBody.includes(phrase));
  const textRecognitionJudgment = evaluateTextRecognitionJudgment(cleanedBody);
  const issue1Warnings: string[] = [];
  const isVerse = style === "verse";
  const isNeutral = style === "neutral";
  if (!isVerse && paragraphs.length >= 3 && singleSentenceParagraphRatio > 0.35) {
    issue1Warnings.push(`[Issue #1 人味门禁·一行一句预警] 单句成段（短碎段落）占比过高 (${Math.round(singleSentenceParagraphRatio * 100)}%)，读感接近 AI 快餐文；请将因果相连的句子合并为 2-5 句的自然段。`);
  }
  if (nonEntityMiddleDotCount >= 2) {
    issue1Warnings.push(`[Issue #1 人味门禁·「·」号滥用预警] 检测到 ${nonEntityMiddleDotCount} 处非人名实体的居中圆点「·/•」，请移除机械分点或「概念·标签」式生造词，改为自然句子衔接。`);
  }
  if (!isNeutral && bulletLineRatio > 0.2) {
    issue1Warnings.push(`[Issue #1 人味门禁·清单化正文预警] 叙事正文中列表行占比达 ${Math.round(bulletLineRatio * 100)}%，请勿把故事正文写成说明书清单。`);
  }
  if (!isVerse && sentLengths.length >= 4 && sentenceLengthCv < 0.22) {
    issue1Warnings.push(`[Issue #1 人味门禁·句式节奏预警] 句子长度变异系数偏低 (CV=${sentenceLengthCv})，句式长短过于均一呆板，建议增加长短句交错的呼吸感。`);
  }
  if (aiClichesFound.length > 0) {
    issue1Warnings.push(`[Issue #1 人味门禁·AI 套话预警] 检测到高频 AI 模板套话: ${aiClichesFound.join("、")}，建议直接用具体情境和动作替代。`);
  }
  if (textRecognitionJudgment.readme_expression_review.is_ai_produced) {
    issue1Warnings.push(`[文本识别评判·readme表达审查(ai生产)] ${textRecognitionJudgment.readme_expression_review.reasons.join("；")}`);
  }
  if (!isVerse && textRecognitionJudgment.micro_sentence_cracker.is_ai_produced) {
    issue1Warnings.push(`[文本识别评判·词句关键破解(ai生产)] ${textRecognitionJudgment.micro_sentence_cracker.reasons.join("；")}`);
  }
  if (textRecognitionJudgment.analogy_authenticity_review.is_ai_produced) {
    issue1Warnings.push(`[文本识别评判·类比真实度审查(ai生产)] ${textRecognitionJudgment.analogy_authenticity_review.reasons.join("；")}`);
  }
  if (textRecognitionJudgment.grammar_inspection.has_issues) {
    for (const issue of textRecognitionJudgment.grammar_inspection.issues) {
      issue1Warnings.push(`[文本识别评判·语法识别] ${issue.markdown_emphasized} -> ${issue.reason}`);
    }
  }

  const singleLinePenalty = !isVerse && paragraphs.length >= 3 ? Math.max(0, (singleSentenceParagraphRatio - 0.25) * 45) : 0;
  const dotPenalty = Math.min(25, nonEntityMiddleDotCount * 6);
  const bulletPenalty = !isNeutral ? Math.max(0, (bulletLineRatio - 0.1) * 40) : 0;
  const rhythmPenalty = !isVerse && sentLengths.length >= 4 && sentenceLengthCv < 0.25 ? 10 : 0;
  const clichePenalty = Math.min(20, aiClichesFound.length * 5);
  const emojiPenalty = Math.min(18, textRecognitionJudgment.readme_expression_review.emoji_count * 5);
  const microSentPenalty = !isVerse
    ? Math.min(
        20,
        textRecognitionJudgment.micro_sentence_cracker.matched_count * 7 +
          textRecognitionJudgment.micro_sentence_cracker.rhetorical_qna_shells.length * 8 +
          (textRecognitionJudgment.micro_sentence_cracker.negative_parallelism_matches.length >= 2 ? 10 : 0) +
          textRecognitionJudgment.micro_sentence_cracker.hollow_epigrams.length * 8
      )
    : 0;
  const stickerPenalty = Math.min(20, textRecognitionJudgment.analogy_authenticity_review.sticker_label_terms.length * 10);
  const grammarPenalty = Math.min(24, textRecognitionJudgment.grammar_inspection.issue_count * 8);
  const humanVoiceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 - singleLinePenalty - dotPenalty - bulletPenalty - rhythmPenalty - clichePenalty - emojiPenalty - microSentPenalty - stickerPenalty - grammarPenalty
      )
    )
  );

  return {
    paragraphCount: paragraphs.length,
    singleSentenceParagraphCount,
    singleSentenceParagraphRatio,
    nonEntityMiddleDotCount,
    bulletLineCount,
    bulletLineRatio,
    sentenceLengthCv,
    aiClichesFound,
    humanVoiceScore,
    issue1Warnings,
    textRecognitionJudgment,
  };
}

function computeDepTreeDepth(depRelations: Array<[number, string]>): number {
  if (!depRelations || depRelations.length === 0) return 1;
  const n = depRelations.length;
  const depthMemo = new Map<number, number>();

  function getDepth(idx: number, visited: Set<number>): number {
    if (depthMemo.has(idx)) return depthMemo.get(idx)!;
    if (visited.has(idx)) return 1;
    visited.add(idx);
    const rel = depRelations[idx - 1];
    if (!rel) return 1;
    const head = Number(rel[0]);
    if (head <= 0 || head > n || head === idx) {
      depthMemo.set(idx, 1);
      return 1;
    }
    const d = 1 + getDepth(head, visited);
    depthMemo.set(idx, d);
    return d;
  }

  let maxDepth = 1;
  for (let i = 1; i <= n; i++) {
    const d = getDepth(i, new Set());
    if (d > maxDepth) maxDepth = d;
  }
  return maxDepth;
}

function estimateLocalTreeDepth(sentence: string, tokens: string[]): number {
  const stripped = sentence.replace(/[“”""「」]/gu, "");
  const longClause = stripped.split(/[，。！？；、,;!?]/u).some((clause) => clause.trim().length > 38);
  const deCount = (stripped.match(/的/gu) ?? []).length;
  const passive = /被.{1,12}所|is\s+\w+ed\s+by/iu.test(stripped);
  let depth = 1 + Math.floor(tokens.length / 14);
  if (longClause) depth += 2;
  if (deCount >= 4) depth += 2;
  if (passive) depth += 1;
  return Math.max(1, Math.min(12, depth));
}

function extractLocalSrlFrames(sentences: string[]): HanLPSrlFrame[] {
  const frames: HanLPSrlFrame[] = [];
  const condRegex = /(?:当|如果|若|一旦|在|给定|通过|基于|每轮|每次|when|if|given|by)\s*([^，,。；;]+)/i;
  const constraintRegex = /(?:直到|除非|不得|不可|不能|限制|上限|下限|边界|满足|条件是|前提是|必须|until|unless|subject to|bounded by|must)\s*([^，,。；;]+)/i;
  const actionVerbRegex = /([^，,。；;]{0,18}?)(进行|执行|计算|更新|转换|映射|筛选|收敛|触发|生成|验证|分割|分区|聚合|提取|拒绝|回退|传递|调用|更新为|转化为|选定|选择|选出|选|分成|划分|比较|比对|递归|选举|复制|提交|识别|分泌|标记|清除|除以|相乘|加权|求和|缩放|收缩|折半|查找|握手|发送|确认|缓存|校验)([^，,。；;]{1,28})|(?:we find that|shows that|causes|increases|reduces|selects|partitions|elects|replicates|commits|updates)\s+([^.]{6,80})/i;

  for (const s of sentences) {
    const mAction = s.match(actionVerbRegex);
    const mCond = s.match(condRegex);
    const mConst = s.match(constraintRegex);
    if (mAction || mCond || mConst) {
      frames.push({
        sentence: s,
        triggerOrCondition: mCond ? [mCond[1].trim()] : [],
        actorArg0: mAction?.[1]?.trim() ? [mAction[1].trim()] : [],
        predicate: mAction?.[2]?.trim() || (mAction?.[4] ? "action" : "") || "作用/推导",
        targetArg1: mAction?.[3]?.trim() ? [mAction[3].trim()] : mAction?.[4]?.trim() ? [mAction[4].trim()] : [s.slice(0, 32)],
        constraintsOrManner: mConst ? [mConst[1].trim()] : [],
      });
    }
  }
  return frames.slice(0, 8);
}

function extractLocalEntitiesAndKeyphrases(
  text: string,
  sentences: string[],
  tokensPerSentence: string[][],
  customDict?: CustomDictionary
): {
  entities: HanLPEntity[];
  keyphrases: Array<{ phrase: string; score: number }>;
} {
  const entities: HanLPEntity[] = [];
  const freq = new Map<string, number>();

  for (const forceTerm of customDict?.force ?? []) {
    if (text.includes(forceTerm)) {
      freq.set(forceTerm, (freq.get(forceTerm) ?? 0) + 5);
    }
  }

  const headerAuthors = new Set(
    (text.split(/\r?\n/u).slice(0, 4).join(" ").match(/\b[A-Z][a-z]{2,}\b/gu) ?? []).map((name) => name.toLowerCase()),
  );
  const journalNoise = new Set(["sci", "adv", "science", "advances", "doi", "vol", "fig", "table", "july", "article"]);
  const techMatches = text.match(/\b(?:[A-Z]{2,}(?:-\d+)?|[A-Z][a-z]+(?:\s+[a-z]+){0,3})\b|「[^」]{2,15}」|“[^”]{2,15}”|[\u4e00-\u9fff]{2,6}(?:算法|机制|模型|公式|定理|协议|分布|网络|矩阵|函数|系统|结构|树|层|概率|梯度|注意力|编码器|解码器)/g) ?? [];
  for (const tm of techMatches) {
    const cleaned = tm.replace(/^[「“]|[」”]$/g, "").trim();
    if (cleaned.length >= 2 && !headerAuthors.has(cleaned.toLowerCase()) && !journalNoise.has(cleaned.toLowerCase()) && !/^(?:results|discussion|materials|methods|introduction|abstract)$/iu.test(cleaned)) {
      freq.set(cleaned, (freq.get(cleaned) ?? 0) + 3);
    }
  }

  tokensPerSentence.forEach((tokens, sIdx) => {
    tokens.forEach((tok, tIdx) => {
      const clean = tok.trim();
      if (clean.length < 2) return;
      const lower = clean.toLowerCase();
      if (STOPWORDS_ZH.has(clean) || STOPWORDS_EN.has(lower)) return;
      if (/^[\d\p{P}]+$/u.test(clean)) return;

      freq.set(clean, (freq.get(clean) ?? 0) + 1);
      if (/^[A-Z]{2,}/.test(clean) || /(?:算法|机制|模型|定理|协议|公式|网络)$/.test(clean)) {
        entities.push({
          text: clean,
          type: "TERM/CONCEPT",
          sentenceIndex: sIdx,
          start: tIdx,
          end: tIdx + 1,
        });
      }
    });
  });

  const sortedKeyphrases = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([phrase, count], idx) => ({
      phrase,
      score: Number(Math.max(0.2, Math.min(0.99, count / ((freq.size || 10) * 0.25) - idx * 0.03)).toFixed(3)),
    }));

  const seenEntity = new Set<string>();
  const uniqueEntities = entities.filter((e) => {
    if (seenEntity.has(e.text)) return false;
    seenEntity.add(e.text);
    return true;
  });

  return { entities: uniqueEntities.slice(0, 15), keyphrases: sortedKeyphrases };
}

async function callHanLPRestful(text: string, options: HanLPOptions): Promise<Record<string, any> | null> {
  const apiUrl = options.apiUrl || DEFAULT_HANLP_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options.auth) {
      headers["Authorization"] = `Basic ${options.auth}`;
    }
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/parse`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text,
        tasks: ["tok/fine", "tok/coarse", "pos/ctb", "ner/msra", "srl", "dep"],
        language: options.language || "zh",
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, any>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function callHanLPNativeBridge(text: string, options: HanLPOptions): Record<string, any> | null {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const bridgeScript = join(currentDir, "hanlp_bridge.py");
    if (!existsSync(bridgeScript)) return null;

    const proc = spawnSync(
      "python3",
      [bridgeScript, "--mode", options.mode === "native" ? "native" : "auto"],
      {
        input: JSON.stringify({
          text,
          mode: options.mode || "auto",
          url: options.apiUrl || DEFAULT_HANLP_URL,
          auth: options.auth || null,
          language: options.language || "zh",
          custom_dict_path: options.customDictPath,
          tasks: ["tok/fine", "tok/coarse", "pos/ctb", "ner/msra", "srl", "dep"],
          extract_keyphrases: true,
          summarize: true,
        }),
        encoding: "utf-8",
        timeout: options.timeoutMs ?? 8000,
      }
    );

    if (proc.status !== 0 || !proc.stdout) return null;
    const parsed = JSON.parse(proc.stdout.trim());
    if (!parsed.ok || parsed.fallback) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeHanLPDocumentResponse(
  rawDoc: Record<string, any>,
  backendUsed: HanLPBackendMode,
  rawText: string,
  customDict?: CustomDictionary
): HanLPDocumentAnalysis {
  const doc = rawDoc.document ?? rawDoc;
  const tokFine: string[][] = Array.isArray(doc["tok/fine"])
    ? doc["tok/fine"]
    : Array.isArray(doc["tok"])
      ? doc["tok"]
      : splitSentencesMultilingual(rawText).map((s) => segmentTextLocal(s, customDict));

  const tokCoarse: string[][] = Array.isArray(doc["tok/coarse"]) ? doc["tok/coarse"] : tokFine;
  const posTags: string[][] = Array.isArray(doc["pos/ctb"])
    ? doc["pos/ctb"]
    : Array.isArray(doc["pos/pku"])
      ? doc["pos/pku"]
      : Array.isArray(doc["pos"])
        ? doc["pos"]
        : tokFine.map((sent) => sent.map(() => "NN"));

  const sentences =
    Array.isArray(rawDoc.sentences) && rawDoc.sentences.length === tokFine.length
      ? rawDoc.sentences
      : tokFine.map((tokens) => tokens.join(""));

  const entities: HanLPEntity[] = [];
  const rawNer = doc["ner/msra"] ?? doc["ner/ontonotes"] ?? doc["ner/pku"] ?? doc["ner"];
  if (Array.isArray(rawNer)) {
    rawNer.forEach((sentNer: any[], sIdx: number) => {
      if (!Array.isArray(sentNer)) return;
      for (const item of sentNer) {
        if (Array.isArray(item) && item.length >= 2) {
          entities.push({
            text: String(item[0]),
            type: String(item[1]),
            sentenceIndex: sIdx,
            start: Number(item[2] ?? 0),
            end: Number(item[3] ?? 0),
          });
        }
      }
    });
  }

  const srlFrames: HanLPSrlFrame[] = [];
  const rawSrl = doc["srl"];
  if (Array.isArray(rawSrl)) {
    rawSrl.forEach((sentPasList: any[], sIdx: number) => {
      if (!Array.isArray(sentPasList)) return;
      for (const pas of sentPasList) {
        if (!Array.isArray(pas)) continue;
        const frame: HanLPSrlFrame = {
          sentence: sentences[sIdx] ?? "",
          triggerOrCondition: [],
          actorArg0: [],
          predicate: "",
          targetArg1: [],
          constraintsOrManner: [],
        };
        for (const roleTuple of pas) {
          if (!Array.isArray(roleTuple) || roleTuple.length < 2) continue;
          const [form, role] = [String(roleTuple[0]), String(roleTuple[1])];
          if (role === "PRED") frame.predicate = form;
          else if (role === "ARG0") frame.actorArg0.push(form);
          else if (role === "ARG1" || role === "ARG2") frame.targetArg1.push(form);
          else if (role === "ARGM-TMP" || role === "ARGM-CND" || role === "ARGM-LOC") {
            frame.triggerOrCondition.push(form);
          } else if (role.startsWith("ARGM-")) {
            frame.constraintsOrManner.push(form);
          }
        }
        if (frame.predicate) srlFrames.push(frame);
      }
    });
  }

  const rawDep = doc["dep"];
  const depths: number[] = [];
  const complexSentences: Array<{ sentence: string; tokenCount: number; treeDepth: number }> = [];
  tokFine.forEach((tokens, sIdx) => {
    const depTree = Array.isArray(rawDep) && Array.isArray(rawDep[sIdx]) ? rawDep[sIdx] : null;
    const depth = depTree ? computeDepTreeDepth(depTree) : estimateLocalTreeDepth(sentences[sIdx] ?? "", tokens);
    depths.push(depth);
    if (depth >= 6 || tokens.length >= 42) {
      complexSentences.push({
        sentence: sentences[sIdx] ?? tokens.join(""),
        tokenCount: tokens.length,
        treeDepth: depth,
      });
    }
  });

  const maxTreeDepth = depths.length > 0 ? Math.max(...depths) : 0;
  const avgTreeDepth =
    depths.length > 0 ? Number((depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(2)) : 0;
  const maxSentenceTokens = tokFine.length > 0 ? Math.max(...tokFine.map((t) => t.length)) : 0;

  const localExtracted = extractLocalEntitiesAndKeyphrases(rawText, sentences, tokFine, customDict);
  const keyphrases: Array<{ phrase: string; score: number }> =
    rawDoc.keyphrases && typeof rawDoc.keyphrases === "object" && Object.keys(rawDoc.keyphrases).length > 0
      ? Object.entries(rawDoc.keyphrases).map(([phrase, score]) => ({
          phrase,
          score: Number(score),
        }))
      : localExtracted.keyphrases;

  const mergedEntities = entities.length > 0 ? entities : localExtracted.entities;
  const mergedSrl = srlFrames.length > 0 ? srlFrames : extractLocalSrlFrames(sentences);

  const extractiveSummary =
    sentences.length <= 3
      ? sentences
      : [...sentences]
          .sort((a, b) => {
            const scoreA = keyphrases.reduce((acc, kp) => acc + (a.includes(kp.phrase) ? kp.score : 0), 0);
            const scoreB = keyphrases.reduce((acc, kp) => acc + (b.includes(kp.phrase) ? kp.score : 0), 0);
            return scoreB - scoreA;
          })
          .slice(0, 3);

  return {
    backendUsed,
    sentences,
    tokensFine: tokFine,
    tokensCoarse: tokCoarse,
    posTags,
    entities: mergedEntities,
    srlFrames: mergedSrl,
    keyphrases,
    extractiveSummary,
    depDiagnostics: {
      sentenceCount: sentences.length,
      maxTreeDepth,
      avgTreeDepth,
      maxSentenceTokens,
      complexSentences,
    },
  };
}

export async function analyzeWithHanLP(
  text: string,
  options: HanLPOptions = {}
): Promise<HanLPDocumentAnalysis> {
  const customDict = loadCustomDictionary(options.customDictPath);
  const mode = options.mode || "auto";

  if (options.enabled) {
    if (mode === "native" || mode === "auto") {
      const nativeRes = callHanLPNativeBridge(text, options);
      if (nativeRes) {
        return normalizeHanLPDocumentResponse(
          nativeRes,
          (nativeRes.backend === "hanlp_native" ? "native" : "restful") as HanLPBackendMode,
          text,
          customDict
        );
      }
    }
    if (mode === "restful" || mode === "auto") {
      const restfulRes = await callHanLPRestful(text, options);
      if (restfulRes) {
        return normalizeHanLPDocumentResponse(restfulRes, "restful", text, customDict);
      }
    }
  }

  return analyzeWithHanLPSync(text, options);
}

export function analyzeWithHanLPSync(
  text: string,
  options: HanLPOptions = {}
): HanLPDocumentAnalysis {
  const customDict = loadCustomDictionary(options.customDictPath);
  if (options.enabled && (options.mode === "native" || options.mode === "auto")) {
    const nativeRes = callHanLPNativeBridge(text, options);
    if (nativeRes) {
      return normalizeHanLPDocumentResponse(
        nativeRes,
        (nativeRes.backend === "hanlp_native" ? "native" : "restful") as HanLPBackendMode,
        text,
        customDict
      );
    }
  }

  const sentences = splitSentencesMultilingual(text);
  const tokensFine = sentences.map((s) => segmentTextLocal(s, customDict));
  return normalizeHanLPDocumentResponse(
    {
      sentences,
      document: {
        "tok/fine": tokensFine,
        "tok/coarse": tokensFine,
      },
    },
    "local-fallback",
    text,
    customDict
  );
}

export interface ClaimFidelityEvaluation {
  lexicalSimilarity: number;
  effectiveSimilarity: number;
  polarityConflict: boolean;
  directionConflict: boolean;
  conflictReason?: string;
  matchedSentence?: string;
}

const DIRECTIONAL_ANTONYM_PAIRS: ReadonlyArray< readonly [string, string] > = [
  ["相反", "相同"],
  ["反方向", "同方向"],
  ["逆方向", "顺方向"],
  ["大于零", "等于零"],
  ["不为零", "为零"],
  ["多数派", "少数派"],
  ["过半", "不过半"],
  ["有序", "无序"],
  ["已排序", "未排序"],
  ["正比", "反比"],
  ["单向", "双向"],
  ["特异性", "通用"],
];

function computeLexicalOverlap(
  normA: string,
  normB: string,
  customDict?: CustomDictionary
): number {
  if (!normA || !normB) return 0;
  if (normA.includes(normB) || normB.includes(normA)) return 1.0;

  const tokensA = segmentTextLocal(normA, customDict).filter(
    (t) => t.length > 0 && !STOPWORDS_ZH.has(t) && !STOPWORDS_EN.has(t) && !/^[\p{P}\s]+$/u.test(t)
  );
  const tokensB = segmentTextLocal(normB, customDict).filter(
    (t) => t.length > 0 && !STOPWORDS_ZH.has(t) && !STOPWORDS_EN.has(t) && !/^[\p{P}\s]+$/u.test(t)
  );
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const expandedA = new Set<string>(tokensA);
  if (customDict?.synonyms) {
    for (const t of tokensA) {
      for (const syn of customDict.synonyms[t] ?? []) {
        expandedA.add(syn.toLocaleLowerCase());
      }
    }
    for (const [canonical, syns] of Object.entries(customDict.synonyms)) {
      const canonLower = canonical.toLocaleLowerCase();
      if (syns.some((syn) => expandedA.has(syn.toLocaleLowerCase()) || normA.includes(syn.toLocaleLowerCase()))) {
        expandedA.add(canonLower);
        for (const syn of syns) expandedA.add(syn.toLocaleLowerCase());
      }
    }
  }

  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();
  const cjkA = normA.replace(/[^\u4e00-\u9fff]/g, "");
  const cjkB = normB.replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i < cjkA.length - 1; i++) bigramsA.add(cjkA.slice(i, i + 2));
  for (let i = 0; i < cjkB.length - 1; i++) bigramsB.add(cjkB.slice(i, i + 2));

  let matchedTokens = 0;
  for (const t of tokensB) {
    if (expandedA.has(t)) {
      matchedTokens++;
    } else {
      for (const a of expandedA) {
        if (a.length >= 2 && t.length >= 2 && (a.includes(t) || t.includes(a))) {
          matchedTokens += 0.75;
          break;
        }
      }
    }
  }

  const tokenRecall = matchedTokens / tokensB.length;
  let bigramOverlap = 0;
  if (bigramsB.size > 0) {
    let hit = 0;
    for (const bg of bigramsB) {
      if (bigramsA.has(bg)) hit++;
    }
    bigramOverlap = hit / bigramsB.size;
  }

  return Number(Math.min(1.0, Math.max(tokenRecall, tokenRecall * 0.7 + bigramOverlap * 0.3)).toFixed(3));
}

function detectSentenceContradiction(
  sentence: string,
  claim: string
): { polarityConflict: boolean; directionConflict: boolean; reason?: string } {
  const normSent = sentence.toLocaleLowerCase();
  const normClaim = claim.toLocaleLowerCase();

  for (const [termA, termB] of DIRECTIONAL_ANTONYM_PAIRS) {
    const claimHasA = normClaim.includes(termA) && !normClaim.includes(`不${termA}`) && !normClaim.includes(`非${termA}`);
    const claimHasB = normClaim.includes(termB) && !normClaim.includes(`不${termB}`) && !normClaim.includes(`非${termB}`);
    const sentHasA = normSent.includes(termA) && !normSent.includes(`不${termA}`) && !normSent.includes(`不是${termA}`) && !normSent.includes(`非${termA}`);
    const sentHasB = normSent.includes(termB) && !normSent.includes(`不${termB}`) && !normSent.includes(`不是${termB}`) && !normSent.includes(`非${termB}`);
    if (claimHasA && sentHasB && !sentHasA) {
      return { polarityConflict: false, directionConflict: true, reason: `方向/属性反转：事实要求「${termA}」，正文写为「${termB}」` };
    }
    if (claimHasB && sentHasA && !sentHasB) {
      return { polarityConflict: false, directionConflict: true, reason: `方向/属性反转：事实要求「${termB}」，正文写为「${termA}」` };
    }
  }

  const negPatterns = normClaim.matchAll(/(?:不可|不能|不得|不会|禁止|不|未|无)([\u4e00-\u9fff]{1,4})/gu);
  for (const match of negPatterns) {
    const predicate = match[1];
    if (!predicate || STOPWORDS_ZH.has(predicate)) continue;
    const affirmRegex = new RegExp(`(?<![不没未非绝无])(?:可以|能够|能|会|允许|直接)${predicate}`, "u");
    if (affirmRegex.test(normSent)) {
      return { polarityConflict: true, directionConflict: false, reason: `极性反转：事实要求「${match[0]}」，正文写为肯定/允许「${predicate}」` };
    }
  }

  const mustPatterns = normClaim.matchAll(/(?:必须|需要|依赖|只有|仅在|才)([\u4e00-\u9fff]{1,5})/gu);
  for (const match of mustPatterns) {
    const target = match[1];
    if (!target || STOPWORDS_ZH.has(target)) continue;
    const negatedMustRegex = new RegExp(`(?:不需要|无需|不必|不用|不依赖|哪怕没有|即使没有)[^，。；]{0,6}${target}`, "u");
    if (negatedMustRegex.test(normSent)) {
      return { polarityConflict: true, directionConflict: false, reason: `必要条件反转：事实要求「${match[0]}」，正文否定了该前置条件` };
    }
  }

  return { polarityConflict: false, directionConflict: false };
}

export function evaluateClaimFidelity(
  haystack: string,
  claim: string,
  customDict?: CustomDictionary
): ClaimFidelityEvaluation {
  const normHaystack = haystack.toLocaleLowerCase().trim();
  const normClaim = claim.toLocaleLowerCase().trim();
  const lexicalSimilarity = computeLexicalOverlap(normHaystack, normClaim, customDict);
  if (!normHaystack || !normClaim) {
    return {
      lexicalSimilarity: 0,
      effectiveSimilarity: 0,
      polarityConflict: false,
      directionConflict: false,
    };
  }

  const candidateSentences = splitSentencesMultilingual(haystack);
  let bestSentence: string | undefined;
  let bestOverlap = -1;
  for (const sent of candidateSentences) {
    const score = computeLexicalOverlap(sent.toLocaleLowerCase(), normClaim, customDict);
    if (score > bestOverlap) {
      bestOverlap = score;
      bestSentence = sent;
    }
  }

  let polarityConflict = false;
  let directionConflict = false;
  let conflictReason: string | undefined;

  for (const sent of candidateSentences) {
    const sentOverlap = computeLexicalOverlap(sent.toLocaleLowerCase(), normClaim, customDict);
    if (sentOverlap < 0.12) continue;
    const check = detectSentenceContradiction(sent, claim);
    if (check.polarityConflict || check.directionConflict) {
      polarityConflict = check.polarityConflict;
      directionConflict = check.directionConflict;
      conflictReason = check.reason;
      bestSentence = sent;
      break;
    }
  }

  const hasConflict = polarityConflict || directionConflict;
  const effectiveSimilarity = hasConflict
    ? Number(Math.min(0.24, lexicalSimilarity * 0.3).toFixed(3))
    : lexicalSimilarity;

  return {
    lexicalSimilarity,
    effectiveSimilarity,
    polarityConflict,
    directionConflict,
    ...(conflictReason ? { conflictReason } : {}),
    ...(bestSentence ? { matchedSentence: bestSentence } : {}),
  };
}

export function computeSemanticSimilarity(
  textA: string,
  textB: string,
  customDict?: CustomDictionary
): number {
  return evaluateClaimFidelity(textA, textB, customDict).effectiveSimilarity;
}
