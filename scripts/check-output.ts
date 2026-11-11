#!/usr/bin/env bun
/**
 * Mechanical validation for converted Markdown.
 *
 * `verdict` remains the mechanical gate: structure plus optional fact-term/ID
 * coverage. It is not a claim that the explanation is semantically correct or
 * that a reader understood the mechanism. Semantic quality and comprehension
 * are always reported as needing human or model review.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { analyzeWithHanLP, analyzeWithHanLPSync, consumeHanlpArg, evaluateClaimFidelity, evaluateGrammarInspection, evaluateHumanVoiceAndAntiSlop, evaluateTextRecognitionJudgment, loadCustomDictionary, parseHanLPCliOptions, resolveAuthorGateProfile, segmentTextLocal, splitSentencesMultilingual, type HanLPDocumentAnalysis, type HanLPOptions, type HumanVoiceDiagnostics, type TextRecognitionJudgment } from "./hanlp-helper";
import { renderKeywordScreeningMarkdown, screenThesisKeywords, type UserHabitOption } from "./screen-keywords";
import {
  EXPRESSION_STYLES,
  LEVEL_LIMITS,
  hanlpTokenCount,
  isExpressionStyle,
  isOutputLevel,
  markdownWordCount,
  normalizedContains,
  semanticContains,
  stableJson,
  type ExpressionStyle,
  type OutputLevel,
  usageError,
} from "./shared";

const VOICE_LEAKS = [
  "卡文了，稍等",
  "封禁中",
  "没有稿费我可不写",
  "这么多！是让我写水文吗",
  "水文ing，有事请拨打10086",
];

const SOURCE_HEADERS = ["知识概念", "专业概念", "原始概念"];
const STORY_HEADERS = ["故事元素", "表达元素", "类比元素"];
const REASON_HEADERS = ["对应理由", "映射理由", "对应机制"];
const BOUNDARY_HEADERS = ["适用边界", "类比边界", "不成立之处"];

export interface FactAnchor {
  page: number;
  section: string;
}

export interface LedgerFact {
  id: string;
  claim: string;
  kind?: string;
  sourcePages?: number[];
  required_terms?: string[];
  mapping_terms?: string[];
  anchor?: FactAnchor;
}

export interface FactLedger {
  schema_version?: "1.0";
  review_status?: "verified" | "draft" | "needs-review";
  facts: LedgerFact[];
}

export type GateVerdict = "PASS" | "FAIL";
export type ReviewVerdict = "NEEDS_REVIEW" | "HANLP_ASSISTED_PASS" | "HANLP_ASSISTED_WARN" | "HANLP_NEURAL_PASS" | "HANLP_NEURAL_WARN" | "LOCAL_HEURISTIC_PASS" | "LOCAL_HEURISTIC_WARN";
export type ComprehensionVerdict = "NOT_REQUESTED" | "STRUCTURE_PRESENT_NEEDS_REVIEW";

interface MappingRow {
  source: string;
  story: string;
  reason: string;
  mechanism?: string;
  boundary?: string;
}

interface MappingCheck {
  ok: boolean;
  rows: MappingRow[];
  error?: string;
}

interface LoadedLedger {
  provided: boolean;
  path?: string;
  valid: boolean;
  errors: string[];
  facts: LedgerFact[];
}

export interface OutputCheckOptions {
  level: OutputLevel;
  expectedStyle?: ExpressionStyle;
  authorProfile?: string;
  factsPath?: string;
  requireFacts?: boolean;
  hanlpOptions?: HanLPOptions;
  stsThreshold?: number;
  maxDepDepth?: number;
  strictHumanVoice?: boolean;
  enforceBaselineFloor?: boolean;
  precomputedStoryNlp?: HanLPDocumentAnalysis;
  chunk?: number | "all";
  textJudgment?: boolean;
  readmeReview?: boolean;
}

export interface ExpressionBaselineThresholds {
  minParagraphCount: number;
  minAvgSentencesPerParagraph: number;
  maxSingleSentenceParagraphRatio: number;
  minAvgParagraphChars: number;
  maxNonEntityMiddleDots: number;
  maxNarrativeBulletRatio: number;
  minSentenceLengthCv: number;
  maxUnbrokenClauseChars: number;
  minMappingRows: number;
  minBoundaryCellChars: number;
  minVerificationChars: number;
  minCausalStageCount: number;
  minHumanVoiceScore: number;
  minReadabilityScore: number;
}

export const DEFAULT_EXPRESSION_BASELINE: ExpressionBaselineThresholds = {
  minParagraphCount: 3,
  minAvgSentencesPerParagraph: 2,
  maxSingleSentenceParagraphRatio: 0.3,
  minAvgParagraphChars: 60,
  maxNonEntityMiddleDots: 0,
  maxNarrativeBulletRatio: 0.1,
  minSentenceLengthCv: 0.22,
  maxUnbrokenClauseChars: 38,
  minMappingRows: 3,
  minBoundaryCellChars: 6,
  minVerificationChars: 45,
  minCausalStageCount: 3,
  minHumanVoiceScore: 75,
  minReadabilityScore: 75,
};

export interface ExpressionBaselineReport {
  baseline_verdict: GateVerdict;
  thresholds: ExpressionBaselineThresholds;
  metrics: Record<string, number | string | string[]>;
  violations: string[];
}

export interface HanLPQualityReport {
  backend: string;
  story_token_count: number;
  max_dep_tree_depth: number;
  avg_dep_tree_depth: number;
  complex_sentences: Array<{ sentence: string; tokenCount: number; treeDepth: number }>;
  unexplained_jargon: string[];
  fact_semantic_scores: Array<{ fact_id: string; claim_similarity: number; matched_semantically: boolean; conflict_reason?: string }>;
  semantic_conflicts?: Array<{ fact_id: string; reason: string; sentence?: string }>;
  lao_yu_readability_score: number;
  human_voice_diagnostics: HumanVoiceDiagnostics;
  syntax_analysis_source: "hanlp_neural_dep" | "local_heuristic_estimate";
  readability_note: string;
}

export interface MermaidDiagnostics {
  block_count: number;
  valid: boolean;
  errors: string[];
}

export interface ChunkCheckReport {
  chunk_index: number;
  heading: string;
  word_count: number;
  paragraph_count: number;
  avg_sentences_per_paragraph: number;
  single_sentence_paragraph_ratio: number;
  non_entity_middle_dots: number;
  bullet_line_ratio: number;
  human_voice_score: number;
  readability_score: number;
  verdict: GateVerdict;
  violations: string[];
}

export interface OutputCheckResult {
  has_mapping_table: boolean;
  mapping_error?: string;
  mapping_row_count: number;
  has_verify: boolean;
  word_count: number;
  level: OutputLevel;
  level_ok: boolean;
  level_msg: string;
  style: string | null;
  style_ok: boolean;
  expected_style?: ExpressionStyle;
  voice_leaks: string[];
  leak_ok: boolean;
  facts_provided: boolean;
  facts_path?: string;
  fact_ledger_valid: boolean;
  fact_ledger_errors: string[];
  covered: string[];
  missing: string[];
  mapping_missing: string[];
  cover_ok: boolean;
  has_mapping_bounds: boolean;
  has_comprehension_section: boolean;
  structure_verdict: GateVerdict;
  term_id_coverage_verdict: GateVerdict;
  semantic_quality_verdict: ReviewVerdict;
  comprehension_verdict: ComprehensionVerdict;
  verdict_scope: "mechanical_only";
  verdict: "PASS" | "FAIL";
  hanlp_report?: HanLPQualityReport;
  expression_baseline_verdict?: GateVerdict;
  expression_baseline_report?: ExpressionBaselineReport;
  chunk_reports?: ChunkCheckReport[];
  chunk_verdict?: GateVerdict;
  mermaid_diagnostics?: MermaidDiagnostics;
  text_recognition_judgment?: TextRecognitionJudgment;
}

export function readMarkdown(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    usageError(`无法读取 Markdown 文件 ${path}：${error instanceof Error ? error.message : String(error)}`);
  }
}

function splitTableLine(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isDividerRow(cells: string[]): boolean {
  return cells.length >= 3 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

export function checkMappingTable(markdown: string): MappingCheck {
  const lines = markdown.split(/\r?\n/u);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes("|")) continue;
    const headers = splitTableLine(lines[index]);
    const sourceIndex = findHeaderIndex(headers, SOURCE_HEADERS);
    const storyIndex = findHeaderIndex(headers, STORY_HEADERS);
    const reasonIndex = findHeaderIndex(headers, REASON_HEADERS);
    const boundaryIndex = findHeaderIndex(headers, BOUNDARY_HEADERS);
    if (sourceIndex < 0 || storyIndex < 0 || reasonIndex < 0) continue;

    const divider = splitTableLine(lines[index + 1] ?? "");
    if (!isDividerRow(divider)) {
      return { ok: false, rows: [], error: "映射表缺少有效的 Markdown 分隔行" };
    }

    const rows: MappingRow[] = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const rowLine = lines[rowIndex];
      if (!rowLine.trim()) break;
      if (!rowLine.includes("|")) break;
      const cells = splitTableLine(rowLine);
      const source = cells[sourceIndex] ?? "";
      const story = cells[storyIndex] ?? "";
      const reason = cells[reasonIndex] ?? "";
      const boundary = boundaryIndex >= 0 ? (cells[boundaryIndex] ?? "") : "";
      if (!source || !story || !reason) {
        return { ok: false, rows, error: "映射表存在空的知识概念、故事元素或对应理由单元格" };
      }
      if (boundaryIndex >= 0 && !boundary) {
        return { ok: false, rows, error: "映射表声明了适用边界列，但存在空单元格" };
      }
      rows.push({
        source,
        story,
        reason,
        mechanism: headers[reasonIndex]?.includes("机制") ? reason : undefined,
        boundary: boundary || undefined,
      });
    }
    if (rows.length === 0) return { ok: false, rows, error: "映射表没有任何非空数据行" };
    return { ok: true, rows };
  }
  return {
    ok: false,
    rows: [],
    error: "缺失映射表（需包含 '### 3. 意象映射'、'## 概念与映射'、'## 机制与演化映射' 或 '| 知识概念 |' 表头，且列中有知识概念、类比元素与对应机制）",
  };
}

function sectionAfterHeading(markdown: string, heading: RegExp): string {
  const match = heading.exec(markdown);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const remainder = markdown.slice(start);
  const next = /^#{1,6}\s+/mu.exec(remainder);
  return (next ? remainder.slice(0, next.index) : remainder).trim();
}

export function storyBody(markdown: string): string {
  const heading = /^#{1,6}\s*(?:✨\s*)?(?:文章)?正文\s*$/mu;
  const found = heading.exec(markdown);
  if (!found || found.index === undefined) return markdown;
  const remainder = markdown.slice(found.index + found[0].length);
  const verificationHeading = /^#{1,6}\s*.*知识点校验.*$/mu.exec(remainder);
  return (verificationHeading ? remainder.slice(0, verificationHeading.index) : remainder).trim();
}

export function verificationText(markdown: string): string {
  return sectionAfterHeading(markdown, /^#{1,6}\s*.*知识点校验.*$/mu);
}

export function comprehensionText(markdown: string): string {
  return sectionAfterHeading(markdown, /^#{1,6}\s*.*理解检验.*$/mu);
}

export function hasComprehensionSection(markdown: string): boolean {
  return /^#{1,6}\s*.*理解检验.*$/mu.test(markdown);
}

function verificationOk(markdown: string): boolean {
  const text = verificationText(markdown);
  const meaningful = text
    .split(/\r?\n/u)
    .map((line) => line.replace(/^[-*]\s*/u, "").trim())
    .filter((line) => line.length >= 12)
    .filter((line) => !/^(?:用\s*)?1-3\s*句严谨复述.*[：:]?$/u.test(line));
  return meaningful.length > 0;
}

function declaredStyle(markdown: string): string | null {
  const strict = /^>\s*(?:表达风格|风格标签|皮肤)\s*[：:]\s*`?([a-z-]+)`?\s*$/mu.exec(markdown);
  if (strict?.[1]) return strict[1];
  const loose = /(?:表达风格|风格标签)\s*[:：]\s*`([a-z-]+)`/iu.exec(markdown);
  return loose?.[1] ?? null;
}

function loadFactLedger(path: string | undefined, mapping: MappingCheck, requireFacts: boolean): LoadedLedger {
  if (!path) {
    if (requireFacts) {
      return { provided: false, valid: false, errors: ["严格校验需要 --facts <已核验事实清单.json>"], facts: [] };
    }
  const facts = mapping.rows.map((row, index): LedgerFact => ({
      id: `M${index + 1}`,
      claim: row.source,
      required_terms: [row.source],
      mapping_terms: [row.source],
    }));
    return {
      provided: false,
      valid: mapping.ok && facts.length > 0,
      errors: mapping.ok && facts.length > 0 ? [] : ["无法从映射表推导概念覆盖检查"],
      facts,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { provided: true, path, valid: false, errors: [`无法读取事实清单：${error instanceof Error ? error.message : String(error)}`], facts: [] };
  }

  const errors: string[] = [];
  const ledger = parsed as Partial<FactLedger>;
  if (ledger.schema_version !== undefined && ledger.schema_version !== "1.0") errors.push("事实清单 schema_version 只能是 \"1.0\"");
  if (ledger.review_status !== undefined && ledger.review_status !== "verified") errors.push("事实清单必须经人工或模型核验后标记 review_status: \"verified\"");
  if (!Array.isArray(ledger.facts) || ledger.facts.length === 0) {
    errors.push("事实清单至少需要一条事实");
  }

  const facts: LedgerFact[] = [];
  for (const raw of Array.isArray(ledger.facts) ? ledger.facts : []) {
    const fact = raw as Partial<LedgerFact>;
    if (!fact.id || !fact.claim) {
      errors.push("每条事实都需要 id 和 claim");
      continue;
    }
    const sourcePages = fact.sourcePages;
    const anchor = fact.anchor;
    const hasSourcePages = Array.isArray(sourcePages) && sourcePages.length > 0 && sourcePages.every((page) => Number.isInteger(page) && page >= 1);
    const hasAnchor = Boolean(anchor && Number.isInteger(anchor.page) && anchor.page >= 1 && typeof anchor.section === "string" && anchor.section.trim());
    if (!hasSourcePages && !hasAnchor) {
      errors.push(`事实 ${fact.id} 需要 sourcePages（页码数组）或 anchor（页码与章节）`);
      continue;
    }
    if (fact.required_terms !== undefined && (!Array.isArray(fact.required_terms) || fact.required_terms.some((term) => typeof term !== "string" || !term.trim()))) {
      errors.push(`事实 ${fact.id} 的 required_terms 必须是非空字符串数组`);
      continue;
    }
    if (fact.mapping_terms !== undefined && (!Array.isArray(fact.mapping_terms) || fact.mapping_terms.some((term) => typeof term !== "string" || !term.trim()))) {
      errors.push(`事实 ${fact.id} 的 mapping_terms 必须是非空字符串数组`);
      continue;
    }
    facts.push({
      id: fact.id,
      claim: fact.claim,
      kind: fact.kind,
      sourcePages: hasSourcePages ? sourcePages : undefined,
      required_terms: fact.required_terms,
      mapping_terms: fact.mapping_terms,
      anchor: hasAnchor ? anchor : undefined,
    });
  }
  return { provided: true, path, valid: errors.length === 0 && facts.length > 0, errors, facts };
}

function factCoverage(
  markdown: string,
  mapping: MappingCheck,
  ledger: LoadedLedger,
  semantic?: { threshold: number; dictPath?: string },
): { covered: string[]; missing: string[]; mappingMissing: string[]; ok: boolean } {
  const content = `${storyBody(markdown)}\n${verificationText(markdown)}`;
  const mappingText = mapping.rows.map((row) => `${row.source}\n${row.story}\n${row.reason}`).join("\n");
  const verification = verificationText(markdown);
  const covered: string[] = [];
  const missing: string[] = [];
  const mappingMissing: string[] = [];
  const dict = semantic ? loadCustomDictionary(semantic.dictPath) : undefined;
  const covers = (haystack: string, term: string): boolean => {
    if (normalizedContains(haystack, term)) return true;
    return Boolean(semantic && semanticContains(haystack, term, semantic.threshold, dict).matched);
  };

  for (const fact of ledger.facts) {
    const contentMissing = (fact.required_terms ?? []).filter((term) => !covers(content, term));
    const mappingTerms = fact.mapping_terms ?? [];
    const absentMappingTerms = mappingTerms.filter((term) => !covers(mappingText, term));
    // Synthetic facts derived from a mapping table have no source IDs. External
    // PDF ledgers do: requiring those IDs makes the evidence trail auditable.
    const hasMappingId = !ledger.provided || normalizedContains(mappingText, fact.id);
    const hasVerificationId = !ledger.provided || normalizedContains(verification, fact.id);
    if (contentMissing.length === 0 && hasMappingId && hasVerificationId) covered.push(fact.id);
    else {
      const reasons = [
        ...contentMissing,
        ...(hasMappingId ? [] : ["映射表缺少事实 ID"]),
        ...(hasVerificationId ? [] : ["知识点校验缺少事实 ID"]),
      ];
      missing.push(`${fact.id}: ${reasons.join("、")}`);
    }
    if (absentMappingTerms.length > 0) mappingMissing.push(`${fact.id}: ${absentMappingTerms.join("、")}`);
  }
  return {
    covered,
    missing,
    mappingMissing,
    ok: ledger.valid && ledger.facts.length > 0 && missing.length === 0 && mappingMissing.length === 0,
  };
}

function emptyChunk(chunkIndex: number, violation: string): ChunkCheckReport {
  return {
    chunk_index: chunkIndex,
    heading: "missing",
    word_count: 0,
    paragraph_count: 0,
    avg_sentences_per_paragraph: 0,
    single_sentence_paragraph_ratio: 1,
    non_entity_middle_dots: 0,
    bullet_line_ratio: 0,
    human_voice_score: 0,
    readability_score: 0,
    verdict: "FAIL",
    violations: [violation],
  };
}

export function evaluateChunksIndependently(
  body: string,
  style: string,
  hanlpOptions?: HanLPOptions,
  targetChunk?: number | "all",
  authorProfile?: string,
): ChunkCheckReport[] {
  const prose = body.replace(/<!--[\s\S]*?-->/g, "").trim();
  const rawSections = prose.split(/(?=^##\s+)/m).map((section) => section.trim()).filter(Boolean);
  if (rawSections.length === 0) {
    return typeof targetChunk === "number" ? [emptyChunk(targetChunk, `未找到分块 ${targetChunk}`)] : [];
  }
  const isStaccato = resolveAuthorGateProfile(authorProfile ?? style, body) === "staccato_literary";

  const reports: ChunkCheckReport[] = [];
  rawSections.forEach((secText, idx) => {
    const chunkIdx = idx + 1;
    if (typeof targetChunk === "number" && targetChunk !== chunkIdx) return;

    const lines = secText.split(/\r?\n/);
    const heading = lines[0]?.startsWith("## ")
      ? lines[0].replace(/^##\s+/, "").trim()
      : `Chunk ${chunkIdx}`;
    const contentOnly = (lines[0]?.startsWith("## ") ? lines.slice(1).join("\n") : secText).trim();
    const nlp = analyzeWithHanLPSync(contentOnly, hanlpOptions);
    const hv = evaluateHumanVoiceAndAntiSlop(contentOnly, nlp, style, authorProfile);
    const depthPenalty = Math.max(0, (nlp.depDiagnostics.avgTreeDepth - 4.5) * 6);
    const complexPenalty = nlp.depDiagnostics.complexSentences.length * 5;
    const readability = Math.max(0, Math.min(100, Math.round(100 - depthPenalty - complexPenalty)));
    const avgSents = hv.paragraphCount > 0 ? Number((nlp.sentences.length / hv.paragraphCount).toFixed(2)) : 0;
    const wc = markdownWordCount(contentOnly);
    const violations: string[] = [];

    if (wc < 600 || wc > 800) violations.push(`分块 [${chunkIdx}:${heading}] 字数 ${wc} 不在 600-800`);
    if (style !== "verse") {
      if (hv.paragraphCount < 2) violations.push(`分块 [${chunkIdx}:${heading}] 自然段不足 (${hv.paragraphCount} < 2)`);
      const minAvgSents = isStaccato ? 1.2 : 1.8;
      const maxSingleRatio = isStaccato ? 0.68 : 0.35;
      if (avgSents < minAvgSents) violations.push(`分块 [${chunkIdx}:${heading}] 出现「一行一句」退化 (平均每段仅 ${avgSents} 句 < ${minAvgSents})`);
      if (hv.singleSentenceParagraphRatio > maxSingleRatio) {
        violations.push(`分块 [${chunkIdx}:${heading}] 单句短碎段占比过高 (${Math.round(hv.singleSentenceParagraphRatio * 100)}% > ${Math.round(maxSingleRatio * 100)}%)`);
      }
    }
    if (hv.nonEntityMiddleDotCount > 0) {
      violations.push(`分块 [${chunkIdx}:${heading}] 出现 ${hv.nonEntityMiddleDotCount} 处非人名「·」分点/标签`);
    }
    if (style !== "neutral" && hv.bulletLineRatio > 0.12) {
      violations.push(`分块 [${chunkIdx}:${heading}] 退化为清单体 (列表行占比 ${Math.round(hv.bulletLineRatio * 100)}% > 12%)`);
    }
    if (hv.humanVoiceScore < 75) violations.push(`分块 [${chunkIdx}:${heading}] 人味指数跌破基线 (${hv.humanVoiceScore} < 75)`);
    if (readability < 75) violations.push(`分块 [${chunkIdx}:${heading}] 可读性指数跌破基线 (${readability} < 75)`);

    reports.push({
      chunk_index: chunkIdx,
      heading,
      word_count: wc,
      paragraph_count: hv.paragraphCount,
      avg_sentences_per_paragraph: avgSents,
      single_sentence_paragraph_ratio: hv.singleSentenceParagraphRatio,
      non_entity_middle_dots: hv.nonEntityMiddleDotCount,
      bullet_line_ratio: hv.bulletLineRatio,
      human_voice_score: hv.humanVoiceScore,
      readability_score: readability,
      verdict: violations.length === 0 ? "PASS" : "FAIL",
      violations,
    });
  });

  if (typeof targetChunk === "number" && reports.length === 0) {
    reports.push(emptyChunk(targetChunk, `未找到分块 ${targetChunk}`));
  }
  return reports;
}

export function analyzeMarkdown(markdown: string, options: OutputCheckOptions): OutputCheckResult {
  const mapping = checkMappingTable(markdown);
  const verify = verificationOk(markdown);
  const wc = markdownWordCount(storyBody(markdown));
  const [minimum, maximum] = LEVEL_LIMITS[options.level];
  const level_ok = maximum === null ? true : wc >= minimum && wc <= maximum;
  const level_msg = maximum === null
    ? `长篇不设上限，正文约 ${wc} 字`
    : options.level === "expand"
      ? `展开期望 ${minimum}-${maximum}，实际 ${wc}`
      : `默认期望不超过 ${maximum}，实际 ${wc}`;
  const style = declaredStyle(markdown);
  const style_ok = style !== null && isExpressionStyle(style) && (!options.expectedStyle || style === options.expectedStyle);
  const voice_leaks = VOICE_LEAKS.filter((phrase) => normalizedContains(`${storyBody(markdown)}\n${verificationText(markdown)}`, phrase));
  const ledger = loadFactLedger(options.factsPath, mapping, Boolean(options.requireFacts));
  const hanlpEnabled = Boolean(options.hanlpOptions?.enabled || options.precomputedStoryNlp);
  const voiceRequested = Boolean(options.strictHumanVoice || options.enforceBaselineFloor || hanlpEnabled || options.textJudgment || options.readmeReview);
  const stsThreshold = options.stsThreshold ?? 0.62;
  const coverage = factCoverage(
    markdown,
    mapping,
    ledger,
    hanlpEnabled ? { threshold: stsThreshold, dictPath: options.hanlpOptions?.customDictPath } : undefined,
  );
  const leak_ok = voice_leaks.length === 0;
  const has_mapping_bounds = mapping.ok && mapping.rows.length > 0 && mapping.rows.every((row) => Boolean(row.boundary));
  const has_comprehension_section = hasComprehensionSection(markdown);
  const structure_verdict: GateVerdict = options.readmeReview && !mapping.ok
    ? (leak_ok ? "PASS" : "FAIL")
    : (mapping.ok && verify && level_ok && style_ok && leak_ok ? "PASS" : "FAIL");
  const term_id_coverage_verdict: GateVerdict = options.readmeReview && !mapping.ok
    ? "PASS"
    : (coverage.ok ? "PASS" : "FAIL");
  const comprehension_verdict: ComprehensionVerdict = has_comprehension_section
    ? "STRUCTURE_PRESENT_NEEDS_REVIEW"
    : "NOT_REQUESTED";
  const mechanicalVerdict = structure_verdict === "PASS" && term_id_coverage_verdict === "PASS" ? "PASS" : "FAIL";
  const effectiveAuthorOrStyle = options.authorProfile ?? style ?? options.expectedStyle;
  const text_recognition_judgment = evaluateTextRecognitionJudgment(
    options.readmeReview ? markdown : (storyBody(markdown) || markdown),
    effectiveAuthorOrStyle,
  );
  const hanlp_report = voiceRequested ? buildHanlpReport(markdown, options, ledger, stsThreshold, style) : undefined;
  const humanVoiceFail = Boolean(options.strictHumanVoice && hanlp_report && humanVoiceBlocks(hanlp_report.human_voice_diagnostics, style, options.authorProfile, markdown));
  const textJudgmentFail = Boolean(
    (options.textJudgment || options.readmeReview) &&
      (text_recognition_judgment.overall_ai_produced || text_recognition_judgment.grammar_inspection.has_issues),
  );
  const localHeuristic = hanlp_report?.syntax_analysis_source === "local_heuristic_estimate";
  const hasSemanticConflicts = Boolean(hanlp_report?.semantic_conflicts && hanlp_report.semantic_conflicts.length > 0);
  const assistedPass = Boolean(hanlp_report && hanlp_report.lao_yu_readability_score >= 75 && term_id_coverage_verdict === "PASS" && !hasSemanticConflicts);
  const semantic_quality_verdict: ReviewVerdict = !hanlpEnabled || !hanlp_report
    ? "NEEDS_REVIEW"
    : localHeuristic
      ? (assistedPass ? "LOCAL_HEURISTIC_PASS" : "LOCAL_HEURISTIC_WARN")
      : (assistedPass ? "HANLP_NEURAL_PASS" : "HANLP_NEURAL_WARN");
  const mermaid_diagnostics = validateMermaidBlocks(markdown);
  const expression_baseline_report = options.enforceBaselineFloor && hanlp_report
    ? evaluateExpressionBaseline(markdown, storyBody(markdown), verificationText(markdown), mapping, hanlp_report.human_voice_diagnostics, hanlp_report.lao_yu_readability_score, style, hanlp_report.semantic_conflicts, mermaid_diagnostics, text_recognition_judgment, options.authorProfile)
    : undefined;
  const baselineFail = expression_baseline_report?.baseline_verdict === "FAIL";
  const chunk_reports = options.chunk
    ? evaluateChunksIndependently(storyBody(markdown), style ?? options.expectedStyle ?? "anime", options.hanlpOptions, options.chunk, options.authorProfile)
    : undefined;
  const chunkFail = Boolean(chunk_reports?.some((report) => report.verdict === "FAIL"));
  const verdict = mechanicalVerdict === "PASS" && !humanVoiceFail && !baselineFail && !chunkFail && !textJudgmentFail ? "PASS" : "FAIL";

  return {
    has_mapping_table: mapping.ok,
    mapping_error: mapping.error,
    mapping_row_count: mapping.rows.length,
    has_verify: verify,
    word_count: wc,
    level: options.level,
    level_ok,
    level_msg,
    style,
    style_ok,
    expected_style: options.expectedStyle,
    voice_leaks,
    leak_ok,
    facts_provided: ledger.provided,
    facts_path: ledger.path,
    fact_ledger_valid: ledger.valid,
    fact_ledger_errors: ledger.errors,
    covered: coverage.covered,
    missing: coverage.missing,
    mapping_missing: coverage.mappingMissing,
    cover_ok: coverage.ok,
    has_mapping_bounds,
    has_comprehension_section,
    structure_verdict,
    term_id_coverage_verdict,
    semantic_quality_verdict,
    comprehension_verdict,
    verdict_scope: "mechanical_only",
    verdict,
    ...(hanlp_report ? { hanlp_report } : {}),
    ...(expression_baseline_report ? { expression_baseline_verdict: expression_baseline_report.baseline_verdict, expression_baseline_report } : {}),
    ...(chunk_reports ? { chunk_reports, chunk_verdict: chunkFail ? "FAIL" : "PASS" } : {}),
    ...(mermaid_diagnostics.block_count > 0 ? { mermaid_diagnostics } : {}),
    text_recognition_judgment,
  };
}

export function validateMermaidBlocks(markdown: string): MermaidDiagnostics {
  const blocks = [...markdown.matchAll(/```mermaid\s*\r?\n([\s\S]*?)```/gu)].map((m) => m[1]?.trim() ?? "");
  if (blocks.length === 0) return { block_count: 0, valid: true, errors: [] };
  const errors: string[] = [];
  const validHeaders = /^(?:flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|xychart-beta)\b/u;
  blocks.forEach((block, idx) => {
    const firstContentLine = block
      .split(/\r?\n/u)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("%%"));
    if (!firstContentLine || !validHeaders.test(firstContentLine)) {
      errors.push(`Mermaid 块 #${idx + 1} 缺少受支持的图表类型声明 (${firstContentLine ?? "空"})`);
    }
    const unquotedHtml = /<br\s*\/?>|<\/?[a-z]+>/iu.test(block);
    if (unquotedHtml) {
      errors.push(`Mermaid 块 #${idx + 1} 包含 HTML 标签，请改用纯文本换行或引号包裹节点标签`);
    }
  });
  return {
    block_count: blocks.length,
    valid: errors.length === 0,
    errors,
  };
}

export function projectFoldedPresentation(markdown: string): string {
  const titleMatch = /^#\s+(.+)$/mu.exec(markdown);
  const titleLine = titleMatch ? `# ${titleMatch[1].trim()}` : "";
  const body = storyBody(markdown)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return titleLine ? `${titleLine}\n\n${body}\n` : `${body}\n`;
}

export function projectAnnotatedPresentation(markdown: string): string {
  const titleMatch = /^#\s+(.+)$/mu.exec(markdown);
  const titleLine = titleMatch ? `# ${titleMatch[1].trim()}` : "";
  const mapping = checkMappingTable(markdown);
  const body = storyBody(markdown)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!mapping.ok || mapping.rows.length === 0) {
    return titleLine ? `${titleLine}\n\n${body}\n` : `${body}\n`;
  }

  const paragraphs = body.split(/\r?\n\s*\r?\n/u).map((p) => p.trim()).filter(Boolean);
  const usedRows = new Set<number>();
  const annotatedParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    if (/^```/u.test(paragraph) || /^#{1,6}\s/u.test(paragraph)) {
      annotatedParagraphs.push(paragraph);
      continue;
    }
    const sentences = splitSentencesMultilingual(paragraph);
    const matchedInParagraph: string[] = [];

    for (const sentence of sentences) {
      mapping.rows.forEach((row, rowIdx) => {
        if (usedRows.has(rowIdx)) return;
        const sourceClean = row.source.replace(/^\[F\d+\]\s*/u, "").trim();
        const storyTokens = segmentTextLocal(row.story).filter((t) => t.trim().length >= 2);
        const hitsSource = sourceClean.length > 0 && normalizedContains(sentence, sourceClean);
        const hitsStory = storyTokens.some((tok) => normalizedContains(sentence, tok));
        if (hitsSource || hitsStory) {
          usedRows.add(rowIdx);
          const mech = (row.mechanism ?? row.reason).trim().replace(/[。.]$/u, "");
          const bound = row.boundary ? `${row.boundary.trim().replace(/[。.]$/u, "")}。` : "";
          matchedInParagraph.push(`〔${sourceClean}〕${mech}。${bound}`.trim());
        }
      });
    }

    annotatedParagraphs.push(paragraph);
    for (const note of matchedInParagraph) {
      annotatedParagraphs.push(note);
    }
  }

  const joined = annotatedParagraphs.join("\n\n");
  return titleLine ? `${titleLine}\n\n${joined}\n` : `${joined}\n`;
}

export function projectBeginnerCard(markdown: string): string {
  const titleMatch = /^#\s+(.+)$/mu.exec(markdown);
  const title = titleMatch ? titleMatch[1].trim() : "知识秒懂卡";
  const tj = evaluateTextRecognitionJudgment(markdown);
  const mapping = checkMappingTable(markdown);
  const body = storyBody(markdown)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const firstPara = body.split(/\r?\n\s*\r?\n/u).find((p) => p.trim() && !/^#{1,6}\s/u.test(p.trim())) ?? "";
  const anchor = tj.layperson_retelling_anchor.best_anchor_sentence || firstPara;

  const lines: string[] = [
    `# ${title}（小白一秒读懂卡）`,
    "",
    `> **一句话大白话（直接拿去跟朋友说）**：${anchor}`,
    "",
    "### 1. 先抓直觉：它到底在解决什么麻烦？",
    firstPara || anchor,
  ];

  if (mapping.ok && mapping.rows.length > 0) {
    lines.push("", "### 2. 核心动作对照（不用死背术语，看懂日常动作就行）");
    for (const row of mapping.rows.slice(0, 4)) {
      const cleanSource = row.source.replace(/^\[F\d+\]\s*/u, "").trim();
      lines.push(`- **${row.story.trim()}** → 对应专业里的「**${cleanSource}**」：${(row.mechanism ?? row.reason).trim()}`);
    }
    const boundaries = mapping.rows.filter((r) => r.boundary && r.boundary.trim().length > 0);
    if (boundaries.length > 0) {
      lines.push("", "### 3. 防坑提醒（别被比喻带偏的地方）");
      for (const row of boundaries.slice(0, 3)) {
        const cleanSource = row.source.replace(/^\[F\d+\]\s*/u, "").trim();
        lines.push(`- 关于「${cleanSource}」：${row.boundary!.trim()}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function projectConciseGist(markdown: string, habit: UserHabitOption = "auto"): string {
  const body = storyBody(markdown)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const report = screenThesisKeywords(body || markdown, { habit });
  return renderKeywordScreeningMarkdown(report);
}

function humanVoiceBlocks(
  diagnostics: HumanVoiceDiagnostics,
  style: string | null,
  authorProfile?: string,
  markdown = "",
): boolean {
  const isStaccato = resolveAuthorGateProfile(authorProfile ?? style, markdown) === "staccato_literary";
  const maxSingleRatio = isStaccato ? 1.0 : 0.35;
  const fragmented = style !== "verse" && diagnostics.paragraphCount >= 3 && diagnostics.singleSentenceParagraphRatio > maxSingleRatio;
  return fragmented || diagnostics.nonEntityMiddleDotCount >= 2 || diagnostics.humanVoiceScore < 70;
}

function buildHanlpReport(
  markdown: string,
  options: OutputCheckOptions,
  ledger: LoadedLedger,
  stsThreshold: number,
  style: string | null,
): HanLPQualityReport {
  const body = storyBody(markdown);
  const nlp = options.precomputedStoryNlp ?? analyzeWithHanLPSync(body || markdown, options.hanlpOptions);
  const dict = loadCustomDictionary(options.hanlpOptions?.customDictPath);
  const mappingArea = markdown.match(/<details[\s\S]*?<\/details>/iu)?.[0] ?? mappingRowsText(markdown);
  const unexplained = [...new Set(nlp.entities
    .map((entity) => entity.text)
    .filter((text) => text.length >= 2 && normalizedContains(body, text) && mappingArea.length > 0 && !normalizedContains(mappingArea, text)))];
  const maxDepDepth = options.maxDepDepth ?? 7;
  const verifySection = verificationText(markdown);
  const combinedTarget = `${body}\n${verifySection}`;
  const semantic_conflicts: Array<{ fact_id: string; reason: string; sentence?: string }> = [];
  const fact_semantic_scores = ledger.facts.map((fact) => {
    const fidelity = fact.claim ? evaluateClaimFidelity(combinedTarget, fact.claim, dict) : undefined;
    const claimSimilarity = fidelity
      ? (fidelity.polarityConflict || fidelity.directionConflict
          ? fidelity.effectiveSimilarity
          : Math.max(fidelity.effectiveSimilarity, normalizedContains(combinedTarget, fact.claim) ? 1 : 0))
      : 0;
    if (fidelity?.conflictReason) {
      semantic_conflicts.push({
        fact_id: fact.id,
        reason: fidelity.conflictReason,
        ...(fidelity.matchedSentence ? { sentence: fidelity.matchedSentence } : {}),
      });
    }
    return {
      fact_id: fact.id,
      claim_similarity: claimSimilarity,
      matched_semantically: !fidelity?.conflictReason && (claimSimilarity >= stsThreshold || normalizedContains(combinedTarget, fact.id)),
      ...(fidelity?.conflictReason ? { conflict_reason: fidelity.conflictReason } : {}),
    };
  });
  const depthPenalty = Math.max(0, (nlp.depDiagnostics.avgTreeDepth - 4) * 8);
  const complexPenalty = nlp.depDiagnostics.complexSentences.filter((sentence) => sentence.treeDepth > maxDepDepth).length * 6;
  const jargonPenalty = Math.min(20, unexplained.length * 4);
  const conflictPenalty = semantic_conflicts.length * 18;
  return {
    backend: nlp.backendUsed,
    story_token_count: hanlpTokenCount(body, dict),
    max_dep_tree_depth: nlp.depDiagnostics.maxTreeDepth,
    avg_dep_tree_depth: nlp.depDiagnostics.avgTreeDepth,
    complex_sentences: nlp.depDiagnostics.complexSentences,
    unexplained_jargon: unexplained,
    fact_semantic_scores,
    ...(semantic_conflicts.length > 0 ? { semantic_conflicts } : {}),
    lao_yu_readability_score: Math.max(0, Math.min(100, Math.round(100 - depthPenalty - complexPenalty - jargonPenalty - conflictPenalty))),
    human_voice_diagnostics: evaluateHumanVoiceAndAntiSlop(body, nlp, style ?? options.expectedStyle ?? "anime", options.authorProfile),
    syntax_analysis_source: nlp.backendUsed === "local-fallback" ? "local_heuristic_estimate" : "hanlp_neural_dep",
    readability_note: nlp.backendUsed === "local-fallback"
      ? "可读性分数来自本地句法估算，不是 HanLP 神经网络依存分析。"
      : "可读性分数使用 HanLP 依存句法深度。",
  };
}

function suggestionIsReplacement(sentence: string, suggestion: string): boolean {
  const chars = (value: string) => [...value].filter((ch) => /[\u4e00-\u9fffA-Za-z0-9]/u.test(ch));
  const source = chars(sentence);
  const rewritten = chars(suggestion);
  if (source.length === 0 || rewritten.length === 0) return false;
  const counts = new Map<string, number>();
  for (const ch of source) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let shared = 0;
  for (const ch of rewritten) {
    const left = counts.get(ch) ?? 0;
    if (left <= 0) continue;
    counts.set(ch, left - 1);
    shared += 1;
  }
  // A replacement reuses the sentence. An editor note such as 「请拆分为…」 does not.
  return shared / Math.max(source.length, rewritten.length) >= 0.5;
}

export function normalizeOutputMarkdown(markdown: string): string {
  let text = markdown.replace(/\r\n/g, "\n").replace(/\u00ad/g, "");
  const clicheReplacements: Array<[RegExp, string]> = [
    [/(?:^|(?<=[。！？\n]\s*))(?:简单来说|换句话说|总而言之|综上所述|值得注意的是|需要指出的是|众所周知|不言而喻|其实很简单|显而易见|不难发现|不难理解|不难看出)[，,：:\s]+/gm, ""],
    [/(?:^|(?<=[。！？\n]\s*))让我们(?:先)?(?:来看看|想象一下)[，,：:\s]*/gm, ""],
    [/(?:^|(?<=[。！？\n]\s*))(?:先别急|别着急|先看看|别急|别慌|看好了|听我说)[，,。！!\s]+/gm, ""],
  ];
  for (const [pattern, replacement] of clicheReplacements) text = text.replace(pattern, replacement);
  const grammar = evaluateGrammarInspection(text);
  for (const issue of grammar.issues) {
    if (issue.suggestion && text.includes(issue.sentence) && suggestionIsReplacement(issue.sentence, issue.suggestion)) {
      text = text.split(issue.sentence).join(issue.suggestion);
    }
  }
  const styleMatch = text.match(/^>\s*表达风格[：:]\s*`?([a-z-]+)`?/m);
  if (styleMatch?.[1] === "verse") return text;
  const detailsMatch = text.match(/<details[\s\S]*?<\/details>/i);
  if (!detailsMatch || detailsMatch.index === undefined) return text;
  const detailsEnd = detailsMatch.index + detailsMatch[0].length;
  const prefix = text.slice(0, detailsEnd);
  const afterDetails = text.slice(detailsEnd);
  const verifySplit = afterDetails.split(/(?=\*\*知识点校验\*\*|^##\s*知识点校验)/m);
  if (verifySplit.length < 2) return text;
  let rawStory = verifySplit[0].replace(/^\s*[·•]\s+(.+)$/gm, "$1");
  const suffix = verifySplit.slice(1).join("");
  const merged: string[] = [];
  let buffer = "";
  for (const paragraph of rawStory.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean)) {
    if (/^#{1,6}\s/u.test(paragraph) || /^>\s/u.test(paragraph) || /^\|.*\|$/u.test(paragraph) || /^```/u.test(paragraph)) {
      if (buffer) merged.push(buffer);
      buffer = "";
      merged.push(paragraph);
      continue;
    }
    if (!buffer) buffer = paragraph;
    else if (buffer.length < 50 || paragraph.length < 42) {
      buffer = `${buffer}${/[。！？!?…”"']$/u.test(buffer) ? "" : "。"}${paragraph}`;
      if (buffer.length >= 110) {
        merged.push(buffer);
        buffer = "";
      }
    } else {
      merged.push(buffer);
      buffer = paragraph;
    }
  }
  if (buffer) merged.push(buffer);
  return `${prefix}\n\n${merged.join("\n\n")}\n\n${suffix.trimStart()}`;
}

function evaluateExpressionBaseline(
  markdown: string,
  body: string,
  verifySection: string,
  mapping: MappingCheck,
  humanVoice: HumanVoiceDiagnostics,
  readabilityScore: number,
  style: string | null,
  semanticConflicts?: Array<{ fact_id: string; reason: string; sentence?: string }>,
  mermaidDiagnostics?: MermaidDiagnostics,
  textJudgment?: TextRecognitionJudgment,
  authorProfile?: string,
): ExpressionBaselineReport {
  const isStaccato = resolveAuthorGateProfile(authorProfile ?? style, markdown) === "staccato_literary";
  const thresholds: ExpressionBaselineThresholds = isStaccato
    ? {
        ...DEFAULT_EXPRESSION_BASELINE,
        minAvgSentencesPerParagraph: 1.0,
        maxSingleSentenceParagraphRatio: 1.0,
        minAvgParagraphChars: 18,
      }
    : DEFAULT_EXPRESSION_BASELINE;
  const violations: string[] = [];
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const paragraphs = prose.split(/\r?\n\s*\r?\n/u).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph && !/^#{1,6}\s/u.test(paragraph));
  const sentenceCount = Math.max(1, prose.split(/[。！？!?]/u).filter((sentence) => sentence.trim().length > 0).length);
  const avgSentences = paragraphs.length > 0 ? Number((sentenceCount / paragraphs.length).toFixed(2)) : 0;
  const avgChars = paragraphs.length > 0 ? Math.round(paragraphs.reduce((sum, paragraph) => sum + markdownWordCount(paragraph), 0) / paragraphs.length) : 0;
  const maxClause = Math.max(0, ...prose.replace(/[“”"']/g, "").split(/[。！？；，：!?;,:\n]+/u).map((clause) => markdownWordCount(clause.trim())));
  const boundaryRows = mapping.rows.filter((row) => (row.boundary ?? "").trim().length >= thresholds.minBoundaryCellChars && !/(?:待填|占位|TBD|TODO|^无$|^略$)/iu.test(row.boundary ?? ""));
  const combined = `${prose}\n${verifySection}`;
  const stages = [
    /(?:当|遇到|一旦|如果|若|要是|每当|面对|起初|还没|原本|为了|痛点|卡在|需要|要|想)/u.test(combined) ? "trigger" : "",
    /(?:先|再|接着|随后|通过|打分|转换|选出|分成|点|选|算|抄|画|标|扣|比|把|按|照|沿)/u.test(combined) ? "action" : "",
    /(?:但是|然而|不过|但|限制|代价|边界|风险|只对|失效|更像|不能|不可|必须|只|除非|直到|没法|否则|前提)/u.test(combined) ? "constraint" : "",
    /(?:最终|结果|导致|提高|降低|变成|因此|所以|从此|才|就定|锁死|生效|排好|清掉|更新|重排)/u.test(combined) ? "outcome" : "",
  ].filter(Boolean);
  const verifyChars = markdownWordCount(verifySection);
  if (style !== "verse") {
    if (paragraphs.length < thresholds.minParagraphCount) violations.push(`[最低表达基线·段落数不足] 正文自然段仅 ${paragraphs.length} 段`);
    if (avgSentences < thresholds.minAvgSentencesPerParagraph) violations.push(`[最低表达基线·段落单薄] 平均每段仅 ${avgSentences} 句`);
    if (humanVoice.singleSentenceParagraphRatio > thresholds.maxSingleSentenceParagraphRatio) violations.push(`[最低表达基线·一行一句超标] 单句成段占比 ${Math.round(humanVoice.singleSentenceParagraphRatio * 100)}%`);
    if (avgChars < thresholds.minAvgParagraphChars) violations.push(`[最低表达基线·段落信息量过低] 平均段落字数仅 ${avgChars} 字`);
  }
  if (humanVoice.nonEntityMiddleDotCount > thresholds.maxNonEntityMiddleDots) violations.push(`[最低表达基线·禁用「·」] 检测到 ${humanVoice.nonEntityMiddleDotCount} 处非人名居中圆点`);
  if (style !== "neutral" && humanVoice.bulletLineRatio > thresholds.maxNarrativeBulletRatio) violations.push(`[最低表达基线·正文清单化] 列表行占比 ${Math.round(humanVoice.bulletLineRatio * 100)}%`);
  if (maxClause > thresholds.maxUnbrokenClauseChars) violations.push(`[最低表达基线·单句过长] 存在 ${maxClause} 字无标点停顿`);
  if (mapping.rows.length < thresholds.minMappingRows) violations.push(`[最低表达基线·映射深度不足] 映射表仅 ${mapping.rows.length} 行`);
  if (boundaryRows.length < mapping.rows.length) violations.push(`[最低表达基线·类比边界缺失] 有效边界 ${boundaryRows.length}/${mapping.rows.length} 行`);
  if (verifyChars < thresholds.minVerificationChars) violations.push(`[最低表达基线·知识点校验敷衍] 仅 ${verifyChars} 字`);
  if (stages.length < thresholds.minCausalStageCount) violations.push(`[最低表达基线·机制因果链残缺] 仅覆盖 ${stages.length}/4 个阶段`);
  if (humanVoice.humanVoiceScore < thresholds.minHumanVoiceScore) violations.push(`[最低表达基线·人味分数未达标] 当前 ${humanVoice.humanVoiceScore} 分`);
  if (readabilityScore < thresholds.minReadabilityScore) violations.push(`[最低表达基线·可读性未达标] 当前 ${readabilityScore} 分`);
  if (semanticConflicts && semanticConflicts.length > 0) {
    for (const conflict of semanticConflicts) {
      violations.push(`[最低表达基线·事实极性或方向反转] ${conflict.fact_id}: ${conflict.reason}`);
    }
  }
  if (mermaidDiagnostics && !mermaidDiagnostics.valid) {
    for (const err of mermaidDiagnostics.errors) {
      violations.push(`[最低表达基线·可视化语法错误] ${err}`);
    }
  }
  if (textJudgment) {
    if (textJudgment.readme_expression_review.is_ai_produced) {
      violations.push(`[最低表达基线·readme表达审查] 命中「${textJudgment.readme_expression_review.label}」标签：${textJudgment.readme_expression_review.reasons.join("；")}`);
    }
    if (textJudgment.micro_sentence_cracker.is_ai_produced) {
      violations.push(`[最低表达基线·词句关键破解] 命中「${textJudgment.micro_sentence_cracker.label}」标签：${textJudgment.micro_sentence_cracker.reasons.slice(0, 3).join("；")}`);
    }
    if (textJudgment.analogy_authenticity_review.is_ai_produced) {
      violations.push(`[最低表达基线·类比真实度审查] 命中「${textJudgment.analogy_authenticity_review.label}」标签：${textJudgment.analogy_authenticity_review.reasons.join("；")}`);
    }
    if (textJudgment.narrative_boundary_review.story_bloat_detected) {
      violations.push(`[最低表达基线·叙述边界越界] ${textJudgment.narrative_boundary_review.reasons.join("；")}`);
    }
    if (textJudgment.grammar_inspection.has_issues) {
      for (const issue of textJudgment.grammar_inspection.issues) {
        violations.push(`[最低表达基线·语法识别] ${issue.markdown_emphasized} (${issue.reason})`);
      }
    }
  }
  return {
    baseline_verdict: violations.length === 0 ? "PASS" : "FAIL",
    thresholds,
    metrics: {
      paragraph_count: paragraphs.length,
      avg_sentences_per_paragraph: avgSentences,
      avg_paragraph_chars: avgChars,
      max_unbroken_clause_chars: maxClause,
      mapping_rows: mapping.rows.length,
      verification_chars: verifyChars,
      causal_stages_covered: stages,
      human_voice_score: humanVoice.humanVoiceScore,
      readability_score: readabilityScore,
      ...(textJudgment ? { text_recognition_labels: textJudgment.labels } : {}),
    },
    violations,
  };
}

function mappingRowsText(markdown: string): string {
  return markdown.split(/\r?\n/u).filter((line) => line.trim().startsWith("|")).join("\n");
}

function reviewLabel(verdict: ReviewVerdict | ComprehensionVerdict): string {
  if (verdict === "NOT_REQUESTED") return "未请求（不能据此判断用户已理解）";
  if (verdict === "STRUCTURE_PRESENT_NEEDS_REVIEW") return "已见题目结构，需要人工或模型复核";
  if (verdict === "HANLP_ASSISTED_PASS" || verdict === "HANLP_NEURAL_PASS") return "HanLP 依存分析可读性通过，仍需人工复核语义";
  if (verdict === "HANLP_ASSISTED_WARN" || verdict === "HANLP_NEURAL_WARN") return "HanLP 依存分析发现拗口句或未铺垫术语，需要改稿";
  if (verdict === "LOCAL_HEURISTIC_PASS") return "本地句法估算可读性通过，不是神经网络依存分析";
  if (verdict === "LOCAL_HEURISTIC_WARN") return "本地句法估算未过可读性线，不是神经网络依存分析";
  return "需要人工或模型复核";
}

function render(result: OutputCheckResult): string {
  const lines = [
    "转换结果校验",
    `  结构检查: ${result.structure_verdict}`,
    `    映射表: ${result.has_mapping_table ? "OK" : `FAIL${result.mapping_error ? ` (${result.mapping_error})` : ""}`}`,
    `    知识点校验: ${result.has_verify ? "OK" : "MISSING"}`,
    `    篇幅: ${result.level_msg} (${result.level_ok ? "OK" : "FAIL"})`,
    `    风格元数据: ${result.style_ok ? `OK (${result.style})` : `FAIL (${result.style ?? "缺失"})`}`,
    `    情况句泄漏: ${result.leak_ok ? "OK" : `LEAK ${JSON.stringify(result.voice_leaks)}`}`,
    `    适用边界列: ${result.has_mapping_bounds ? "PRESENT" : "OPTIONAL_ABSENT"}`,
    `  事实术语及 ID 覆盖: ${result.term_id_coverage_verdict}`,
    `    事实清单: ${result.fact_ledger_valid ? "OK" : `FAIL ${result.fact_ledger_errors.join("；")}`}`,
    `    覆盖: ${result.covered.length}/${result.covered.length + result.missing.length} (${result.cover_ok ? "OK" : "FAIL"})`,
    `  语义质量评估: ${reviewLabel(result.semantic_quality_verdict)}`,
    `  用户理解验证: ${reviewLabel(result.comprehension_verdict)}`,
  ];
  if (result.text_recognition_judgment) {
    const tj = result.text_recognition_judgment;
    const tagText = tj.labels.length > 0 ? tj.labels.join("、") : "正常";
    lines.push(`  文本识别评判: ${tagText}`);
    lines.push(
      `    readme表达审查: [${tj.readme_expression_review.label}]${tj.readme_expression_review.reasons.length > 0 ? ` ${tj.readme_expression_review.reasons.join("；")}` : " 未发现多表情或碎片化标准腔"}`,
    );
    lines.push(
      `    词句关键破解: [${tj.micro_sentence_cracker.label}]${tj.micro_sentence_cracker.reasons.length > 0 ? ` ${tj.micro_sentence_cracker.reasons.slice(0, 4).join("；")}` : " 未发现两三字独立短句、设问过渡壳或排比成瘾"}`,
    );
    lines.push(
      `    类比真实度审查: [${tj.analogy_authenticity_review.label}]${tj.analogy_authenticity_review.reasons.length > 0 ? ` ${tj.analogy_authenticity_review.reasons.join("；")}` : " 未发现术语贴标签伪角色或映射脱节"}`,
    );
    lines.push(
      `    外行复述锚点: 复述友好度 ${tj.layperson_retelling_anchor.retellability_score}${tj.layperson_retelling_anchor.best_anchor_sentence ? `（候选锚点：「${tj.layperson_retelling_anchor.best_anchor_sentence.slice(0, 48)}${tj.layperson_retelling_anchor.best_anchor_sentence.length > 48 ? "…" : ""}」）` : ""}`,
    );
    lines.push(
      `    小白友好度: ${tj.beginner_friendliness.beginner_score}（小句均长 ${tj.beginner_friendliness.avg_clause_chars}字，开篇零黑话=${tj.beginner_friendliness.opening_jargon_free ? "是" : "否"}，具象体感词=${tj.beginner_friendliness.concrete_sensory_signals}处）`,
    );
    for (const reason of tj.beginner_friendliness.reasons) {
      lines.push(`      - ${reason}`);
    }
    lines.push(
      `    叙述边界审查: ${tj.narrative_boundary_review.within_boundary ? "OK" : "发现长篇剧情注水"}（精炼度 ${tj.narrative_boundary_review.conciseness_score}，日常/游戏话术域=${tj.narrative_boundary_review.habit_lingo_domains.join("/") || "通用"}）`,
    );
    for (const reason of tj.narrative_boundary_review.reasons) {
      lines.push(`      - ${reason}`);
    }
    lines.push(
      `    语法识别: ${tj.grammar_inspection.has_issues ? `发现 ${tj.grammar_inspection.issue_count} 处语序/倒装/欧化问题` : "OK"}`,
    );
    for (const issue of tj.grammar_inspection.issues) {
      lines.push(`      - ${issue.markdown_emphasized} (${issue.reason} -> 建议：${issue.suggestion})`);
    }
  }
  if (result.expression_baseline_report) {
    lines.push(`  最低表达水平线: ${result.expression_baseline_report.baseline_verdict}`);
    for (const violation of result.expression_baseline_report.violations) lines.push(`    ${violation}`);
  }
  if (result.hanlp_report) {
    lines.push(`  HanLP 辅助: ${result.hanlp_report.backend}，${result.hanlp_report.syntax_analysis_source}，老妪能解可读性 ${result.hanlp_report.lao_yu_readability_score}，人味 ${result.hanlp_report.human_voice_diagnostics.humanVoiceScore}`);
    lines.push(`    ${result.hanlp_report.readability_note}`);
    for (const warning of result.hanlp_report.human_voice_diagnostics.issue1Warnings) lines.push(`    ${warning}`);
    if (result.hanlp_report.unexplained_jargon.length > 0) {
      lines.push(`    未铺垫术语: ${result.hanlp_report.unexplained_jargon.slice(0, 5).join("、")}`);
    }
    if (result.hanlp_report.semantic_conflicts && result.hanlp_report.semantic_conflicts.length > 0) {
      for (const conflict of result.hanlp_report.semantic_conflicts) {
        lines.push(`    语义冲突预警: [${conflict.fact_id}] ${conflict.reason}`);
      }
    }
  }
  if (result.chunk_reports) {
    lines.push(`  分块门禁: ${result.chunk_verdict}`);
    for (const chunk of result.chunk_reports) {
      lines.push(`    分块 ${chunk.chunk_index} ${chunk.heading}: ${chunk.verdict} ${chunk.word_count}字`);
      for (const violation of chunk.violations) lines.push(`      ${violation}`);
    }
  }
  if (result.missing.length > 0) lines.push(`  正文/校验未覆盖: ${result.missing.join("；")}`);
  if (result.mapping_missing.length > 0) lines.push(`  映射表未覆盖: ${result.mapping_missing.join("；")}`);
  lines.push(`结论(仅机械门禁): ${result.verdict}`);
  lines.push("说明: 结构或术语覆盖通过，不表示知识准确，也不表示用户已经理解。");
  return lines.join("\n");
}

export function renderDeterministic(result: OutputCheckResult): string {
  const chunks = result.chunk_reports;
  const chunkPart = chunks ? ` chunks=${chunks.filter((chunk) => chunk.verdict === "PASS").length}/${chunks.length}` : "";
  const failed = chunks?.find((chunk) => chunk.verdict === "FAIL");
  const failPart = failed ? ` first_fail=${failed.chunk_index}` : "";
  return `转换结果校验 verdict=${result.verdict} level=${result.level} words=${result.word_count}${chunkPart}${failPart}`;
}

export interface DirectoryScanFileEntry {
  file: string;
  verdict: GateVerdict;
  labels: string[];
  readme_label: string;
  micro_sentence_label: string;
  analogy_label: string;
  grammar_issue_count: number;
  retellability_score: number;
  reasons: string[];
}

export interface DirectoryScanReport {
  directory: string;
  total_files: number;
  passed_files: number;
  flagged_files: number;
  verdict: GateVerdict;
  files: DirectoryScanFileEntry[];
}

export function scanDirectoryTextJudgment(dirPath: string): DirectoryScanReport {
  const rootDir = resolve(dirPath);
  const mdFiles: string[] = [];
  const walk = (curr: string): void => {
    for (const entry of readdirSync(curr)) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const full = join(curr, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith(".md")) mdFiles.push(full);
    }
  };
  walk(rootDir);
  mdFiles.sort();

  const files: DirectoryScanFileEntry[] = mdFiles.map((fullPath) => {
    const raw = readFileSync(fullPath, "utf8");
    const tj = evaluateTextRecognitionJudgment(raw);
    const hasIssues = tj.overall_ai_produced || tj.grammar_inspection.has_issues;
    const reasons = [
      ...tj.readme_expression_review.reasons,
      ...tj.micro_sentence_cracker.reasons,
      ...tj.analogy_authenticity_review.reasons,
      ...tj.grammar_inspection.issues.map((i) => `${i.markdown_emphasized} (${i.reason})`),
    ];
    return {
      file: relative(rootDir, fullPath) || fullPath,
      verdict: hasIssues ? "FAIL" : "PASS",
      labels: tj.labels.length > 0 ? tj.labels : ["正常"],
      readme_label: tj.readme_expression_review.label,
      micro_sentence_label: tj.micro_sentence_cracker.label,
      analogy_label: tj.analogy_authenticity_review.label,
      grammar_issue_count: tj.grammar_inspection.issue_count,
      retellability_score: tj.layperson_retelling_anchor.retellability_score,
      reasons,
    };
  });

  const passed_files = files.filter((f) => f.verdict === "PASS").length;
  const flagged_files = files.length - passed_files;
  return {
    directory: rootDir,
    total_files: files.length,
    passed_files,
    flagged_files,
    verdict: flagged_files === 0 ? "PASS" : "FAIL",
    files,
  };
}

function renderDirectoryScan(report: DirectoryScanReport): string {
  const lines = [
    `项目目录文本识别评判扫描 (${report.directory})`,
    `  总计: ${report.passed_files}/${report.total_files} 正常，${report.flagged_files} 命中标签 (${report.verdict})`,
  ];
  for (const item of report.files) {
    lines.push(
      `  [${item.verdict}] ${item.file} — 标签: ${item.labels.join("、")} | 语法问题: ${item.grammar_issue_count} | 复述友好度: ${item.retellability_score}`,
    );
    for (const r of item.reasons) {
      lines.push(`    - ${r}`);
    }
  }
  return lines.join("\n");
}

function help(): void {
  process.stdout.write(`转换结果校验（Bun/TypeScript）\n\n用法：\n  bun run check-output -- result.md --level default\n  bun run check-output -- result.md --level default --facts C:\\Temp\\fact-ledger.verified.json --style detective\n  bun run check-output -- result.md --fix --baseline-floor --strict-human-voice --emit-folded -\n  bun run check-output -- README.md --readme-review --emit-grammar-marked -\n  bun run check-output -- --scan-dir references\n\n选项：\n  -f, --file <路径>\n  --scan-dir <目录路径>          批量扫描项目目录下所有 Markdown 文件，输出文本识别评判汇总报告\n  --level <default|expand|long>\n  --facts <路径>        使用带页码锚点的事实清单；每条事实须含 id、claim、sourcePages 或 anchor\n  --strict-facts         未提供 --facts 时失败（PDF 验收应使用）\n  --style <表达风格>     断言文档元数据与预期风格一致\n  --author-profile <作家名或档位> 指定知名作家文体豁免档位（如 古龙/海明威/鲁迅/王小波 或 staccato_literary/dialectic_satire）\n  --json\n  --hanlp                        附加依存深度、未铺垫术语、语义相似度和人味诊断\n  --strict-human-voice           一行一句占比过高、非人名「·」达到 2 处，或人味分数低于 70 时，总结论改为 FAIL\n  --baseline-floor               用最低表达水平线（含文本识别评判）验收，未过线则总结论改为 FAIL\n  --text-judgment                启用文本识别评判门禁（readme表达审查 + 词句关键破解 + 类比真实度审查 + 语法识别），命中“ai生产”或语法错误则 FAIL\n  --readme-review                项目文件/README 审查模式：免除转换映射表要求，直接对文档执行文本识别评判门禁\n  --emit-grammar-marked <路径|-> 导出对主谓宾语序错误/英式倒装句/欧化句添加 Markdown 强调标记（**...**）后的全文\n  --fix                          落盘前去掉套话前缀、行首圆点、两三字指令短句，修正英式倒装与语序并合并过短段落\n  --chunk <k|all>                按二级标题逐块验收，任一块失败则总结论为 FAIL\n  --emit-folded <路径|->         校验通过后导出折叠呈现版（仅标题与干净正文，供直接交付读者）\n  --emit-annotated <路径|->      导出带追问内联标注的呈现版（格式：〔概念〕对应机制。适用边界。）\n  --emit-beginner-card <路径|->  导出面向零基础读者与低理解力人群的「小白一秒读懂卡」\n  --emit-gist <路径|->           导出切中观点的「极简白话与日常/游戏话术阐述报告」（适用于文言文、重复观点文章及快速抓主旨）\n  --habit <auto|gaming|daily|workplace> 指定导出话术映射时的用户习惯域（默认 auto）\n  --deterministic                人类可读输出收成一行；JSON 键序固定\n  --sts-threshold <0-1>\n  --max-dep-depth <number>\n  --hanlp-mode <auto|restful|native|local-fallback>\n  --hanlp-url <url>\n  --hanlp-auth <key>\n  --hanlp-lang <zh|mul|en>\n  --custom-dict <path>\n  --no-hanlp\n\n结论字段：\n  结构检查              映射表、校验段、篇幅、风格元数据、情况句泄漏\n  事实术语及 ID 覆盖    关键词/事实 ID 是否出现，不能证明机制正确\n  文本识别评判          下辖 readme表达审查、词句关键破解、类比真实度审查（打“ai生产”标签）、外行复述锚点与语法识别（**强调标记**提取）\n  语义质量评估          本工具不能自动判定，固定为需要人工或模型复核\n  用户理解验证          无理解检验则为未请求；有题目也只确认结构存在\n\n兼容：现有 CLI 与 JSON 字段保持不变。verdict 仍是机械门禁，不是语义或理解合格证明。\n`);
}

function parseArgs(argv: string[]): { file?: string; scanDir?: string; level: OutputLevel; factsPath?: string; expectedStyle?: ExpressionStyle; authorProfile?: string; requireFacts: boolean; json: boolean; hanlp: HanLPOptions; stsThreshold?: number; maxDepDepth?: number; strictHumanVoice: boolean; enforceBaselineFloor: boolean; fix: boolean; chunk?: number | "all"; deterministic: boolean; emitFolded?: string; emitAnnotated?: string; emitBeginnerCard?: string; emitGist?: string; habit: UserHabitOption; textJudgment: boolean; readmeReview: boolean; emitGrammarMarked?: string } {
  const hanlp = parseHanLPCliOptions(argv);
  let file: string | undefined;
  let scanDir: string | undefined;
  let level: OutputLevel = "default";
  let factsPath: string | undefined;
  let expectedStyle: ExpressionStyle | undefined;
  let authorProfile: string | undefined;
  let requireFacts = false;
  let json = false;
  let stsThreshold: number | undefined;
  let maxDepDepth: number | undefined;
  let strictHumanVoice = false;
  let enforceBaselineFloor = false;
  let fix = false;
  let chunk: number | "all" | undefined;
  let deterministic = false;
  let emitFolded: string | undefined;
  let emitAnnotated: string | undefined;
  let emitBeginnerCard: string | undefined;
  let emitGist: string | undefined;
  let habit: UserHabitOption = "auto";
  let textJudgment = false;
  let readmeReview = false;
  let emitGrammarMarked: string | undefined;

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
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--strict-facts") {
      requireFacts = true;
      continue;
    }
    if (arg === "-f" || arg === "--file") {
      file = argv[index + 1];
      if (!file) usageError(`${arg} 需要路径`);
      index += 1;
      continue;
    }
    if (arg === "--scan-dir") {
      scanDir = argv[index + 1];
      if (!scanDir) usageError("--scan-dir 需要目录路径");
      index += 1;
      continue;
    }
    if (arg === "--level") {
      const value = argv[index + 1];
      if (!value || !isOutputLevel(value)) usageError("--level 只能是 default、expand 或 long");
      level = value;
      index += 1;
      continue;
    }
    if (arg === "--facts") {
      factsPath = argv[index + 1];
      if (!factsPath) usageError("--facts 需要 JSON 路径");
      index += 1;
      continue;
    }
    if (arg === "--sts-threshold") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value < 0 || value > 1) usageError("--sts-threshold 需要 0 到 1 之间的数字");
      stsThreshold = value;
      index += 1;
      continue;
    }
    if (arg === "--strict-human-voice") {
      strictHumanVoice = true;
      continue;
    }
    if (arg === "--baseline-floor") {
      enforceBaselineFloor = true;
      continue;
    }
    if (arg === "--text-judgment") {
      textJudgment = true;
      continue;
    }
    if (arg === "--readme-review") {
      readmeReview = true;
      textJudgment = true;
      continue;
    }
    if (arg === "--emit-grammar-marked") {
      const value = argv[index + 1];
      if (!value) usageError("--emit-grammar-marked 需要输出路径或 -");
      emitGrammarMarked = value;
      index += 1;
      continue;
    }
    if (arg === "--fix") {
      fix = true;
      continue;
    }
    if (arg === "--deterministic") {
      deterministic = true;
      continue;
    }
    if (arg === "--emit-folded") {
      const value = argv[index + 1];
      if (!value) usageError("--emit-folded 需要输出路径或 -");
      emitFolded = value;
      index += 1;
      continue;
    }
    if (arg === "--emit-annotated") {
      const value = argv[index + 1];
      if (!value) usageError("--emit-annotated 需要输出路径或 -");
      emitAnnotated = value;
      index += 1;
      continue;
    }
    if (arg === "--emit-beginner-card") {
      const value = argv[index + 1];
      if (!value) usageError("--emit-beginner-card 需要输出路径或 -");
      emitBeginnerCard = value;
      index += 1;
      continue;
    }
    if (arg === "--emit-gist") {
      const value = argv[index + 1];
      if (!value) usageError("--emit-gist 需要输出路径或 -");
      emitGist = value;
      index += 1;
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
    if (arg === "--chunk") {
      const value = argv[index + 1];
      if (!value) usageError("--chunk 需要分块序号或 all");
      if (value === "all") chunk = "all";
      else {
        const indexValue = Number(value);
        if (!Number.isInteger(indexValue) || indexValue < 1) usageError("--chunk 需要正整数或 all");
        chunk = indexValue;
      }
      index += 1;
      continue;
    }
    if (arg === "--max-dep-depth") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) usageError("--max-dep-depth 需要正整数");
      maxDepDepth = value;
      index += 1;
      continue;
    }
    if (arg === "--style") {
      const value = argv[index + 1];
      if (!value || !isExpressionStyle(value)) usageError(`--style 只能是 ${EXPRESSION_STYLES.join("、")}`);
      expectedStyle = value;
      index += 1;
      continue;
    }
    if (arg === "--author-profile") {
      const value = argv[index + 1];
      if (!value) usageError("--author-profile 需要作家名或档位");
      authorProfile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) usageError(`未知选项：${arg}`);
    if (file) usageError("只接受一个 Markdown 路径");
    file = arg;
  }
  if (!file && !scanDir) usageError("请提供 Markdown 路径或 --scan-dir <目录路径>");
  return { file: file ? resolve(file) : undefined, scanDir: scanDir ? resolve(scanDir) : undefined, level, factsPath: factsPath ? resolve(factsPath) : undefined, expectedStyle, authorProfile, requireFacts, json, hanlp, stsThreshold, maxDepDepth, strictHumanVoice, enforceBaselineFloor, fix, chunk, deterministic, emitFolded, emitAnnotated, emitBeginnerCard, emitGist, habit, textJudgment, readmeReview, emitGrammarMarked };
}

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  const run = async (): Promise<void> => {
    if (args.scanDir) {
      const scanReport = scanDirectoryTextJudgment(args.scanDir);
      if (args.json) process.stdout.write(args.deterministic ? stableJson(scanReport) : `${JSON.stringify(scanReport, null, 2)}\n`);
      else process.stdout.write(`${renderDirectoryScan(scanReport)}\n`);
      process.exit(scanReport.verdict === "PASS" ? 0 : 1);
    }
    const targetFile = args.file!;
    const original = readMarkdown(targetFile);
    const markdown = args.fix ? normalizeOutputMarkdown(original) : original;
    if (args.fix && markdown !== original) writeFileSync(targetFile, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    const precomputedStoryNlp = args.hanlp.enabled ? await analyzeWithHanLP(storyBody(markdown) || markdown, args.hanlp) : undefined;
    const result = analyzeMarkdown(markdown, {
      level: args.level,
      factsPath: args.factsPath,
      expectedStyle: args.expectedStyle,
      authorProfile: args.authorProfile,
      requireFacts: args.requireFacts,
      hanlpOptions: args.hanlp,
      stsThreshold: args.stsThreshold,
      maxDepDepth: args.maxDepDepth,
      strictHumanVoice: args.strictHumanVoice,
      enforceBaselineFloor: args.enforceBaselineFloor,
      precomputedStoryNlp,
      chunk: args.chunk,
      textJudgment: args.textJudgment,
      readmeReview: args.readmeReview,
    });
    if (args.emitGrammarMarked && result.text_recognition_judgment) {
      const marked = result.text_recognition_judgment.grammar_inspection.annotated_markdown;
      if (args.emitGrammarMarked === "-") {
        process.stdout.write(marked.endsWith("\n") ? marked : `${marked}\n`);
        process.exit(0);
      }
      writeFileSync(resolve(args.emitGrammarMarked), marked.endsWith("\n") ? marked : `${marked}\n`, "utf8");
    }
    if (args.emitFolded && result.verdict === "PASS") {
      const folded = projectFoldedPresentation(markdown);
      if (args.emitFolded === "-") {
        process.stdout.write(folded);
        process.exit(0);
      }
      writeFileSync(resolve(args.emitFolded), folded, "utf8");
    }
    if (args.emitAnnotated && result.verdict === "PASS") {
      const annotated = projectAnnotatedPresentation(markdown);
      if (args.emitAnnotated === "-") {
        process.stdout.write(annotated);
        process.exit(0);
      }
      writeFileSync(resolve(args.emitAnnotated), annotated, "utf8");
    }
    if (args.emitBeginnerCard) {
      const card = projectBeginnerCard(markdown);
      if (args.emitBeginnerCard === "-") {
        process.stdout.write(card);
        process.exit(0);
      }
      writeFileSync(resolve(args.emitBeginnerCard), card, "utf8");
    }
    if (args.emitGist) {
      const gist = projectConciseGist(markdown, args.habit);
      if (args.emitGist === "-") {
        process.stdout.write(gist);
        process.exit(0);
      }
      writeFileSync(resolve(args.emitGist), gist, "utf8");
    }
    if (args.json) process.stdout.write(args.deterministic ? stableJson(result) : `${JSON.stringify(result, null, 2)}\n`);
    else process.stdout.write(`${args.deterministic ? renderDeterministic(result) : render(result)}\n`);
    process.exit(result.verdict === "PASS" ? 0 : 1);
  };
  run().catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
