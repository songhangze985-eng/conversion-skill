#!/usr/bin/env bun
/**
 * Mechanical validation for converted Markdown.
 *
 * `verdict` remains the mechanical gate: structure plus optional fact-term/ID
 * coverage. It is not a claim that the explanation is semantically correct or
 * that a reader understood the mechanism. Semantic quality and comprehension
 * are always reported as needing human or model review.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EXPRESSION_STYLES,
  LEVEL_LIMITS,
  isExpressionStyle,
  isOutputLevel,
  markdownWordCount,
  normalizedContains,
  printJson,
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
export type ReviewVerdict = "NEEDS_REVIEW";
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
  return { ok: false, rows: [], error: "未找到包含知识概念、故事元素、对应理由的映射表" };
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
  const match = /^>\s*(?:表达风格|皮肤)\s*[：:]\s*`?([a-z-]+)`?\s*$/mu.exec(markdown);
  return match?.[1] ?? null;
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

function factCoverage(markdown: string, mapping: MappingCheck, ledger: LoadedLedger): { covered: string[]; missing: string[]; mappingMissing: string[]; ok: boolean } {
  const content = `${storyBody(markdown)}\n${verificationText(markdown)}`;
  const mappingText = mapping.rows.map((row) => `${row.source}\n${row.story}\n${row.reason}`).join("\n");
  const verification = verificationText(markdown);
  const covered: string[] = [];
  const missing: string[] = [];
  const mappingMissing: string[] = [];

  for (const fact of ledger.facts) {
    const contentMissing = (fact.required_terms ?? []).filter((term) => !normalizedContains(content, term));
    const mappingTerms = fact.mapping_terms ?? [];
    const absentMappingTerms = mappingTerms.filter((term) => !normalizedContains(mappingText, term));
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
  const coverage = factCoverage(markdown, mapping, ledger);
  const leak_ok = voice_leaks.length === 0;
  const has_mapping_bounds = mapping.ok && mapping.rows.length > 0 && mapping.rows.every((row) => Boolean(row.boundary));
  const has_comprehension_section = hasComprehensionSection(markdown);
  const structure_verdict: GateVerdict = mapping.ok && verify && level_ok && style_ok && leak_ok ? "PASS" : "FAIL";
  const term_id_coverage_verdict: GateVerdict = coverage.ok ? "PASS" : "FAIL";
  const semantic_quality_verdict: ReviewVerdict = "NEEDS_REVIEW";
  const comprehension_verdict: ComprehensionVerdict = has_comprehension_section
    ? "STRUCTURE_PRESENT_NEEDS_REVIEW"
    : "NOT_REQUESTED";
  const verdict = structure_verdict === "PASS" && term_id_coverage_verdict === "PASS" ? "PASS" : "FAIL";

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
  };
}

function reviewLabel(verdict: ReviewVerdict | ComprehensionVerdict): string {
  if (verdict === "NOT_REQUESTED") return "未请求（不能据此判断用户已理解）";
  if (verdict === "STRUCTURE_PRESENT_NEEDS_REVIEW") return "已见题目结构，需要人工或模型复核";
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
  if (result.missing.length > 0) lines.push(`  正文/校验未覆盖: ${result.missing.join("；")}`);
  if (result.mapping_missing.length > 0) lines.push(`  映射表未覆盖: ${result.mapping_missing.join("；")}`);
  lines.push(`结论(仅机械门禁): ${result.verdict}`);
  lines.push("说明: 结构或术语覆盖通过，不表示知识准确，也不表示用户已经理解。");
  return lines.join("\n");
}

function help(): void {
  process.stdout.write(`转换结果校验（Bun/TypeScript）\n\n用法：\n  bun run check-output -- result.md --level default\n  bun run check-output -- result.md --level default --facts C:\\Temp\\fact-ledger.verified.json --style detective\n\n选项：\n  -f, --file <路径>\n  --level <default|expand|long>\n  --facts <路径>        使用带页码锚点的事实清单；每条事实须含 id、claim、sourcePages 或 anchor\n  --strict-facts         未提供 --facts 时失败（PDF 验收应使用）\n  --style <表达风格>     断言文档元数据与预期风格一致\n  --json\n\n结论字段：\n  结构检查              映射表、校验段、篇幅、风格元数据、情况句泄漏\n  事实术语及 ID 覆盖    关键词/事实 ID 是否出现，不能证明机制正确\n  语义质量评估          本工具不能自动判定，固定为需要人工或模型复核\n  用户理解验证          无理解检验则为未请求；有题目也只确认结构存在\n\n兼容：现有 CLI 与 JSON 字段保持不变。verdict 仍是机械门禁，不是语义或理解合格证明。\n`);
}

function parseArgs(argv: string[]): { file: string; level: OutputLevel; factsPath?: string; expectedStyle?: ExpressionStyle; requireFacts: boolean; json: boolean } {
  let file: string | undefined;
  let level: OutputLevel = "default";
  let factsPath: string | undefined;
  let expectedStyle: ExpressionStyle | undefined;
  let requireFacts = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
  return { file: resolve(file), level, factsPath: factsPath ? resolve(factsPath) : undefined, expectedStyle, requireFacts, json };
}

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  const result = analyzeMarkdown(readMarkdown(args.file), {
    level: args.level,
    factsPath: args.factsPath,
    expectedStyle: args.expectedStyle,
    requireFacts: args.requireFacts,
  });
  if (args.json) printJson(result);
  else process.stdout.write(`${render(result)}\n`);
  process.exit(result.verdict === "PASS" ? 0 : 1);
}
