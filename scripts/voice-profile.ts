#!/usr/bin/env bun
/**
 * Local "write like me" voice profile.
 *
 * Deterministic fingerprint of the user's own samples: sentence length,
 * punctuation, stance, and wording. Persisted as JSON on this machine.
 * It sits beside the 19-author library and is only for drafts the user
 * asked to sound like themselves. No model calls.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { segmentTextLocal } from "./hanlp-helper";
import { stableJson, usageError } from "./shared";

const STOPWORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很",
  "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "与", "及",
  "或", "等", "中", "对", "为", "以", "将", "我们", "他们", "它们", "你们", "这个", "那个", "什么",
  "怎么", "如何", "一个", "一种", "可以", "如果", "因为", "所以", "但是", "然后", "以及", "并且",
  "the", "a", "an", "of", "to", "and", "in", "on", "for", "is", "it", "that", "this", "with",
]);

const HEDGES = ["可能", "也许", "似乎", "大概", "或许", "未必", "说不定"];
const ASSERTIONS = ["一定", "必须", "就是", "明明", "其实", "反正"];

export interface VoiceTopToken {
  token: string;
  count: number;
}

export interface VoiceFingerprint {
  sampleCount: number;
  charCount: number;
  sentence: {
    avgChars: number;
    medianChars: number;
    burstiness: number;
    shortRate: number;
    longRate: number;
  };
  paragraph: {
    avgSentences: number;
  };
  punctuationPer1000: {
    comma: number;
    period: number;
    question: number;
    exclamation: number;
    enumeration: number;
    ellipsis: number;
    dash: number;
    colon: number;
    quote: number;
  };
  stancePer100Sentences: {
    firstPerson: number;
    secondPerson: number;
    hedge: number;
    assertion: number;
    questionSentence: number;
  };
  wording: {
    typeTokenRatio: number;
    topWords: VoiceTopToken[];
    topOpeners: VoiceTopToken[];
  };
}

export interface VoiceProfile {
  id: string;
  createdAt: string;
  updatedAt: string;
  sampleCount: number;
  charCount: number;
  fingerprint: VoiceFingerprint;
  excerpts: string[];
}

export interface VoiceScoreFeature {
  feature: string;
  label: string;
  similarity: number;
  weight: number;
  note: string;
}

export interface VoiceScore {
  score: number;
  features: VoiceScoreFeature[];
  sub_scores: Record<string, number>;
  notes: string[];
}

interface StoreFile {
  version: 1;
  profiles: Record<string, VoiceProfile>;
}

export function defaultVoiceStorePath(): string {
  const fromEnv = process.env.CONVERSION_SKILL_VOICE_STORE;
  if (fromEnv && fromEnv.trim()) return expandHome(fromEnv.trim());
  return join(homedir(), ".conversion-skill", "voice-profiles.json");
}

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function splitVoiceSentences(text: string): string[] {
  return text
    .replace(/\r\n/gu, "\n")
    .split(/(?<=[。！？!?])|\n+/u)
    .map((part) => part.trim())
    .filter((part) => /[\u4e00-\u9fffA-Za-z0-9]/u.test(part));
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/gu, "\n")
    .split(/\n\s*\n/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function countChars(text: string): number {
  return (text.match(/[\u4e00-\u9fffA-Za-z0-9]/gu) ?? []).length;
}

function per1000(count: number, chars: number): number {
  if (chars <= 0) return 0;
  return round1((count / chars) * 1000);
}

function per100(count: number, total: number): number {
  if (total <= 0) return 0;
  return round1((count / total) * 100);
}

function contentTokens(text: string): string[] {
  return segmentTextLocal(text).filter((token) => {
    const cleaned = token.trim().toLowerCase();
    if (cleaned.length < 2) return false;
    if (STOPWORDS.has(cleaned)) return false;
    if (/^[\d\p{P}\s]+$/u.test(cleaned)) return false;
    return /[\u4e00-\u9fffA-Za-z]/u.test(cleaned);
  });
}

function topCounts(items: string[], limit: number): VoiceTopToken[] {
  const freq = new Map<string, number>();
  for (const item of items) freq.set(item, (freq.get(item) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .slice(0, limit)
    .map(([token, count]) => ({ token, count }));
}

export function extractFingerprint(samples: string[]): VoiceFingerprint {
  const usable = samples.map((sample) => sample.trim()).filter((sample) => sample.length > 0);
  const corpus = usable.join("\n\n");
  const sentences = splitVoiceSentences(corpus);
  const lengths = sentences.map((sentence) => countChars(sentence));
  const charCount = countChars(corpus);
  const avgChars = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0;
  const paragraphs = splitParagraphs(corpus);
  const paragraphSentences = paragraphs.map((paragraph) => splitVoiceSentences(paragraph).length).filter((count) => count > 0);
  const tokens = contentTokens(corpus);
  const unique = new Set(tokens).size;
  const sentenceCount = Math.max(1, sentences.length);

  const containsAny = (sentence: string, words: string[]): boolean => words.some((word) => sentence.includes(word));

  return {
    sampleCount: usable.length,
    charCount,
    sentence: {
      avgChars: round1(avgChars),
      medianChars: round1(median(lengths)),
      burstiness: round1(stddev(lengths)),
      shortRate: round3(lengths.filter((length) => length > 0 && length <= 12).length / sentenceCount),
      longRate: round3(lengths.filter((length) => length >= 40).length / sentenceCount),
    },
    paragraph: {
      avgSentences: round1(paragraphSentences.length
        ? paragraphSentences.reduce((sum, value) => sum + value, 0) / paragraphSentences.length
        : 0),
    },
    punctuationPer1000: {
      comma: per1000((corpus.match(/[，,]/gu) ?? []).length, charCount),
      period: per1000((corpus.match(/[。.]/gu) ?? []).length, charCount),
      question: per1000((corpus.match(/[？?]/gu) ?? []).length, charCount),
      exclamation: per1000((corpus.match(/[！!]/gu) ?? []).length, charCount),
      enumeration: per1000((corpus.match(/、/gu) ?? []).length, charCount),
      ellipsis: per1000((corpus.match(/…|\.{3}/gu) ?? []).length, charCount),
      dash: per1000((corpus.match(/——|—|--/gu) ?? []).length, charCount),
      colon: per1000((corpus.match(/[：:]/gu) ?? []).length, charCount),
      quote: per1000((corpus.match(/[「」""]/gu) ?? []).length, charCount),
    },
    stancePer100Sentences: {
      firstPerson: per100(sentences.filter((sentence) => /我|咱/u.test(sentence)).length, sentences.length),
      secondPerson: per100(sentences.filter((sentence) => /你|您/u.test(sentence)).length, sentences.length),
      hedge: per100(sentences.filter((sentence) => containsAny(sentence, HEDGES)).length, sentences.length),
      assertion: per100(sentences.filter((sentence) => containsAny(sentence, ASSERTIONS)).length, sentences.length),
      questionSentence: per100(sentences.filter((sentence) => /[？?]/u.test(sentence)).length, sentences.length),
    },
    wording: {
      typeTokenRatio: tokens.length ? round3(unique / tokens.length) : 0,
      topWords: topCounts(tokens, 12),
      topOpeners: topCounts(
        sentences
          .map((sentence) => contentTokens(sentence)[0] ?? "")
          .filter((token) => token.length >= 2),
        8,
      ),
    },
  };
}

function nearness(actual: number, expected: number, slack: number): number {
  if (slack <= 0) return actual === expected ? 1 : 0;
  const gap = Math.abs(actual - expected);
  return Math.max(0, 1 - gap / (slack * 5));
}

function cosine(left: Record<string, number>, right: Record<string, number>): number {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const key of keys) {
    const a = left[key] ?? 0;
    const b = right[key] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return leftNorm === rightNorm ? 1 : 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function jaccard(left: VoiceTopToken[], right: VoiceTopToken[]): number {
  const a = new Set(left.map((item) => item.token));
  const b = new Set(right.map((item) => item.token));
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function punctuationNote(draft: VoiceFingerprint, profile: VoiceFingerprint): string {
  const keys = Object.keys(profile.punctuationPer1000) as Array<keyof VoiceFingerprint["punctuationPer1000"]>;
  const labels: Record<keyof VoiceFingerprint["punctuationPer1000"], string> = {
    comma: "逗号",
    period: "句号",
    question: "问号",
    exclamation: "叹号",
    enumeration: "顿号",
    ellipsis: "省略号",
    dash: "破折号",
    colon: "冒号",
    quote: "引号",
  };
  let worstKey: keyof VoiceFingerprint["punctuationPer1000"] = "comma";
  let worstGap = -1;
  for (const key of keys) {
    const gap = Math.abs(draft.punctuationPer1000[key] - profile.punctuationPer1000[key]);
    if (gap > worstGap) {
      worstGap = gap;
      worstKey = key;
    }
  }
  const sample = profile.punctuationPer1000[worstKey];
  const current = draft.punctuationPer1000[worstKey];
  if (worstGap < 4) return "";
  const direction = current > sample ? "用得更多" : "用得更少";
  return `样本里${labels[worstKey]}大约每千字 ${sample} 处，这篇${direction}（${current}）。按样本的密度改标点。`;
}

export function scoreAgainstFingerprint(draftText: string, profile: VoiceFingerprint): VoiceScore {
  const draft = extractFingerprint([draftText]);
  const sentence = nearness(draft.sentence.avgChars, profile.sentence.avgChars, 4);
  const rhythm = (nearness(draft.sentence.burstiness, profile.sentence.burstiness, 3)
    + nearness(draft.sentence.shortRate, profile.sentence.shortRate, 0.08)
    + nearness(draft.sentence.longRate, profile.sentence.longRate, 0.08)) / 3;
  const punctuation = cosine(draft.punctuationPer1000, profile.punctuationPer1000);
  const stance = (
    nearness(draft.stancePer100Sentences.firstPerson, profile.stancePer100Sentences.firstPerson, 8)
    + nearness(draft.stancePer100Sentences.secondPerson, profile.stancePer100Sentences.secondPerson, 8)
    + nearness(draft.stancePer100Sentences.hedge, profile.stancePer100Sentences.hedge, 8)
    + nearness(draft.stancePer100Sentences.assertion, profile.stancePer100Sentences.assertion, 8)
    + nearness(draft.stancePer100Sentences.questionSentence, profile.stancePer100Sentences.questionSentence, 8)
  ) / 5;
  const wording = (jaccard(draft.wording.topWords, profile.wording.topWords)
    + nearness(draft.wording.typeTokenRatio, profile.wording.typeTokenRatio, 0.08)) / 2;
  const paragraph = nearness(draft.paragraph.avgSentences, profile.paragraph.avgSentences, 0.6);

  const specs: Array<Omit<VoiceScoreFeature, "similarity" | "note"> & { similarity: number; note: string }> = [
    {
      feature: "sentence_length",
      label: "句长",
      weight: 0.22,
      similarity: sentence,
      note: sentence < 0.75
        ? `样本平均一句 ${profile.sentence.avgChars} 字，这篇是 ${draft.sentence.avgChars} 字。把句子收到样本附近。`
        : "",
    },
    {
      feature: "rhythm",
      label: "起伏",
      weight: 0.16,
      similarity: rhythm,
      note: rhythm < 0.75
        ? `样本句长起伏 ${profile.sentence.burstiness}，这篇是 ${draft.sentence.burstiness}。长短句交错，不要每句一样长，也不要碎成口号。`
        : "",
    },
    {
      feature: "punctuation",
      label: "标点",
      weight: 0.16,
      similarity: punctuation,
      note: punctuation < 0.75 ? punctuationNote(draft, profile) : "",
    },
    {
      feature: "stance",
      label: "立场",
      weight: 0.16,
      similarity: stance,
      note: stance < 0.75
        ? `样本里第一人称句子占 ${profile.stancePer100Sentences.firstPerson}/100，这篇是 ${draft.stancePer100Sentences.firstPerson}/100。人称、问句和「可能/一定」这类口气按样本对齐。`
        : "",
    },
    {
      feature: "wording",
      label: "用词",
      weight: 0.18,
      similarity: wording,
      note: wording < 0.75
        ? `高频词对得少。可以多用样本里反复出现、又跟这件事有关的说法，不要另起一套书面腔。样本常写：${profile.wording.topWords.slice(0, 6).map((item) => item.token).join("、") || "（样本太短，看不出）"}。`
        : "",
    },
    {
      feature: "paragraph",
      label: "段落",
      weight: 0.12,
      similarity: paragraph,
      note: paragraph < 0.75
        ? `样本一段大约 ${profile.paragraph.avgSentences} 句，这篇是 ${draft.paragraph.avgSentences} 句。按这个密度拆段或合并。`
        : "",
    },
  ];

  const features: VoiceScoreFeature[] = specs.map((item) => ({
    feature: item.feature,
    label: item.label,
    weight: item.weight,
    similarity: round3(item.similarity),
    note: item.note,
  }));
  const score = Math.max(0, Math.min(100, Math.round(features.reduce((sum, item) => sum + item.similarity * item.weight, 0) * 100)));
  const sub_scores: Record<string, number> = {};
  for (const feature of features) sub_scores[feature.feature] = Math.round(feature.similarity * 100);
  return {
    score,
    features,
    sub_scores,
    notes: features.map((feature) => feature.note).filter((note) => note.length > 0),
  };
}

function emptyStore(): StoreFile {
  return { version: 1, profiles: {} };
}

export function readVoiceStore(storePath: string): StoreFile {
  const full = resolve(expandHome(storePath));
  if (!existsSync(full)) return emptyStore();
  const parsed = JSON.parse(readFileSync(full, "utf8")) as StoreFile;
  if (!parsed || parsed.version !== 1 || !parsed.profiles) return emptyStore();
  return parsed;
}

function writeVoiceStore(storePath: string, data: StoreFile): void {
  const full = resolve(expandHome(storePath));
  mkdirSync(dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, full);
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!/^[\w\u4e00-\u9fff-]{1,40}$/u.test(trimmed)) {
    throw new Error("声纹名字用 1 到 40 个字母、数字、汉字或连字符。");
  }
  return trimmed;
}

export function importVoiceProfile(options: {
  storePath: string;
  name: string;
  samples: string[];
  now?: string;
}): VoiceProfile {
  const id = assertName(options.name);
  const samples = options.samples.map((sample) => sample.trim()).filter((sample) => countChars(sample) >= 8);
  if (samples.length === 0) throw new Error("至少给一段自己写的文字，去掉空白后还要有 8 个字。");
  const now = options.now ?? new Date().toISOString();
  const store = readVoiceStore(options.storePath);
  const previous = store.profiles[id];
  const fingerprint = extractFingerprint(samples);
  const profile: VoiceProfile = {
    id,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    sampleCount: samples.length,
    charCount: fingerprint.charCount,
    fingerprint,
    excerpts: samples.slice(0, 3).map((sample) => sample.slice(0, 400)),
  };
  store.profiles[id] = profile;
  writeVoiceStore(options.storePath, store);
  return profile;
}

export function listVoiceProfiles(storePath: string): VoiceProfile[] {
  return Object.values(readVoiceStore(storePath).profiles).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id, "zh"));
}

export function getVoiceProfile(storePath: string, name: string): VoiceProfile | undefined {
  return readVoiceStore(storePath).profiles[assertName(name)];
}

export function removeVoiceProfile(storePath: string, name: string): boolean {
  const id = assertName(name);
  const store = readVoiceStore(storePath);
  if (!store.profiles[id]) return false;
  delete store.profiles[id];
  writeVoiceStore(storePath, store);
  return true;
}

export function scoreDraft(storePath: string, name: string, draft: string): { profile: VoiceProfile; score: VoiceScore } {
  const profile = getVoiceProfile(storePath, name);
  if (!profile) throw new Error(`没有名为「${name.trim()}」的声纹。先用 import 导入自己的样本。`);
  if (countChars(draft) < 8) throw new Error("待打分的稿子太短。");
  return { profile, score: scoreAgainstFingerprint(draft, profile.fingerprint) };
}

export function renderFingerprint(profile: VoiceProfile): string {
  const fp = profile.fingerprint;
  const words = fp.wording.topWords.slice(0, 8).map((item) => item.token).join("、") || "（不明显）";
  return [
    `声纹「${profile.id}」  样本 ${profile.sampleCount} 篇  约 ${profile.charCount} 字  更新 ${profile.updatedAt}`,
    `句长 均 ${fp.sentence.avgChars} 字，中位 ${fp.sentence.medianChars}，起伏 ${fp.sentence.burstiness}；短句占比 ${fp.sentence.shortRate}，长句占比 ${fp.sentence.longRate}`,
    `一段大约 ${fp.paragraph.avgSentences} 句。第一人称 ${fp.stancePer100Sentences.firstPerson}/100 句，问句 ${fp.stancePer100Sentences.questionSentence}/100 句。`,
    `常写：${words}`,
  ].join("\n");
}

export function renderVoiceScore(name: string, result: VoiceScore): string {
  const lines = [`与声纹「${name}」的相似度 ${result.score}/100`, ""];
  for (const feature of result.features) {
    lines.push(`- ${feature.label} ${Math.round(feature.similarity * 100)}（权重 ${feature.weight}）`);
    if (feature.note) lines.push(`  ${feature.note}`);
  }
  return lines.join("\n");
}

function readSampleFile(path: string): string {
  const full = resolve(expandHome(path));
  if (!existsSync(full)) usageError(`找不到样本文件：${full}`);
  return readFileSync(full, "utf8");
}

function help(): void {
  process.stdout.write(`按我的文风：本地声纹（不调用模型，不替换 19 位名家库）

用法：
  bun run voice-profile -- import --name 我的 --file ~/a.md --file ~/b.md
  bun run voice-profile -- import --name 我的 --text "一段你自己写的话"
  bun run voice-profile -- list
  bun run voice-profile -- show --name 我的
  bun run voice-profile -- score --name 我的 draft.md
  bun run voice-profile -- score --name 我的 --text "待比较的草稿"
  bun run voice-profile -- remove --name 我的

选项：
  --store <路径>     声纹 JSON，默认 ~/.conversion-skill/voice-profiles.json
  --json             输出 JSON
  --deterministic    JSON 键序固定

只在用户明确要求按自己的文字来写时使用。
`);
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) usageError(`${flag} 需要参数`);
  return value;
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    help();
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const command = argv[0];
  if (!command || command.startsWith("-")) usageError("第一个参数是 import、list、show、score 或 remove");
  let name = "";
  let storePath = defaultVoiceStorePath();
  let json = false;
  let deterministic = false;
  const files: string[] = [];
  const texts: string[] = [];
  const positionals: string[] = [];

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--deterministic") {
      deterministic = true;
      continue;
    }
    if (arg === "--name") {
      name = takeValue(argv, index, "--name");
      index += 1;
      continue;
    }
    if (arg === "--store") {
      storePath = expandHome(takeValue(argv, index, "--store"));
      index += 1;
      continue;
    }
    if (arg === "--file") {
      files.push(takeValue(argv, index, "--file"));
      index += 1;
      continue;
    }
    if (arg === "--text") {
      texts.push(takeValue(argv, index, "--text"));
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) usageError(`未知选项：${arg}`);
    positionals.push(arg);
  }

  const emit = (value: unknown, text: string, code = 0): void => {
    if (json) process.stdout.write(deterministic ? stableJson(value) : `${JSON.stringify(value, null, 2)}\n`);
    else process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    process.exit(code);
  };

  try {
    if (command === "import") {
      const samples = [...texts, ...files.map((file) => readSampleFile(file))];
      const profile = importVoiceProfile({ storePath, name, samples });
      emit(
        { ok: true, profile },
        `${renderFingerprint(profile)}\n已写入 ${storePath}\n`,
      );
    } else if (command === "list") {
      const profiles = listVoiceProfiles(storePath);
      const text = profiles.length === 0
        ? "还没有声纹。用 import 放进几篇你自己的文字。\n"
        : `${profiles.map((profile) => renderFingerprint(profile)).join("\n\n")}\n`;
      emit({ ok: true, profiles }, text);
    } else if (command === "show") {
      const profile = getVoiceProfile(storePath, name);
      if (!profile) usageError(`没有名为「${name}」的声纹。`);
      const excerpt = profile.excerpts.length ? `\n留下的样本摘录 ${profile.excerpts.length} 段。\n` : "\n";
      emit({ ok: true, profile }, `${renderFingerprint(profile)}${excerpt}`);
    } else if (command === "remove") {
      const removed = removeVoiceProfile(storePath, name);
      if (!removed) usageError(`没有名为「${name}」的声纹。`);
      emit({ ok: true, removed: true, id: name.trim() }, `已删除声纹「${name.trim()}」。\n`);
    } else if (command === "score") {
      let draft = texts.join("\n\n");
      if (!draft && files[0]) draft = readSampleFile(files[0]);
      if (!draft && positionals[0]) {
        const candidate = positionals[0];
        draft = existsSync(resolve(expandHome(candidate))) ? readSampleFile(candidate) : candidate;
      }
      const scored = scoreDraft(storePath, name, draft);
      emit(
        { ok: true, profileId: scored.profile.id, ...scored.score },
        `${renderVoiceScore(scored.profile.id, scored.score)}\n`,
      );
    } else {
      usageError(`未知命令：${command}`);
    }
  } catch (error) {
    usageError(error instanceof Error ? error.message : String(error));
  }
}
