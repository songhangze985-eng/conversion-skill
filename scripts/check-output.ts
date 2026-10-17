#!/usr/bin/env bun
/**
 * Mechanical validation for converted Markdown.
 *
 * `verdict` remains the mechanical gate: structure plus optional fact-term/ID
 * coverage. It is not a claim that the explanation is semantically correct or
 * that a reader understood the mechanism. Semantic quality and comprehension
 * are always reported as needing human or model review.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeWithHanLP, analyzeWithHanLPSync, consumeHanlpArg, evaluateHumanVoiceAndAntiSlop, loadCustomDictionary, parseHanLPCliOptions, type HanLPDocumentAnalysis, type HanLPOptions, type HumanVoiceDiagnostics } from "./hanlp-helper";
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
  factsPath?: string;
  requireFacts?: boolean;
  hanlpOptions?: HanLPOptions;
  stsThreshold?: number;
  maxDepDepth?: number;
  strictHumanVoice?: boolean;
  enforceBaselineFloor?: boolean;
  precomputedStoryNlp?: HanLPDocumentAnalysis;
  chunk?: number | "all";
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
  fact_semantic_scores: Array<{ fact_id: string; claim_similarity: number; matched_semantically: boolean }>;
  lao_yu_readability_score: number;
  human_voice_diagnostics: HumanVoiceDiagnostics;
  syntax_analysis_source: "hanlp_neural_dep" | "local_heuristic_estimate";
  readability_note: string;
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
): ChunkCheckReport[] {
  const prose = body.replace(/<!--[\s\S]*?-->/g, "").trim();
  const rawSections = prose.split(/(?=^##\s+)/m).map((section) => section.trim()).filter(Boolean);
  if (rawSections.length === 0) {
    return typeof targetChunk === "number" ? [emptyChunk(targetChunk, `未找到分块 ${targetChunk}`)] : [];
  }

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
    const hv = evaluateHumanVoiceAndAntiSlop(contentOnly, nlp, style);
    const depthPenalty = Math.max(0, (nlp.depDiagnostics.avgTreeDepth - 4.5) * 6);
    const complexPenalty = nlp.depDiagnostics.complexSentences.length * 5;
    const readability = Math.max(0, Math.min(100, Math.round(100 - depthPenalty - complexPenalty)));
    const avgSents = hv.paragraphCount > 0 ? Number((nlp.sentences.length / hv.paragraphCount).toFixed(2)) : 0;
    const wc = markdownWordCount(contentOnly);
    const violations: string[] = [];

    if (wc < 600 || wc > 800) violations.push(`分块 [${chunkIdx}:${heading}] 字数 ${wc} 不在 600-800`);
    if (style !== "verse") {
      if (hv.paragraphCount < 2) violations.push(`分块 [${chunkIdx}:${heading}] 自然段不足 (${hv.paragraphCount} < 2)`);
      if (avgSents < 1.8) violations.push(`分块 [${chunkIdx}:${heading}] 出现「一行一句」退化 (平均每段仅 ${avgSents} 句 < 1.8)`);
      if (hv.singleSentenceParagraphRatio > 0.35) {
        violations.push(`分块 [${chunkIdx}:${heading}] 单句短碎段占比过高 (${Math.round(hv.singleSentenceParagraphRatio * 100)}% > 35%)`);
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
  const voiceRequested = Boolean(options.strictHumanVoice || options.enforceBaselineFloor || hanlpEnabled);
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
  const structure_verdict: GateVerdict = mapping.ok && verify && level_ok && style_ok && leak_ok ? "PASS" : "FAIL";
  const term_id_coverage_verdict: GateVerdict = coverage.ok ? "PASS" : "FAIL";
  const comprehension_verdict: ComprehensionVerdict = has_comprehension_section
    ? "STRUCTURE_PRESENT_NEEDS_REVIEW"
    : "NOT_REQUESTED";
  const mechanicalVerdict = structure_verdict === "PASS" && term_id_coverage_verdict === "PASS" ? "PASS" : "FAIL";
  const hanlp_report = voiceRequested ? buildHanlpReport(markdown, options, ledger, stsThreshold, style) : undefined;
  const humanVoiceFail = Boolean(options.strictHumanVoice && hanlp_report && humanVoiceBlocks(hanlp_report.human_voice_diagnostics, style));
  const localHeuristic = hanlp_report?.syntax_analysis_source === "local_heuristic_estimate";
  const assistedPass = Boolean(hanlp_report && hanlp_report.lao_yu_readability_score >= 75 && term_id_coverage_verdict === "PASS");
  const semantic_quality_verdict: ReviewVerdict = !hanlpEnabled || !hanlp_report
    ? "NEEDS_REVIEW"
    : localHeuristic
      ? (assistedPass ? "LOCAL_HEURISTIC_PASS" : "LOCAL_HEURISTIC_WARN")
      : (assistedPass ? "HANLP_NEURAL_PASS" : "HANLP_NEURAL_WARN");
  const expression_baseline_report = options.enforceBaselineFloor && hanlp_report
    ? evaluateExpressionBaseline(markdown, storyBody(markdown), verificationText(markdown), mapping, hanlp_report.human_voice_diagnostics, hanlp_report.lao_yu_readability_score, style)
    : undefined;
  const baselineFail = expression_baseline_report?.baseline_verdict === "FAIL";
  const chunk_reports = options.chunk
    ? evaluateChunksIndependently(storyBody(markdown), style ?? options.expectedStyle ?? "anime", options.hanlpOptions, options.chunk)
    : undefined;
  const chunkFail = Boolean(chunk_reports?.some((report) => report.verdict === "FAIL"));
  const verdict = mechanicalVerdict === "PASS" && !humanVoiceFail && !baselineFail && !chunkFail ? "PASS" : "FAIL";

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
  };
}

function humanVoiceBlocks(diagnostics: HumanVoiceDiagnostics, style: string | null): boolean {
  const fragmented = style !== "verse" && diagnostics.paragraphCount >= 3 && diagnostics.singleSentenceParagraphRatio > 0.35;
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
  const fact_semantic_scores = ledger.facts.map((fact) => {
    const claimSimilarity = fact.claim ? computeClaimSimilarity(body, verificationText(markdown), fact.claim, dict) : 0;
    return {
      fact_id: fact.id,
      claim_similarity: claimSimilarity,
      matched_semantically: claimSimilarity >= stsThreshold || normalizedContains(`${body}\n${verificationText(markdown)}`, fact.id),
    };
  });
  const depthPenalty = Math.max(0, (nlp.depDiagnostics.avgTreeDepth - 4) * 8);
  const complexPenalty = nlp.depDiagnostics.complexSentences.filter((sentence) => sentence.treeDepth > maxDepDepth).length * 6;
  const jargonPenalty = Math.min(20, unexplained.length * 4);
  return {
    backend: nlp.backendUsed,
    story_token_count: hanlpTokenCount(body, dict),
    max_dep_tree_depth: nlp.depDiagnostics.maxTreeDepth,
    avg_dep_tree_depth: nlp.depDiagnostics.avgTreeDepth,
    complex_sentences: nlp.depDiagnostics.complexSentences,
    unexplained_jargon: unexplained,
    fact_semantic_scores,
    lao_yu_readability_score: Math.max(0, Math.min(100, Math.round(100 - depthPenalty - complexPenalty - jargonPenalty))),
    human_voice_diagnostics: evaluateHumanVoiceAndAntiSlop(body, nlp, style ?? options.expectedStyle ?? "anime"),
    syntax_analysis_source: nlp.backendUsed === "local-fallback" ? "local_heuristic_estimate" : "hanlp_neural_dep",
    readability_note: nlp.backendUsed === "local-fallback"
      ? "可读性分数来自本地句法估算，不是 HanLP 神经网络依存分析。"
      : "可读性分数使用 HanLP 依存句法深度。",
  };
}

export function normalizeOutputMarkdown(markdown: string): string {
  let text = markdown.replace(/\r\n/g, "\n").replace(/\u00ad/g, "");
  const clicheReplacements: Array<[RegExp, string]> = [
    [/(?:^|(?<=[。！？\n]\s*))(?:简单来说|换句话说|总而言之|综上所述|值得注意的是|需要指出的是|众所周知|不言而喻)[，,：:\s]+/gm, ""],
    [/(?:^|(?<=[。！？\n]\s*))让我们(?:先)?(?:来看看|想象一下)[，,：:\s]*/gm, ""],
  ];
  for (const [pattern, replacement] of clicheReplacements) text = text.replace(pattern, replacement);
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
    if (/^#{1,6}\s/u.test(paragraph) || /^>\s/u.test(paragraph) || /^\|.*\|$/u.test(paragraph)) {
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
): ExpressionBaselineReport {
  const thresholds = DEFAULT_EXPRESSION_BASELINE;
  const violations: string[] = [];
  const prose = body.replace(/<!--[\s\S]*?-->/g, "");
  const paragraphs = prose.split(/\r?\n\s*\r?\n/u).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph && !/^#{1,6}\s/u.test(paragraph));
  const sentenceCount = Math.max(1, prose.split(/[。！？!?]/u).filter((sentence) => sentence.trim().length > 0).length);
  const avgSentences = paragraphs.length > 0 ? Number((sentenceCount / paragraphs.length).toFixed(2)) : 0;
  const avgChars = paragraphs.length > 0 ? Math.round(paragraphs.reduce((sum, paragraph) => sum + markdownWordCount(paragraph), 0) / paragraphs.length) : 0;
  const maxClause = Math.max(0, ...prose.replace(/[“”"']/g, "").split(/[。！？；，：!?;,:\n]+/u).map((clause) => markdownWordCount(clause.trim())));
  const boundaryRows = mapping.rows.filter((row) => (row.boundary ?? "").trim().length >= thresholds.minBoundaryCellChars && !/(?:待填|占位|TBD|TODO|^无$|^略$)/iu.test(row.boundary ?? ""));
  const combined = `${prose}\n${verifySection}`;
  const stages = [
    /(?:当|遇到|一旦|如果|为了|痛点|卡在|需要)/u.test(combined) ? "trigger" : "",
    /(?:先|再|接着|通过|打分|转换|选出|分成)/u.test(combined) ? "action" : "",
    /(?:但是|然而|限制|代价|边界|风险|只对|失效|更像)/u.test(combined) ? "constraint" : "",
    /(?:最终|结果|导致|提高|降低|变成|因此)/u.test(combined) ? "outcome" : "",
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
    },
    violations,
  };
}

function mappingRowsText(markdown: string): string {
  return markdown.split(/\r?\n/u).filter((line) => line.trim().startsWith("|")).join("\n");
}

function computeClaimSimilarity(body: string, verification: string, claim: string, dict: ReturnType<typeof loadCustomDictionary>): number {
  const target = `${body}\n${verification}`;
  return Math.max(semanticContains(target, claim, 0, dict).similarity, normalizedContains(target, claim) ? 1 : 0);
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

function help(): void {
  process.stdout.write(`转换结果校验（Bun/TypeScript）\n\n用法：\n  bun run check-output -- result.md --level default\n  bun run check-output -- result.md --level default --facts C:\\Temp\\fact-ledger.verified.json --style detective\n\n选项：\n  -f, --file <路径>\n  --level <default|expand|long>\n  --facts <路径>        使用带页码锚点的事实清单；每条事实须含 id、claim、sourcePages 或 anchor\n  --strict-facts         未提供 --facts 时失败（PDF 验收应使用）\n  --style <表达风格>     断言文档元数据与预期风格一致\n  --json\n  --hanlp                        附加依存深度、未铺垫术语、语义相似度和人味诊断\n  --strict-human-voice           一行一句占比过高、非人名「·」达到 2 处，或人味分数低于 70 时，总结论改为 FAIL\n  --baseline-floor               用 14 项最低表达水平线验收，未过线则总结论改为 FAIL\n  --fix                          落盘前去掉套话前缀、行首圆点，并合并过短段落\n  --chunk <k|all>                按二级标题逐块验收，任一块失败则总结论为 FAIL\n  --deterministic                人类可读输出收成一行；JSON 键序固定\n  --sts-threshold <0-1>\n  --max-dep-depth <number>\n  --hanlp-mode <auto|restful|native|local-fallback>\n  --hanlp-url <url>\n  --hanlp-auth <key>\n  --hanlp-lang <zh|mul|en>\n  --custom-dict <path>\n  --no-hanlp\n\n结论字段：\n  结构检查              映射表、校验段、篇幅、风格元数据、情况句泄漏\n  事实术语及 ID 覆盖    关键词/事实 ID 是否出现，不能证明机制正确\n  语义质量评估          本工具不能自动判定，固定为需要人工或模型复核\n  用户理解验证          无理解检验则为未请求；有题目也只确认结构存在\n\n兼容：现有 CLI 与 JSON 字段保持不变。verdict 仍是机械门禁，不是语义或理解合格证明。\n`);
}

function parseArgs(argv: string[]): { file: string; level: OutputLevel; factsPath?: string; expectedStyle?: ExpressionStyle; requireFacts: boolean; json: boolean; hanlp: HanLPOptions; stsThreshold?: number; maxDepDepth?: number; strictHumanVoice: boolean; enforceBaselineFloor: boolean; fix: boolean; chunk?: number | "all"; deterministic: boolean } {
  const hanlp = parseHanLPCliOptions(argv);
  let file: string | undefined;
  let level: OutputLevel = "default";
  let factsPath: string | undefined;
  let expectedStyle: ExpressionStyle | undefined;
  let requireFacts = false;
  let json = false;
  let stsThreshold: number | undefined;
  let maxDepDepth: number | undefined;
  let strictHumanVoice = false;
  let enforceBaselineFloor = false;
  let fix = false;
  let chunk: number | "all" | undefined;
  let deterministic = false;

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
    if (arg === "--fix") {
      fix = true;
      continue;
    }
    if (arg === "--deterministic") {
      deterministic = true;
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
    if (arg.startsWith("-")) usageError(`未知选项：${arg}`);
    if (file) usageError("只接受一个 Markdown 路径");
    file = arg;
  }
  if (!file) usageError("请提供 Markdown 路径");
  return { file: resolve(file), level, factsPath: factsPath ? resolve(factsPath) : undefined, expectedStyle, requireFacts, json, hanlp, stsThreshold, maxDepDepth, strictHumanVoice, enforceBaselineFloor, fix, chunk, deterministic };
}

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  const run = async (): Promise<void> => {
    const original = readMarkdown(args.file);
    const markdown = args.fix ? normalizeOutputMarkdown(original) : original;
    if (args.fix && markdown !== original) writeFileSync(args.file, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    const precomputedStoryNlp = args.hanlp.enabled ? await analyzeWithHanLP(storyBody(markdown) || markdown, args.hanlp) : undefined;
    const result = analyzeMarkdown(markdown, {
      level: args.level,
      factsPath: args.factsPath,
      expectedStyle: args.expectedStyle,
      requireFacts: args.requireFacts,
      hanlpOptions: args.hanlp,
      stsThreshold: args.stsThreshold,
      maxDepDepth: args.maxDepDepth,
      strictHumanVoice: args.strictHumanVoice,
      enforceBaselineFloor: args.enforceBaselineFloor,
      precomputedStoryNlp,
      chunk: args.chunk,
    });
    if (args.json) process.stdout.write(args.deterministic ? stableJson(result) : `${JSON.stringify(result, null, 2)}\n`);
    else process.stdout.write(`${args.deterministic ? renderDeterministic(result) : render(result)}\n`);
    process.exit(result.verdict === "PASS" ? 0 : 1);
  };
  run().catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
