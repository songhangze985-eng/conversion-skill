#!/usr/bin/env bun
/**
 * Thesis-Hitting Keyword Screening & Classical Chinese / Repetitive Article Pithy Vernacular Tool
 * (切中观点的关键词筛选工具 & 自建文言文翻译 JSON 知识库 / 日常与游戏话术类比映射引擎)
 *
 * Usage:
 *   bun run screen-keywords -- "君子曰：学不可以已……君子生非异也，善假于物也。" --habit gaming
 *   bun run screen-keywords -- article.md --markdown
 *   echo "很多人觉得把事情做好靠的是苦熬时间……" | bun run screen-keywords -- - --habit gaming
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { segmentTextLocal, splitSentencesMultilingual } from "./hanlp-helper";
import { printJson, readStdIn, stableJson, usageError } from "./shared";

export type UserHabit = "gaming" | "daily" | "workplace";
export type UserHabitOption = UserHabit | "auto";
export type DiscourseMode = "classical_chinese" | "repetitive_argument" | "mechanism_explanation";
export type NarrativeBoundaryMode = "daily_habit_analogy" | "direct_pithy_gist";

export interface ClassicalParticlePattern {
  id: string;
  token: string;
  regex: string;
  category: string;
  vernacular: string;
  thesis_signal_weight: number;
  explanation: string;
  example: string;
}

export interface ClassicalLexicalEntry {
  word: string;
  classical_meaning: string;
  pithy_vernacular: string;
  is_false_friend: boolean;
  trap_note: string;
}

export interface CanonicalClassicalPassage {
  id: string;
  source: string;
  classical_text: string;
  match_anchors: string[];
  pithy_vernacular: string;
  core_thesis: string;
  thesis_keywords: string[];
  habit_mappings: Record<UserHabit, string>;
}

export interface HabitAnalogyLexiconEntry {
  concept_keywords: string[];
  daily_lingo: string;
}

export interface ClassicalChineseKnowledgeBase {
  schema_version: string;
  name: string;
  description: string;
  particles_and_patterns: ClassicalParticlePattern[];
  lexical_entries: ClassicalLexicalEntry[];
  canonical_passages: CanonicalClassicalPassage[];
  habit_analogy_lexicon: Record<UserHabit, HabitAnalogyLexiconEntry[]>;
}

export interface NarrativeBoundarySpec {
  mode: NarrativeBoundaryMode;
  max_analogy_sentences_per_concept: number;
  forbid_long_story_worldbuilding: boolean;
  recommended_habit: UserHabit;
  boundary_rules: string[];
}

export interface ScreenedKeywordItem {
  keyword: string;
  role: "核心主张" | "关键动作" | "边界条件" | "核心概念";
  thesis_score: number;
  frequency: number;
  anchor_sentence: string;
  gloss?: string;
}

export interface HabitAnalogyMapping {
  concept: string;
  habit: UserHabit;
  habit_label: string;
  daily_lingo_mapping: string;
}

export interface ClassicalTranslationResult {
  is_classical: boolean;
  classical_density: number;
  matched_canonical_source?: string;
  pithy_vernacular: string;
  core_thesis: string;
  matched_particles: Array<{
    token: string;
    category: string;
    vernacular: string;
    explanation: string;
  }>;
  matched_lexical_glosses: ClassicalLexicalEntry[];
  sentence_by_sentence: Array<{
    classical: string;
    vernacular: string;
    is_thesis_sentence: boolean;
  }>;
}

export interface KeywordScreeningReport {
  discourse_mode: DiscourseMode;
  detected_user_habit: UserHabit;
  narrative_boundary: NarrativeBoundarySpec;
  redundancy_ratio: number;
  compression_ratio: number;
  thesis_keywords: ScreenedKeywordItem[];
  filtered_redundant_phrases: string[];
  core_thesis_statement: string;
  pithy_vernacular_summary: string;
  habit_analogy_mappings: HabitAnalogyMapping[];
  classical_translation?: ClassicalTranslationResult;
}

export interface ScreenKeywordsOptions {
  habit?: UserHabitOption;
  topK?: number;
  kbPath?: string;
}

const DEFAULT_KB_PATH = resolve(import.meta.dir, "../assets/knowledge/classical-chinese-kb.json");

let cachedDefaultKb: ClassicalChineseKnowledgeBase | null = null;

export function loadClassicalKnowledgeBase(customPath?: string): ClassicalChineseKnowledgeBase {
  if (!customPath && cachedDefaultKb) return cachedDefaultKb;
  const target = customPath ? resolve(customPath) : DEFAULT_KB_PATH;
  if (!existsSync(target)) {
    usageError(`未找到文言文翻译 JSON 知识库：${target}`);
  }
  const parsed = JSON.parse(readFileSync(target, "utf8")) as ClassicalChineseKnowledgeBase;
  if (!customPath) cachedDefaultKb = parsed;
  return parsed;
}

const GAMING_HABIT_CUES = [
  "游戏", "打游戏", "玩家", "手游", "端游", "王者", "英雄联盟", "lol", "原神", "魔兽",
  "黑神话", "steam", "fps", "moba", "rpg", "技能", "cd", "冷却", "蓝条", "耗蓝",
  "仇恨", "拉怪", "开荒", "副本", "团本", "boss", "读档", "存档", "掉帧", "卡顿",
  "buff", "debuff", "暴击", "词条", "配装", "段位", "上分", "团战", "大招", "闪现",
];

const WORKPLACE_HABIT_CUES = [
  "职场", "上班", "打工人", "项目", "排期", "工单", "周报", "kpi", "okr",
  "跨部门", "审批", "复盘", "汇报", "绩效", "晋升", "会议", "协同",
];

const HABIT_LABELS: Record<UserHabit, string> = {
  gaming: "游戏玩家常用话术",
  daily: "日常生活直觉话术",
  workplace: "职场协作高频话术",
};

export function detectUserHabit(text: string, preferred: UserHabitOption = "auto"): UserHabit {
  if (preferred !== "auto") return preferred;
  const lowered = text.toLocaleLowerCase();
  if (GAMING_HABIT_CUES.some((cue) => lowered.includes(cue))) return "gaming";
  if (WORKPLACE_HABIT_CUES.some((cue) => lowered.includes(cue))) return "workplace";
  return "daily";
}

const CLASSICAL_CHAR_MARKERS = /[之乎者也矣焉哉夫盖以于而则乃其所弗莫未皆悉咸孰殆诚微曰]/gu;
const CLASSICAL_PHRASE_MARKERS = /(?:故曰|是以|然则|君子曰|臣闻|是故|不亦|无乃|何也|非.*也|所以.*也|为.*所|何.*之有|无以|由是观之|由此观之|呜呼|嗟夫)/u;

export function computeClassicalDensity(text: string, kb?: ClassicalChineseKnowledgeBase): number {
  const clean = text.replace(/\s+/gu, "");
  if (clean.length < 6) return 0;
  const loadedKb = kb ?? loadClassicalKnowledgeBase();
  const canonicalHit = loadedKb.canonical_passages.some((p) =>
    p.match_anchors.some((anchor) => clean.includes(anchor))
  );
  if (canonicalHit) return 0.85;

  const charMatches = clean.match(CLASSICAL_CHAR_MARKERS) ?? [];
  const charRatio = charMatches.length / clean.length;
  const hasClassicalPhrase = CLASSICAL_PHRASE_MARKERS.test(clean);
  const modernFunctionRatio = ((clean.match(/[的了着吧呢吗]/gu) ?? []).length) / clean.length;

  let score = charRatio * 2.8 + (hasClassicalPhrase ? 0.35 : 0) - modernFunctionRatio * 1.8;
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

export function isClassicalChineseText(text: string, kb?: ClassicalChineseKnowledgeBase): boolean {
  return computeClassicalDensity(text, kb) >= 0.28;
}

const REPETITIVE_RHETORIC_PHRASES = [
  "换句话说", "也就是说", "说得更直白一点", "再举个例子", "反过来想", "同样的道理",
  "正如我们常说的", "不难看出", "毫无疑问", "再三强调", "反复证明", "从另一个角度看",
  "不仅如此", "更重要的是", "归根到底", "说到底", "总而言之", "综上所述",
  "其实道理都是一样的", "无独有偶", "显而易见", "众所周知",
];

const THESIS_SIGNAL_PATTERNS = [
  /(?:说白了|核心在于|本质上|关键在于|最关键的是|要害在于|说到底|归根结底|其实就一句话|记住一条|底线是|真正决定)[，,：:\s]*([^。！？；\n]{4,60})/u,
  /(?:不是|不在于|并非)[^，。！？；\n]{1,28}[，,]\s*(?:而是|而在于|恰恰是|实则是)([^。！？；\n]{4,60})/u,
  /(?:之所以)[^，。！？；\n]{1,25}[，,]?\s*(?:是因为|全在于|根源在于)([^。！？；\n]{4,60})/u,
  /(?:只有|唯有)[^，。！？；\n]{2,25}[，,]?\s*(?:才|方能)([^。！？；\n]{3,45})/u,
  /(?:故曰|君子曰|臣闻|是以|是故)[：:“「\s]*([^。！？；\n]{4,60})/u,
];

const STOPWORDS_SCREEN = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很",
  "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "与", "及",
  "或", "等", "中", "对", "为", "以", "将", "通过", "进行", "可以", "如果", "因为", "所以", "但是",
  "或者", "以及", "这个", "那个", "什么", "怎么", "如何", "我们", "他们", "它们", "之", "乎", "者",
  "也", "矣", "焉", "哉", "夫", "盖", "于", "而", "则", "乃", "其", "所", "非", "莫", "未", "皆",
  "很多", "许多人", "往往", "其实", "非常", "时候", "事情", "问题", "这种", "那种", "大家", "觉得",
  "认为", "总是", "常常", "不断", "一直", "需要", "应该", "能够", "可能", "不是", "而是", "在于",
  "真正", "决定", "成败", "核心", "关键", "本质", "道理", "例子", "角度", "完全", "根本", "只要",
  "以为", "解决", "不了", "就算", "也是", "白搭", "每天", "十天", "一样", "归根", "结底",
]);

function extractCandidateTermsFromClause(clause: string): string[] {
  const compoundMatches =
    clause.match(/(?:[\u4e00-\u9fff]{2}化[\u4e00-\u9fff]{2}|核心[\u4e00-\u9fff]{2}|关键[\u4e00-\u9fff]{2}|[\u4e00-\u9fff]{2}(?:机制|算法|工具|瓶颈|阈值|模型|策略|底线|原则|定律|定理|协议))/gu) ?? [];
  const rawTokens = segmentTextLocal(clause).filter(
    (tok) =>
      /^[\u4e00-\u9fffA-Za-z0-9-]{2,10}$/u.test(tok) &&
      !STOPWORDS_SCREEN.has(tok.toLocaleLowerCase()) &&
      !REPETITIVE_RHETORIC_PHRASES.includes(tok)
  );
  const merged = [...compoundMatches];
  for (const tok of rawTokens) {
    if (merged.some((m) => m !== tok && m.includes(tok))) continue;
    if (!merged.includes(tok)) merged.push(tok);
  }
  return merged;
}

function translateClassicalClauseByRules(
  clause: string,
  kb: ClassicalChineseKnowledgeBase,
): string {
  let out = clause.trim();
  if (!out) return out;

  // 1. Apply multi-char lexical entries (longest first)
  const sortedLex = [...kb.lexical_entries].sort((a, b) => b.word.length - a.word.length);
  for (const entry of sortedLex) {
    if (entry.word.length >= 2 && out.includes(entry.word)) {
      out = out.split(entry.word).join(entry.pithy_vernacular);
    }
  }

  // 2. Apply structural particle patterns
  for (const pat of kb.particles_and_patterns) {
    try {
      const re = new RegExp(pat.regex, "gu");
      if (re.test(out)) {
        out = out.replace(re, pat.vernacular);
      }
    } catch {
      // ignore invalid regex
    }
  }

  // 3. Apply common single-char classical function/content fallbacks
  const singleCharReplacements: Array<[RegExp, string]> = [
    [/弗敢/gu, "不敢"],
    [/弗/gu, "不"],
    [/莫不/gu, "没有谁不"],
    [/莫/gu, "没有什么"],
    [/未尝/gu, "从来没有"],
    [/皆/gu, "全都"],
    [/悉/gu, "全部"],
    [/咸/gu, "全都"],
    [/必/gu, "一定"],
    [/勿|毋/gu, "不要"],
    [/孰能/gu, "谁能"],
    [/孰/gu, "谁"],
    [/何也/gu, "到底为什么呢"],
    [/是故/gu, "所以"],
    [/由此观之|由是观之/gu, "这样看来"],
    [/无以/gu, "没法用来"],
    [/不亦说乎/gu, "不也很痛快吗"],
    [/矣|焉|哉|耳/gu, ""],
  ];
  for (const [re, rep] of singleCharReplacements) {
    out = out.replace(re, rep);
  }

  return out.trim();
}

export function translateClassicalChinese(
  text: string,
  kb?: ClassicalChineseKnowledgeBase,
): ClassicalTranslationResult {
  const loadedKb = kb ?? loadClassicalKnowledgeBase();
  const density = computeClassicalDensity(text, loadedKb);
  const is_classical = density >= 0.28;

  const cleanText = text.trim();
  const matchedPassages = loadedKb.canonical_passages.filter((p) =>
    p.match_anchors.some((anchor) => cleanText.includes(anchor))
  );
  const primaryPassage = matchedPassages[0];

  const matched_particles = loadedKb.particles_and_patterns
    .filter((pat) => {
      try {
        return new RegExp(pat.regex, "u").test(cleanText);
      } catch {
        return cleanText.includes(pat.token);
      }
    })
    .map((p) => ({
      token: p.token,
      category: p.category,
      vernacular: p.vernacular,
      explanation: p.explanation,
    }));

  const matched_lexical_glosses = loadedKb.lexical_entries.filter((entry) => {
    if (!cleanText.includes(entry.word)) return false;
    if (entry.word === "可以" && /不可以/u.test(cleanText) && !/(?<!不)可以/u.test(cleanText)) {
      return false;
    }
    return true;
  });

  const rawSentences = cleanText
    .split(/(?<=[。！？；!?;])\s*|\r?\n/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentence_by_sentence = rawSentences.map((sent, idx) => {
    const is_thesis_sentence =
      idx === rawSentences.length - 1 ||
      /(?:故曰|是以|是故|君子曰|臣闻|然则|何也|非.*也|者.*也|此.*所以|善假于物|攻守之势异|弊在赂秦|王之蔽甚|彼竭我盈|慎终如始)/u.test(sent);
    const vernacular = translateClassicalClauseByRules(sent, loadedKb);
    return {
      classical: sent,
      vernacular,
      is_thesis_sentence,
    };
  });

  const thesisSentences = sentence_by_sentence.filter((s) => s.is_thesis_sentence);
  const fallbackVernacular =
    (thesisSentences.length > 0 ? thesisSentences : sentence_by_sentence)
      .map((s) => s.vernacular)
      .join(" ");

  return {
    is_classical,
    classical_density: density,
    ...(primaryPassage ? { matched_canonical_source: primaryPassage.source } : {}),
    pithy_vernacular: primaryPassage ? primaryPassage.pithy_vernacular : fallbackVernacular,
    core_thesis: primaryPassage
      ? primaryPassage.core_thesis
      : (thesisSentences[thesisSentences.length - 1]?.vernacular ?? fallbackVernacular),
    matched_particles,
    matched_lexical_glosses,
    sentence_by_sentence,
  };
}

export function detectDiscourseMode(
  text: string,
  kb?: ClassicalChineseKnowledgeBase,
): { mode: DiscourseMode; redundancyRatio: number } {
  const loadedKb = kb ?? loadClassicalKnowledgeBase();
  if (isClassicalChineseText(text, loadedKb)) {
    return { mode: "classical_chinese", redundancyRatio: 0.15 };
  }

  const sentences = splitSentencesMultilingual(text).filter((s) => s.trim().length >= 6);
  if (sentences.length <= 1) {
    return { mode: "mechanism_explanation", redundancyRatio: 0 };
  }

  // Compute concept repetition and rhetoric density across sentences
  const sentenceTokenSets = sentences.map((s) => {
    const toks = segmentTextLocal(s).filter(
      (t) => /^[\u4e00-\u9fffA-Za-z]{2,}$/u.test(t) && !STOPWORDS_SCREEN.has(t.toLocaleLowerCase())
    );
    return new Set(toks);
  });

  let overlappingPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < sentenceTokenSets.length; i++) {
    for (let j = i + 1; j < sentenceTokenSets.length; j++) {
      const a = sentenceTokenSets[i]!;
      const b = sentenceTokenSets[j]!;
      if (a.size === 0 || b.size === 0) continue;
      totalPairs += 1;
      let shared = 0;
      for (const tok of a) {
        if (b.has(tok)) shared += 1;
      }
      const overlap = shared / Math.min(a.size, b.size);
      if (overlap >= 0.34 || shared >= 2) {
        overlappingPairs += 1;
      }
    }
  }

  const pairOverlapRatio = totalPairs > 0 ? overlappingPairs / totalPairs : 0;
  const rhetoricHits = REPETITIVE_RHETORIC_PHRASES.filter((p) => text.includes(p)).length;
  const thesisCueHits = THESIS_SIGNAL_PATTERNS.filter((re) => re.test(text)).length;
  const contrastHits = (text.match(/不是[^。！？]{1,25}而是|不在于[^。！？]{1,25}而在于|换句话说|也就是说|说白了|归根结底/gu) ?? []).length;

  const redundancyRatio = Number(
    Math.min(0.92, pairOverlapRatio * 0.65 + Math.min(0.35, (rhetoricHits + contrastHits) * 0.09)).toFixed(2)
  );

  const isRepetitiveArgument =
    (sentences.length >= 3 && redundancyRatio >= 0.24) ||
    contrastHits >= 2 ||
    (rhetoricHits >= 2 && thesisCueHits >= 1);

  return {
    mode: isRepetitiveArgument ? "repetitive_argument" : "mechanism_explanation",
    redundancyRatio,
  };
}

function classifyKeywordRole(keyword: string, contextSentence: string): ScreenedKeywordItem["role"] {
  if (/(?:必须|不能|不可|底线|前提|除非|一旦|边界|限制|切忌|慎终)/u.test(contextSentence) || /(?:不殆|不施|不宜|不舍)/u.test(keyword)) {
    return "边界条件";
  }
  if (/(?:故曰|是以|结果|最终|导致|核心|本质|说白了|要害|成败)/u.test(contextSentence)) {
    return "核心主张";
  }
  if (/(?:假|借|伐|攻|守|积|拆|分|锁|查|算|切|对齐|筛选)/u.test(keyword)) {
    return "关键动作";
  }
  return "核心概念";
}

export function buildHabitAnalogyMappings(
  keywords: string[],
  fullText: string,
  habit: UserHabit,
  kb: ClassicalChineseKnowledgeBase,
  classicalTranslation?: ClassicalTranslationResult,
): HabitAnalogyMapping[] {
  const results: HabitAnalogyMapping[] = [];
  const usedDescriptions = new Set<string>();

  // 1. Check canonical classical passage habit mapping first
  if (classicalTranslation?.is_classical) {
    const matchedPassage = kb.canonical_passages.find((p) =>
      p.match_anchors.some((anchor) => fullText.includes(anchor))
    );
    if (matchedPassage && matchedPassage.habit_mappings[habit]) {
      const mappingText = matchedPassage.habit_mappings[habit];
      usedDescriptions.add(mappingText);
      results.push({
        concept: matchedPassage.thesis_keywords[0] ?? matchedPassage.source,
        habit,
        habit_label: HABIT_LABELS[habit],
        daily_lingo_mapping: mappingText,
      });
    }
  }

  // 2. Match against habit_analogy_lexicon
  const lexicon = kb.habit_analogy_lexicon[habit] ?? kb.habit_analogy_lexicon.daily;
  const loweredFull = fullText.toLocaleLowerCase();
  for (const entry of lexicon) {
    const matchedKey = entry.concept_keywords.find(
      (k) => loweredFull.includes(k.toLocaleLowerCase()) || keywords.some((kw) => kw.toLocaleLowerCase().includes(k.toLocaleLowerCase()))
    );
    if (matchedKey && !usedDescriptions.has(entry.daily_lingo)) {
      usedDescriptions.add(entry.daily_lingo);
      results.push({
        concept: matchedKey,
        habit,
        habit_label: HABIT_LABELS[habit],
        daily_lingo_mapping: entry.daily_lingo,
      });
    }
  }

  // 3. Fallback concise habit mapping if no preset entry matched
  if (results.length === 0 && keywords.length > 0) {
    const topKw = keywords[0]!;
    const secondKw = keywords[1] ?? "执行动作";
    const fallbackByHabit: Record<UserHabit, string> = {
      gaming: `就像打游戏做核心决策，别在花哨的支线特效上空耗蓝条，直接把所有技能资源和注意力锁死在「${topKw}」与「${secondKw}」这个胜负手机制上。`,
      daily: `就像日常收拾屋子或办事，先把杂七杂八的包装盒扔掉，只盯住「${topKw}」和「${secondKw}」这两件真正起作用的事。`,
      workplace: `就像推进核心项目，砍掉拉锯扯皮的形式主义会议，直接对齐「${topKw}」与「${secondKw}」两个交付指标。`,
    };
    results.push({
      concept: topKw,
      habit,
      habit_label: HABIT_LABELS[habit],
      daily_lingo_mapping: fallbackByHabit[habit],
    });
  }

  return results.slice(0, 3);
}

export function screenThesisKeywords(
  text: string,
  options: ScreenKeywordsOptions = {},
): KeywordScreeningReport {
  const kb = loadClassicalKnowledgeBase(options.kbPath);
  const topK = options.topK ?? 5;
  const detected_user_habit = detectUserHabit(text, options.habit ?? "auto");
  const { mode: discourse_mode, redundancyRatio } = detectDiscourseMode(text, kb);

  const classical_translation =
    discourse_mode === "classical_chinese" ? translateClassicalChinese(text, kb) : undefined;

  const isConciseGistMode =
    discourse_mode === "classical_chinese" || discourse_mode === "repetitive_argument";

  const narrative_boundary: NarrativeBoundarySpec = {
    mode: isConciseGistMode ? "direct_pithy_gist" : "daily_habit_analogy",
    max_analogy_sentences_per_concept: isConciseGistMode ? 1 : 2,
    forbid_long_story_worldbuilding: true,
    recommended_habit: detected_user_habit,
    boundary_rules: isConciseGistMode
      ? [
          "针对文言文或重复强调观点的文章，开启「直击要害·极简白话」模式，严禁扩写成注水剧情故事。",
          "先合并同类车轱辘话或破译古今异义词，用 1 句最简白话直给核心观点。",
          `如需辅助直觉，仅附 1 句「${HABIT_LABELS[detected_user_habit]}」类比点睛，绝不展开虚构人物背景。`,
        ]
      : [
          "通俗易懂不是长篇大论讲故事，而是「日常/用户习惯话术」精准类比映射。",
          `优先采用用户熟悉的「${HABIT_LABELS[detected_user_habit]}」进行一对一机制对位，单个概念类比控制在 1–2 句以内。`,
          "严禁在正文中铺垫与机制无关的天气、外貌、寒暄或架空世界观注水。",
        ],
  };

  const sentences = splitSentencesMultilingual(text).filter((s) => s.trim().length >= 4);
  const filtered_redundant_phrases = REPETITIVE_RHETORIC_PHRASES.filter((p) => text.includes(p));

  // Score candidate keywords
  const candidateScores = new Map<
    string,
    { freq: number; score: number; bestSentence: string; gloss?: string }
  >();

  // Boost canonical classical thesis keywords if applicable
  if (classical_translation?.is_classical) {
    const matchedCanonical = kb.canonical_passages.find((p) =>
      p.match_anchors.some((anchor) => text.includes(anchor))
    );
    if (matchedCanonical) {
      for (const kw of matchedCanonical.thesis_keywords) {
        const anchorSent = sentences.find((s) => s.includes(kw)) ?? sentences[sentences.length - 1] ?? text;
        const lex =
          kb.lexical_entries.find((l) => l.word === kw) ??
          kb.lexical_entries.find((l) => kw.includes(l.word) && l.word !== "可以");
        candidateScores.set(kw, {
          freq: Math.max(1, (text.match(new RegExp(kw, "gu")) ?? []).length),
          score: 0.95,
          bestSentence: anchorSent,
          gloss: lex?.pithy_vernacular,
        });
      }
    }
    for (const gloss of classical_translation.matched_lexical_glosses) {
      if (!candidateScores.has(gloss.word)) {
        const anchorSent = sentences.find((s) => s.includes(gloss.word)) ?? sentences[0] ?? text;
        candidateScores.set(gloss.word, {
          freq: Math.max(1, (text.match(new RegExp(gloss.word, "gu")) ?? []).length),
          score: gloss.is_false_friend ? 0.88 : 0.82,
          bestSentence: anchorSent,
          gloss: `${gloss.pithy_vernacular}（${gloss.classical_meaning}）`,
        });
      }
    }
  }

  sentences.forEach((sent, idx) => {
    const isOpeningOrClosing = idx === 0 || idx === sentences.length - 1;
    const hasThesisSignal = THESIS_SIGNAL_PATTERNS.some((re) => re.test(sent));
    const hasAffirmativeContrast = /(?:而是|而在于|恰恰是|实则是|唯|善假于物|攻守之势异|弊在赂秦)/u.test(sent);

    // Focus on the affirmative part if sentence has "不是...而是..."
    let effectivePart = sent;
    const contrastSplit = sent.split(/(?:而是|而在于|恰恰是|实则是)/u);
    if (contrastSplit.length >= 2) {
      effectivePart = contrastSplit.slice(1).join(" ");
    }

    const tokens = extractCandidateTermsFromClause(effectivePart);

    for (const tok of tokens) {
      const existing = candidateScores.get(tok) ?? {
        freq: 0,
        score: 0.25,
        bestSentence: sent,
      };
      existing.freq += 1;
      let delta = 0.14;
      if (isOpeningOrClosing) delta += 0.12;
      if (hasThesisSignal) {
        delta += 0.28;
        existing.bestSentence = sent;
      }
      if (hasAffirmativeContrast) {
        delta += 0.22;
        existing.bestSentence = sent;
      }
      existing.score = Math.min(0.99, existing.score + delta);
      candidateScores.set(tok, existing);
    }
  });

  const rawSorted = [...candidateScores.entries()].sort(
    (a, b) => b[1].score - a[1].score || b[1].freq - a[1].freq || b[0].length - a[0].length
  );
  const deduplicatedEntries: Array<[string, { freq: number; score: number; bestSentence: string; gloss?: string }]> = [];
  for (const [kw, info] of rawSorted) {
    if (deduplicatedEntries.some(([existingKw]) => existingKw !== kw && existingKw.includes(kw))) {
      continue;
    }
    deduplicatedEntries.push([kw, info]);
    if (deduplicatedEntries.length >= topK) break;
  }

  const sortedKeywords: ScreenedKeywordItem[] = deduplicatedEntries.map(([keyword, info]) => ({
    keyword,
    role: classifyKeywordRole(keyword, info.bestSentence),
    thesis_score: Number(info.score.toFixed(2)),
    frequency: info.freq,
    anchor_sentence: info.bestSentence,
    ...(info.gloss ? { gloss: info.gloss } : {}),
  }));

  // Extract sharpest thesis statement & pithy vernacular summary
  let core_thesis_statement = "";
  let pithy_vernacular_summary = "";

  if (classical_translation?.is_classical) {
    core_thesis_statement = classical_translation.core_thesis;
    pithy_vernacular_summary = classical_translation.pithy_vernacular;
  } else {
    // Look for explicit thesis pattern match first
    for (const sent of sentences) {
      for (const pattern of THESIS_SIGNAL_PATTERNS) {
        const match = pattern.exec(sent);
        if (match?.[1]) {
          core_thesis_statement = match[1].trim().replace(/[。！？；!?;]+$/u, "");
          break;
        }
      }
      if (core_thesis_statement) break;
    }

    if (!core_thesis_statement) {
      const bestSent = sortedKeywords[0]?.anchor_sentence ?? sentences[sentences.length - 1] ?? text.trim();
      core_thesis_statement = bestSent.trim().replace(/[。！？；!?;]+$/u, "");
    }

    const topKwNames = sortedKeywords.slice(0, 3).map((k) => k.keyword);
    pithy_vernacular_summary =
      discourse_mode === "repetitive_argument"
        ? `全文反复强调的核心就一句话：${core_thesis_statement}。（核心抓手：${topKwNames.join("、")}）`
        : `${core_thesis_statement}。（关键机制词：${topKwNames.join("、")}）`;
  }

  const compression_ratio =
    text.trim().length > 0
      ? Number(Math.max(0.1, Math.min(0.95, 1 - pithy_vernacular_summary.length / text.trim().length)).toFixed(2))
      : 0;

  const habit_analogy_mappings = buildHabitAnalogyMappings(
    sortedKeywords.map((k) => k.keyword),
    text,
    detected_user_habit,
    kb,
    classical_translation,
  );

  return {
    discourse_mode,
    detected_user_habit,
    narrative_boundary,
    redundancy_ratio: redundancyRatio,
    compression_ratio,
    thesis_keywords: sortedKeywords,
    filtered_redundant_phrases,
    core_thesis_statement,
    pithy_vernacular_summary,
    habit_analogy_mappings,
    ...(classical_translation ? { classical_translation } : {}),
  };
}

export function renderKeywordScreeningMarkdown(report: KeywordScreeningReport): string {
  const modeLabel: Record<DiscourseMode, string> = {
    classical_chinese: "文言文/古籍经典（直击要害·极简白话破译）",
    repetitive_argument: "重复观点议论文（脱水去重·切中要害）",
    mechanism_explanation: "复杂知识机制（日常/习惯话术精准映射）",
  };

  const lines: string[] = [
    "# 切中观点·极简白话与话术映射报告",
    "",
    `- **识别文体模式**：${modeLabel[report.discourse_mode]}`,
    `- **叙述边界模式**：\`${report.narrative_boundary.mode}\`（单点类比上限 <= ${report.narrative_boundary.max_analogy_sentences_per_concept} 句，严禁长篇剧情注水）`,
    `- **适配用户习惯**：${HABIT_LABELS[report.detected_user_habit]}（\`${report.detected_user_habit}\`）`,
    `- **原文冗余度 / 脱水压缩率**：冗余度 ${Math.round(report.redundancy_ratio * 100)}% / 压缩率 ${Math.round(report.compression_ratio * 100)}%`,
    "",
    "## 1. 最简白话阐述（切中要害）",
    "",
    `> **核心要害一句话**：${report.core_thesis_statement}`,
    "",
    report.pithy_vernacular_summary,
    "",
    "## 2. 切中观点的关键词筛选",
    "",
    "| 关键词 | 观点角色 | 靶心权重 | 频次 | 词义/锚点说明 |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const item of report.thesis_keywords) {
    const note = item.gloss ? `${item.gloss} — 「${item.anchor_sentence}」` : `「${item.anchor_sentence}」`;
    lines.push(`| **${item.keyword}** | ${item.role} | ${item.thesis_score} | ${item.frequency} | ${note} |`);
  }

  if (report.classical_translation?.is_classical) {
    const ct = report.classical_translation;
    lines.push("", "## 3. 文言文知识库破译对照");
    if (ct.matched_canonical_source) {
      lines.push(`- **命中经典篇目**：${ct.matched_canonical_source}`);
    }
    const falseFriends = ct.matched_lexical_glosses.filter((g) => g.is_false_friend);
    if (falseFriends.length > 0) {
      lines.push("- **古今异义防坑预警**：");
      for (const ff of falseFriends) {
        lines.push(`  - 「**${ff.word}**」：今译为「**${ff.pithy_vernacular}**」（${ff.trap_note}）`);
      }
    }
    if (ct.matched_particles.length > 0) {
      lines.push("- **关键文言虚词/句式**：");
      for (const pat of ct.matched_particles) {
        lines.push(`  - 「**${pat.token}**」（${pat.category}）：${pat.explanation}`);
      }
    }
  }

  lines.push("", `## ${report.classical_translation?.is_classical ? "4" : "3"}. 日常/用户习惯话术类比映射（不讲长篇故事）`);
  for (const mapping of report.habit_analogy_mappings) {
    lines.push(`- **【${mapping.habit_label} · ${mapping.concept}】**：${mapping.daily_lingo_mapping}`);
  }

  lines.push("", "## 叙述边界铁律");
  for (const rule of report.narrative_boundary.boundary_rules) {
    lines.push(`- ${rule}`);
  }

  return `${lines.join("\n")}\n`;
}

function help(): void {
  process.stdout.write(`切中观点的关键词筛选与文言文/重复观点极简白话工具（Bun/TypeScript）\n\n用法：\n  bun run screen-keywords -- "君子曰：学不可以已……君子生非异也，善假于物也。" --habit gaming\n  bun run screen-keywords -- article.md --markdown\n  echo "待分析文本" | bun run screen-keywords -- - --habit gaming\n\n选项：\n  --habit <auto|gaming|daily|workplace>  指定用户日常习惯类比域（默认 auto，自动识别游戏/职场/日常）\n  --top <N>                              筛选切中观点的核心关键词数量（默认 5）\n  --kb <路径>                            指定自定义文言文翻译 JSON 知识库路径\n  --markdown                             输出 Markdown 格式的极简白话与关键词筛选报告\n  --json                                 输出 JSON 结构（默认）\n  --deterministic                        稳定键序输出 JSON\n`);
}

async function main(argv: string[]): Promise<void> {
  let habit: UserHabitOption = "auto";
  let topK = 5;
  let kbPath: string | undefined;
  let markdownMode = false;
  let deterministic = false;
  let positional: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help();
      return;
    }
    if (arg === "--habit") {
      const val = argv[i + 1] as UserHabitOption | undefined;
      if (!val || !["auto", "gaming", "daily", "workplace"].includes(val)) {
        usageError("--habit 只能是 auto、gaming、daily 或 workplace");
      }
      habit = val;
      i += 1;
      continue;
    }
    if (arg === "--top") {
      const val = Number(argv[i + 1]);
      if (!Number.isInteger(val) || val < 1 || val > 20) {
        usageError("--top 需要 1 到 20 之间的整数");
      }
      topK = val;
      i += 1;
      continue;
    }
    if (arg === "--kb") {
      kbPath = argv[i + 1];
      if (!kbPath) usageError("--kb 需要 JSON 知识库路径");
      i += 1;
      continue;
    }
    if (arg === "--markdown") {
      markdownMode = true;
      continue;
    }
    if (arg === "--json") {
      markdownMode = false;
      continue;
    }
    if (arg === "--deterministic") {
      deterministic = true;
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") {
      usageError(`未知选项：${arg}`);
    }
    if (positional !== undefined) {
      usageError("只接受一段文本或一个文件路径");
    }
    positional = arg;
  }

  let rawText = "";
  if (positional === undefined || positional === "-") {
    rawText = await readStdIn();
  } else if (existsSync(positional)) {
    rawText = readFileSync(positional, "utf8");
  } else {
    rawText = positional;
  }

  if (!rawText.trim()) {
    usageError("输入文本不能为空");
  }

  const report = screenThesisKeywords(rawText, { habit, topK, kbPath });
  if (markdownMode) {
    process.stdout.write(renderKeywordScreeningMarkdown(report));
  } else if (deterministic) {
    process.stdout.write(stableJson(report));
  } else {
    printJson(report);
  }
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
