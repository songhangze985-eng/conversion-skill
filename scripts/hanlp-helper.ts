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

  const singleLinePenalty = !isVerse && paragraphs.length >= 3 ? Math.max(0, (singleSentenceParagraphRatio - 0.25) * 45) : 0;
  const dotPenalty = Math.min(25, nonEntityMiddleDotCount * 6);
  const bulletPenalty = !isNeutral ? Math.max(0, (bulletLineRatio - 0.1) * 40) : 0;
  const rhythmPenalty = !isVerse && sentLengths.length >= 4 && sentenceLengthCv < 0.25 ? 10 : 0;
  const clichePenalty = Math.min(20, aiClichesFound.length * 5);
  const humanVoiceScore = Math.max(0, Math.min(100, Math.round(100 - singleLinePenalty - dotPenalty - bulletPenalty - rhythmPenalty - clichePenalty)));

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
  const condRegex = /(?:当|如果|若|一旦|在|给定|通过|基于|when|if|given|by)\s*([^，,。；;]+)/i;
  const constraintRegex = /(?:直到|除非|不得|限制|上限|下限|边界|满足|条件是|until|unless|subject to|bounded by)\s*([^，,。；;]+)/i;
  const actionVerbRegex = /([^，,。；;]{1,18}?)(进行|执行|计算|更新|转换|映射|筛选|收敛|触发|生成|验证|分割|聚合|提取|拒绝|回退|传递|调用|更新为|转化为)([^，,。；;]{1,25})|(?:we find that|shows that|causes|increases|reduces)\s+([^.]{8,80})/i;

  for (const s of sentences) {
    const mAction = s.match(actionVerbRegex);
    const mCond = s.match(condRegex);
    const mConst = s.match(constraintRegex);
    if (mAction || mCond || mConst) {
      frames.push({
        sentence: s,
        triggerOrCondition: mCond ? [mCond[1].trim()] : [],
        actorArg0: mAction?.[1]?.trim() ? [mAction[1].trim()] : [],
        predicate: mAction?.[2]?.trim() || (mAction?.[4] ? "find" : "") || "作用/推导",
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

export function computeSemanticSimilarity(
  textA: string,
  textB: string,
  customDict?: CustomDictionary
): number {
  const normA = textA.toLocaleLowerCase().trim();
  const normB = textB.toLocaleLowerCase().trim();
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
