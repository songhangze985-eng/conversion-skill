#!/usr/bin/env bun
/**
 * Local-only academic-PDF navigator and evidence preparation helper.
 *
 * It deliberately never invokes Git. Every generated file is written to an
 * operating-system temporary directory (or an explicitly supplied directory
 * outside the repository). It extracts source text and page-anchored evidence,
 * but does not generate a conversion article or certify factual correctness.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { analyzeMarkdown, readMarkdown, type FactLedger } from "./check-output";
import { analyzeWithHanLP, consumeHanlpArg, parseHanLPCliOptions, type HanLPDocumentAnalysis, type HanLPOptions } from "./hanlp-helper";
import { isExpressionStyle, relativeIsInside, stableJson, type ExpressionStyle, usageError } from "./shared";

export type NavigationKind = "title" | "abstract" | "results" | "method" | "conclusion" | "algorithm" | "figure";

export interface PageText {
  page: number;
  text: string;
  characters: number;
  layout_mode?: "single-column" | "two-column";
  math_integrity_warnings?: string[];
}

export interface PdfPositionedTextItem {
  str: string;
  x: number;
  y: number;
  width?: number;
  hasEOL?: boolean;
}

export interface NavigationEntry {
  id: string;
  kind: NavigationKind;
  page: number;
  section: string;
  evidence: string;
}

export interface PaperArtifact {
  id: string;
  kind: "figure" | "table" | "algorithm" | "equation";
  page: number;
  label: string;
  snippet: string;
}

interface PdfEvaluatorArgs {
  pdfPath: string;
  workspace: string;
  style: ExpressionStyle;
  resultPath?: string;
  factsPath?: string;
  renderPages?: "key" | number[];
  popplerPath?: string;
  level: "default" | "expand" | "long";
  hanlp: HanLPOptions;
  deterministic: boolean;
}

const HEADING_PREFIX = String.raw`(?:(?:\d+(?:\.\d+)*|[IVX]{1,5}|[一二三四五六七八九十]+)[.、:\s]+)?`;

const SECTION_PATTERNS: Record<"abstract" | "results" | "method" | "conclusion", RegExp> = {
  abstract: new RegExp(String.raw`(?:^|\n)\s*${HEADING_PREFIX}(?:摘\s*要|abstract)\b`, "imu"),
  results: new RegExp(String.raw`(?:^|\n)\s*${HEADING_PREFIX}(?:实验结果与分析|实验与结果|实验结果|实验评估|结果|experiments?(?:\s+and\s+results)?|results(?:\s+and\s+analysis)?|empirical\s+evaluation|evaluation)\b`, "imu"),
  method: new RegExp(String.raw`(?:^|\n)\s*${HEADING_PREFIX}(?:材料与方法|材料和方法|研究方法|方法论|模型架构|算法设计|核心机制|系统设计|方法|materials\s+and\s+methods|method(?:ology|s)?|proposed\s+(?:method|approach|framework|model|architecture|algorithm)|technical\s+approach|framework|architecture|model\s+design)\b`, "imu"),
  conclusion: new RegExp(String.raw`(?:^|\n)\s*${HEADING_PREFIX}(?:讨论与结论|总结与展望|结论与展望|结论|讨论|conclusion(?:s)?(?:\s+and\s+future\s+work)?|discussion(?:\s+and\s+conclusion)?|summary\s+and\s+conclusion)\b`, "imu"),
};

const SECTION_MAX_CHARS: Record<"abstract" | "results" | "method" | "conclusion", number> = {
  abstract: 1000,
  method: 1200,
  results: 900,
  conclusion: 800,
};

function help(): void {
  process.stdout.write(`本地 PDF 评测准备工具（Bun/TypeScript）\n\n用法：\n  bun run evaluate-pdf -- <论文.pdf> --style war-room --workspace C:\\Temp\\conversion-eval\n  bun run evaluate-pdf -- <论文.pdf> --style detective --workspace C:\\Temp\\conversion-eval --render-pages key\n  bun run evaluate-pdf -- <论文.pdf> --style detective --workspace C:\\Temp\\conversion-eval --result C:\\Temp\\article.md --facts C:\\Temp\\fact-ledger.verified.json\n\n行为：\n  - 必须指定仓库外、无 .git 的空 --workspace；不会复制 PDF 或调用 Git。\n  - 生成 extraction.json、navigation.json、fact-ledger.draft.json、evaluation-manifest.json。\n  - --render-pages 时调用系统 PATH 中的 pdftoppm，或 --poppler 指定的可执行文件。\n  - 仅在传入 --result 与事实清单时写入结构评分卡；不会生成文章或自行宣布 8/8。\n\n选项：\n  --workspace <仓库外目录>\n  --style <anime|detective|war-room|nature-documentary|verse|narrative|podcast|neutral>\n  --result <仓库外 Markdown>\n  --facts <仓库外 fact-ledger.verified.json>\n  --level <default|expand|long>\n  --render-pages <key|1,3,5>\n  --render                         兼容别名，等同于 --render-pages key\n  --poppler <pdftoppm 路径>\n  --hanlp                          从导航页抽取关键词、实体和语义角色，写入草稿事实清单\n  --hanlp-mode <auto|restful|native|local-fallback>\n  --hanlp-url <url>\n  --hanlp-auth <key>\n  --hanlp-lang <zh|mul|en>\n  --custom-dict <path>\n  --no-hanlp\n  --deterministic                  清单不写耗时，JSON 键序固定\n`);
}

function parseArgs(argv: string[]): PdfEvaluatorArgs {
  const hanlp = parseHanLPCliOptions(argv);
  let pdfPath: string | undefined;
  let workspace: string | undefined;
  let style: ExpressionStyle | undefined;
  let resultPath: string | undefined;
  let factsPath: string | undefined;
  let renderPages: PdfEvaluatorArgs["renderPages"];
  let popplerPath: string | undefined;
  let level: PdfEvaluatorArgs["level"] = "default";
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
    if (arg === "--workspace" || arg === "--output-dir") {
      workspace = argv[index + 1];
      if (!workspace) usageError(`${arg} 需要路径`);
      index += 1;
      continue;
    }
    if (arg === "--style") {
      const value = argv[index + 1];
      if (!value || !isExpressionStyle(value)) usageError("--style 需要有效的表达风格");
      style = value;
      index += 1;
      continue;
    }
    if (arg === "--result") {
      resultPath = argv[index + 1];
      if (!resultPath) usageError("--result 需要 Markdown 路径");
      index += 1;
      continue;
    }
    if (arg === "--facts") {
      factsPath = argv[index + 1];
      if (!factsPath) usageError("--facts 需要 JSON 路径");
      index += 1;
      continue;
    }
    if (arg === "--render") {
      renderPages = "key";
      continue;
    }
    if (arg === "--render-pages") {
      const value = argv[index + 1];
      if (!value) usageError("--render-pages 需要 key 或逗号分隔页码");
      if (value === "key") {
        renderPages = "key";
      } else {
        const pages = value.split(",").map((page) => Number.parseInt(page.trim(), 10));
        if (pages.length === 0 || pages.some((page) => !Number.isInteger(page) || page < 1)) {
          usageError("--render-pages 需要 key 或正整数页码，例如 1,3,5");
        }
        renderPages = [...new Set(pages)];
      }
      index += 1;
      continue;
    }
    if (arg === "--poppler") {
      popplerPath = argv[index + 1];
      if (!popplerPath) usageError("--poppler 需要 pdftoppm 可执行文件路径");
      index += 1;
      continue;
    }
    if (arg === "--deterministic") {
      deterministic = true;
      continue;
    }
    if (arg === "--level") {
      const value = argv[index + 1];
      if (value !== "default" && value !== "expand" && value !== "long") usageError("--level 只能是 default、expand 或 long");
      level = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) usageError(`未知选项：${arg}`);
    if (pdfPath) usageError("只接受一个 PDF 路径");
    pdfPath = arg;
  }
  if (!pdfPath) usageError("请提供 PDF 路径");
  if (!style) usageError("请用 --style 明确选择表达风格");
  if (!workspace) usageError("请用 --workspace 指定仓库外的空临时目录");
  return {
    pdfPath: resolve(pdfPath),
    workspace: resolve(workspace),
    style,
    resultPath: resultPath ? resolve(resultPath) : undefined,
    factsPath: factsPath ? resolve(factsPath) : undefined,
    renderPages,
    popplerPath: popplerPath ? resolve(popplerPath) : undefined,
    level,
    hanlp,
    deterministic,
  };
}

function repositoryRoot(): string {
  return resolve(import.meta.dir, "..");
}

function assertOutsideRepository(path: string, label: string): void {
  const root = repositoryRoot();
  if (relativeIsInside(root, resolve(path))) {
    usageError(`${label} 必须位于仓库之外，以防论文或评测产物进入最终成果：${path}`);
  }
}

function findGitMarker(path: string): string | undefined {
  let current = resolve(path);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function createWorkspace(workspace: string): Promise<string> {
  assertOutsideRepository(workspace, "--workspace");
  if (!existsSync(workspace)) usageError("--workspace 必须是调用方预先创建的临时目录");
  const gitMarker = findGitMarker(workspace);
  if (gitMarker) usageError(`--workspace 不能位于含 .git 的工作树中，以杜绝上传途径：${gitMarker}`);
  const entries = await readdir(workspace);
  if (entries.length > 0) usageError("--workspace 必须是空目录，避免覆盖已有评测产物");
  return workspace;
}

export function normalizePdfAcademicText(raw: string): { text: string; mathWarnings: string[] } {
  const mathWarnings: string[] = [];
  if (/\ufffd/u.test(raw)) {
    mathWarnings.push("检测到 Unicode 替换符 (U+FFFD)，PDF 内嵌公式或特殊符号字库可能存在乱码缺失");
  }
  if (/[\uE000-\uF8FF]/u.test(raw)) {
    mathWarnings.push("检测到私用区字形 (PUA Glyphs)，LaTeX 数学符号（如积分/求和/括号扩展符）可能未映射为标准字符");
  }
  if (/[\x01-\x08\x0B\x0C\x0E-\x1F]/u.test(raw)) {
    mathWarnings.push("检测到底层控制字符残留，公式上下标或算子字形可能发生断层");
  }

  const text = raw
    .replace(/\u0000/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .replace(/[\uE000-\uF8FF]/g, " ")
    .replace(/ﬀ/gu, "ff")
    .replace(/ﬁ/gu, "fi")
    .replace(/ﬂ/gu, "fl")
    .replace(/ﬃ/gu, "ffi")
    .replace(/ﬄ/gu, "ffl")
    .replace(/ﬅ/gu, "ft")
    .replace(/ﬆ/gu, "st")
    .replace(/([A-Za-z]{2,})-\r?\n([a-z]{2,})/gu, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { text, mathWarnings };
}

function mergeLineItems(items: PdfPositionedTextItem[]): string[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 2.8) return b.y - a.y;
    return a.x - b.x;
  });
  const lines: string[] = [];
  let currentItems: PdfPositionedTextItem[] = [];
  let currentY: number | null = null;

  const flush = (): void => {
    if (currentItems.length === 0) return;
    currentItems.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEndX: number | null = null;
    for (const it of currentItems) {
      if (!it.str) continue;
      const gap = prevEndX !== null ? it.x - prevEndX : 0;
      const needsSpace =
        line.length > 0 &&
        !line.endsWith(" ") &&
        !it.str.startsWith(" ") &&
        (gap > 1.5 || /[A-Za-z0-9]$/u.test(line) && /^[A-Za-z0-9]/u.test(it.str));
      line += (needsSpace ? " " : "") + it.str;
      const estWidth = it.width !== undefined && it.width > 0 ? it.width : it.str.length * 4.8;
      prevEndX = it.x + estWidth;
    }
    if (line.trim()) lines.push(line.trim());
    currentItems = [];
    currentY = null;
  };

  for (const item of sorted) {
    if (!item.str && !item.hasEOL) continue;
    if (currentY !== null && Math.abs(item.y - currentY) > 2.8) {
      flush();
    }
    if (item.str) {
      currentItems.push(item);
      if (currentY === null) currentY = item.y;
    }
    if (item.hasEOL && currentItems.length > 0 && currentItems.length > 8) {
      // Preserve coordinate grouping over premature mid-column EOL flags
    }
  }
  flush();
  return lines;
}

export function sortPdfTextItemsTwoColumn(
  items: PdfPositionedTextItem[],
  pageWidth = 612,
): { lines: string[]; layoutMode: "single-column" | "two-column" } {
  const nonEmpty = items.filter((it) => it.str.trim().length > 0);
  if (nonEmpty.length === 0) return { lines: [], layoutMode: "single-column" };

  const midX = pageWidth / 2;
  const classify = (it: PdfPositionedTextItem): "left" | "right" | "full" => {
    const estW = it.width !== undefined && it.width > 0 ? it.width : it.str.length * 4.8;
    const endX = it.x + estW;
    if (it.x < midX - 14 && endX <= midX + 16) return "left";
    if (it.x >= midX - 12) return "right";
    return "full";
  };

  // Sort top-to-bottom first to partition around full-width barriers (title, full-width abstract, banner captions)
  const byYDesc = [...nonEmpty].sort((a, b) => (Math.abs(b.y - a.y) > 2.8 ? b.y - a.y : a.x - b.x));
  interface Segment {
    kind: "full" | "columns";
    items: PdfPositionedTextItem[];
  }
  const segments: Segment[] = [];
  for (const it of byYDesc) {
    const role = classify(it);
    const segKind = role === "full" ? "full" : "columns";
    const last = segments[segments.length - 1];
    if (!last || last.kind !== segKind) {
      segments.push({ kind: segKind, items: [it] });
    } else {
      last.items.push(it);
    }
  }

  let detectedTwoColumn = false;
  const outputLines: string[] = [];
  for (const seg of segments) {
    if (seg.kind === "full") {
      outputLines.push(...mergeLineItems(seg.items));
      continue;
    }
    const leftItems = seg.items.filter((it) => classify(it) === "left");
    const rightItems = seg.items.filter((it) => classify(it) === "right");
    const leftLines = mergeLineItems(leftItems);
    const rightLines = mergeLineItems(rightItems);
    if (leftLines.length >= 2 && rightLines.length >= 2) {
      detectedTwoColumn = true;
      outputLines.push(...leftLines, ...rightLines);
    } else {
      outputLines.push(...mergeLineItems(seg.items));
    }
  }

  return {
    lines: outputLines,
    layoutMode: detectedTwoColumn ? "two-column" : "single-column",
  };
}

async function extractPages(pdfPath: string): Promise<{ pages: PageText[]; pageCount: number }> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true, useWorkerFetch: false });
  const document = await loadingTask.promise;
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const positionedItems: PdfPositionedTextItem[] = [];
    let hasValidCoords = false;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : undefined;
      const x = typeof transform?.[4] === "number" ? transform[4] : 0;
      const y = typeof transform?.[5] === "number" ? transform[5] : 0;
      if (typeof transform?.[4] === "number" && typeof transform?.[5] === "number") {
        hasValidCoords = true;
      }
      const width = "width" in item && typeof item.width === "number" ? item.width : undefined;
      positionedItems.push({
        str: item.str,
        x,
        y,
        width,
        hasEOL: Boolean(item.hasEOL),
      });
    }

    let rawJoined = "";
    let layoutMode: "single-column" | "two-column" = "single-column";
    if (hasValidCoords) {
      const sorted = sortPdfTextItemsTwoColumn(positionedItems, viewport?.width || 612);
      rawJoined = sorted.lines.join("\n");
      layoutMode = sorted.layoutMode;
    } else {
      rawJoined = positionedItems.map((it) => it.str).join("\n");
    }

    const { text, mathWarnings } = normalizePdfAcademicText(rawJoined);
    pages.push({
      page: pageNumber,
      text,
      characters: text.length,
      layout_mode: layoutMode,
      ...(mathWarnings.length > 0 ? { math_integrity_warnings: mathWarnings } : {}),
    });
  }
  const closers = [document as { destroy?: () => Promise<void>; cleanup?: () => void }, loadingTask as { destroy?: () => Promise<void> }];
  if (typeof closers[0].destroy === "function") await closers[0].destroy();
  else if (typeof closers[0].cleanup === "function") closers[0].cleanup();
  if (typeof closers[1].destroy === "function") await closers[1].destroy();
  return { pages, pageCount: pages.length };
}

function isRunningHeaderOrBannerLine(line: string): boolean {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/u).filter(Boolean);
  const singleLetterRatio = tokens.length === 0 ? 0 : tokens.filter((token) => token.length === 1).length / tokens.length;
  if (singleLetterRatio > 0.6) return true;
  if (trimmed.length < 12) return true;
  if (/sci\.?\s*adv|science advances|research article|computer science|^\d+\s+of\s+\d+/iu.test(trimmed)) return true;
  if (/^doshi and hauser/iu.test(trimmed)) return true;
  if (/\b(?:19|20)\d{2}\b/u.test(trimmed) && /\b(?:doi|vol\.|eadn\d+)/iu.test(trimmed)) return true;
  return false;
}

export function truncateEvidence(text: string, maximum = 420): string {
  const compact = text.replace(/\s+/gu, " ").trim();
  if (compact.length <= maximum) return compact;
  const slice = compact.slice(0, maximum);
  const lastPeriod = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf(". "), slice.lastIndexOf("；"), slice.lastIndexOf("; "));
  if (lastPeriod >= Math.floor(maximum * 0.65)) {
    return slice.slice(0, lastPeriod + 1).trimEnd();
  }
  return `${slice.trimEnd()}…`;
}

function titleEvidence(pages: PageText[]): NavigationEntry | undefined {
  const first = pages[0];
  if (!first?.text) return undefined;
  const lines = first.text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const titleLines: string[] = [];
  for (const line of lines) {
    if (isRunningHeaderOrBannerLine(line)) continue;
    if (/^(?:摘要|abstract|关键词|keywords|introduction|引言)$/iu.test(line)) break;
    if (/^[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+/u.test(line) && line.length < 40) break;
    if (/^\*?\s*and\s+[A-Z]/u.test(line)) break;
    titleLines.push(line);
    if (titleLines.join(" ").length > 180) break;
  }
  const candidate = titleLines.join(" ").replace(/\s+/gu, " ").trim();
  if (candidate.length < 12) return undefined;
  return { id: "N01", kind: "title", page: first.page, section: "title", evidence: truncateEvidence(candidate) };
}

function untitledAbstract(pages: PageText[]): NavigationEntry | undefined {
  const first = pages[0];
  if (!first?.text || sectionEvidence("abstract", pages)) return undefined;
  const intro = /\n\s*(?:(?:\d+\.?|I\.?)\s+)?introduction\b/iu.exec(first.text);
  if (!intro || intro.index === undefined) return undefined;
  const before = first.text.slice(0, intro.index);
  const lines = before.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 80 && !isRunningHeaderOrBannerLine(line));
  const body = lines.join(" ").replace(/\s+/gu, " ").trim();
  if (body.length < 180) return undefined;
  return { id: "", kind: "abstract", page: first.page, section: "abstract", evidence: truncateEvidence(body, 1200) };
}

function sectionEvidence(kind: "abstract" | "results" | "method" | "conclusion", pages: PageText[]): NavigationEntry | undefined {
  const pattern = SECTION_PATTERNS[kind];
  const maxChars = SECTION_MAX_CHARS[kind];
  const page = pages.find((item) => item.text.split(/\r?\n/u).some((line) => {
    const trimmed = line.trim();
    return trimmed.length <= 68 && pattern.test(`\n${trimmed}`);
  }));
  if (!page) return undefined;
  const headingLine = page.text.split(/\r?\n/u).find((line) => {
    const trimmed = line.trim();
    return trimmed.length <= 68 && pattern.test(`\n${trimmed}`);
  }) ?? "";
  const headingIndex = page.text.indexOf(headingLine);
  const fromHeading = headingIndex < 0 ? page.text : page.text.slice(headingIndex);
  return {
    id: "",
    kind,
    page: page.page,
    section: kind,
    evidence: truncateEvidence(fromHeading, maxChars),
  };
}

export function extractPaperArtifacts(pages: PageText[]): PaperArtifact[] {
  const artifacts: PaperArtifact[] = [];
  const figTabRegex = /^(?:Fig(?:ure)?\.?\s*\d+|Table\s*\d+|图\s*\d+|表\s*\d+)\s*[:.：]?\s*(.{10,260})/imu;
  const algoRegex = /^(?:Algorithm\s*\d+|算法\s*\d+|Procedure\s+\w+)\s*[:.：]?\s*(.{6,260})/imu;
  const eqRegex = /(?:[A-Za-z0-9_()]+\s*=\s*[^.\n]{6,120}(?:\(\d+\)|（\d+）)|\\(?:sum|frac|argmax|argmin|softmax|mathcal)\b[^.\n]{4,120})/imu;

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const windowText = [line, lines[i + 1] ?? ""].join(" ").trim();
      const figMatch = windowText.match(figTabRegex);
      if (figMatch) {
        const isTable = /^(?:Table|表)/iu.test(windowText);
        const labelMatch = windowText.match(/^(?:Fig(?:ure)?\.?\s*\d+|Table\s*\d+|图\s*\d+|表\s*\d+)/iu);
        artifacts.push({
          id: `A${String(artifacts.length + 1).padStart(2, "0")}`,
          kind: isTable ? "table" : "figure",
          page: page.page,
          label: labelMatch?.[0]?.trim() ?? (isTable ? "Table" : "Figure"),
          snippet: truncateEvidence(windowText, 320),
        });
        continue;
      }
      const algoMatch = windowText.match(algoRegex);
      if (algoMatch) {
        const labelMatch = windowText.match(/^(?:Algorithm\s*\d+|算法\s*\d+|Procedure\s+\w+)/iu);
        const blockWindow = lines.slice(i, i + 6).join(" ");
        artifacts.push({
          id: `A${String(artifacts.length + 1).padStart(2, "0")}`,
          kind: "algorithm",
          page: page.page,
          label: labelMatch?.[0]?.trim() ?? "Algorithm",
          snippet: truncateEvidence(blockWindow, 400),
        });
        continue;
      }
      const eqMatch = line.match(eqRegex);
      if (eqMatch) {
        const eqNum = line.match(/(?:\((\d+)\)|（(\d+)）)\s*$/u);
        artifacts.push({
          id: `A${String(artifacts.length + 1).padStart(2, "0")}`,
          kind: "equation",
          page: page.page,
          label: eqNum ? `Equation (${eqNum[1] ?? eqNum[2]})` : `Equation p.${page.page}`,
          snippet: truncateEvidence(line, 240),
        });
      }
    }
  }
  return artifacts.slice(0, 20);
}

function fallbackMethodEvidence(pages: PageText[]): NavigationEntry | undefined {
  const excludedHeadingRe =
    /\b(?:abstract|introduction|background|preliminar(?:y|ies)|related\s+work|prior\s+work|experiments?|results?|evaluation|discussion|conclusions?|acknowledge?ments?|references|bibliography|appendix|supplementary)\b|(?:摘\s*要|引\s*言|绪\s*论|相关工作|研究背景|实验|结果|评估|讨论|结论|致谢|参考文献|附录)/iu;
  const numberedHeadingRe = /^(?:[2-6](?:\.\d+)?|[IIVX]{1,4}|[二三四五六])[.、:\s]+([A-Z\u4e00-\u9fff][^\n]{2,64})$/u;
  const techSignalRe =
    /\b(?:algorithm|architecture|mechanism|attention|kernel|loss|objective|gradient|matrix|tensor|protocol|consensus|complexity|theorem|proposition|formulation|pipeline|module|layer)\b|(?:算法|架构|机制|复杂度|公式|矩阵|协议|模块|推导|目标函数)|=\s*[A-Za-z0-9\\(]/iu;

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/u);
    for (let idx = 0; idx < lines.length; idx += 1) {
      const trimmed = lines[idx]?.trim() ?? "";
      if (trimmed.length > 72) continue;
      const m = trimmed.match(numberedHeadingRe);
      if (!m) continue;
      if (excludedHeadingRe.test(trimmed)) continue;
      const headingPos = page.text.indexOf(trimmed);
      const windowSnippet = headingPos >= 0 ? page.text.slice(headingPos, headingPos + SECTION_MAX_CHARS.method) : lines.slice(idx, idx + 18).join("\n");
      if (windowSnippet.length >= 80 && techSignalRe.test(windowSnippet)) {
        return {
          id: "",
          kind: "method",
          page: page.page,
          section: "method",
          evidence: truncateEvidence(windowSnippet, SECTION_MAX_CHARS.method),
        };
      }
    }
  }
  return undefined;
}

export function buildNavigation(pages: PageText[]): NavigationEntry[] {
  const entries = [
    titleEvidence(pages),
    sectionEvidence("abstract", pages) ?? untitledAbstract(pages),
    sectionEvidence("results", pages),
    sectionEvidence("method", pages) ?? fallbackMethodEvidence(pages),
    sectionEvidence("conclusion", pages),
  ].filter((entry): entry is NavigationEntry => entry !== undefined);
  return entries.map((entry, index) => ({ ...entry, id: `N${String(index + 1).padStart(2, "0")}` }));
}

function enrichDraftWithHanlp(draft: Record<string, unknown>, analysis: HanLPDocumentAnalysis): Record<string, unknown> {
  const facts = Array.isArray(draft.facts) ? draft.facts : [];
  const keyphrases = analysis.keyphrases.map((item) => item.phrase);
  draft.facts = facts.map((raw) => {
    const fact = raw as { evidence?: string; required_terms?: string[]; mapping_terms?: string[]; claim?: string };
    const evidence = fact.evidence ?? "";
    const localTerms = [...new Set([...keyphrases, ...analysis.entities.map((entity) => entity.text)])]
      .filter((term) => term.length >= 2 && evidence.includes(term))
      .slice(0, 8);
    const firstSentence = evidence.split(/(?<=[。！？.!?])/u)[0]?.trim() ?? "";
    return {
      ...fact,
      claim: fact.claim || firstSentence,
      required_terms: fact.required_terms?.length ? fact.required_terms : localTerms,
      mapping_terms: fact.mapping_terms?.length ? fact.mapping_terms : localTerms,
    };
  });
  draft.hanlp_auxiliary_metrics = {
    backend: analysis.backendUsed,
    sentence_count: analysis.sentences.length,
    keyphrases: analysis.keyphrases,
    entities: analysis.entities.map((entity) => ({ text: entity.text, type: entity.type })),
    srl_frame_count: analysis.srlFrames.length,
    avg_dep_depth: analysis.depDiagnostics.avgTreeDepth,
  };
  return draft;
}

export function draftLedger(sourcePdf: string, navigation: NavigationEntry[], artifacts: PaperArtifact[] = []): Record<string, unknown> {
  return {
    schema_version: "1.0",
    review_status: "draft",
    source: {
      file_name: basename(sourcePdf),
      note: "该草稿仅保存页码锚点与原文证据；请在仓库外人工或模型核验后创建 review_status: verified 的清单。",
    },
    facts: navigation.map((entry, index) => ({
      id: `F${String(index + 1).padStart(2, "0")}`,
      claim: "",
      required_terms: [],
      mapping_terms: [],
      anchor: { page: entry.page, section: entry.section },
      evidence: entry.evidence,
      review_note: "填写可追溯、可检验的事实陈述和覆盖术语；不要从叙事表达反推事实。",
    })),
    ...(artifacts.length > 0 ? { structured_artifacts: artifacts } : {}),
  };
}

async function renderSelectedPages(pdfPath: string, workspace: string, pages: number[], executableOverride?: string): Promise<{ pages: number[]; files: string[] }> {
  const executable = executableOverride ?? Bun.which("pdftoppm");
  if (!executable) {
    usageError("请求了 --render，但未在 PATH 找到 pdftoppm；请安装 Poppler 或通过 --poppler 指定其路径");
  }
  if (!existsSync(executable)) usageError(`pdftoppm 不存在：${executable}`);
  const renderedDir = join(workspace, "rendered-pages");
  await mkdir(renderedDir, { recursive: true });
  const files: string[] = [];
  for (const page of pages) {
    const prefix = join(renderedDir, `page-${String(page).padStart(3, "0")}`);
    const process = Bun.spawn([executable, "-f", String(page), "-l", String(page), "-singlefile", "-png", pdfPath, prefix], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await process.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(process.stderr).text();
      usageError(`Poppler 渲染第 ${page} 页失败：${stderr.trim()}`);
    }
    files.push(`${prefix}.png`);
  }
  return { pages, files };
}

async function readVerifiedLedger(path: string): Promise<FactLedger> {
  try {
    return JSON.parse(await Bun.file(path).text()) as FactLedger;
  } catch (error) {
    usageError(`无法读取 --facts：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (extname(args.pdfPath).toLocaleLowerCase() !== ".pdf") usageError("输入文件必须是 .pdf");
  if (!existsSync(args.pdfPath)) usageError(`PDF 不存在：${args.pdfPath}`);
  if (args.resultPath) assertOutsideRepository(args.resultPath, "--result");
  if (args.factsPath) assertOutsideRepository(args.factsPath, "--facts");
  if (args.resultPath && !args.factsPath) usageError("带 --result 的 PDF 验收必须同时提供已核验的 --facts");
  if (args.factsPath && !args.resultPath) usageError("--facts 仅在同时提供 --result 时用于生成评分卡");

  const startedAt = performance.now();
  const outputDir = await createWorkspace(args.workspace);
  const extracted = await extractPages(args.pdfPath);
  const navigation = buildNavigation(extracted.pages);
  const artifacts = extractPaperArtifacts(extracted.pages);
  const draft = draftLedger(args.pdfPath, navigation, artifacts);
  if (args.hanlp.enabled) {
    const navigationText = navigation.map((entry) => entry.evidence).join("\n");
    enrichDraftWithHanlp(draft, await analyzeWithHanLP(navigationText, args.hanlp));
  }
  await writeFile(join(outputDir, "extraction.json"), `${JSON.stringify({ page_count: extracted.pageCount, pages: extracted.pages }, null, 2)}\n`, "utf8");
  await writeFile(join(outputDir, "navigation.json"), `${JSON.stringify({ entries: navigation, ...(artifacts.length > 0 ? { artifacts } : {}) }, null, 2)}\n`, "utf8");
  await writeFile(join(outputDir, "fact-ledger.draft.json"), `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  let rendered: { pages: number[]; files: string[] } | undefined;
  if (args.renderPages) {
    const pages = args.renderPages === "key" ? [...new Set(navigation.map((entry) => entry.page))] : args.renderPages;
    if (pages.some((page) => page > extracted.pageCount)) usageError(`--render-pages 包含超出 PDF 页数（${extracted.pageCount}）的页码`);
    rendered = await renderSelectedPages(args.pdfPath, outputDir, pages, args.popplerPath);
  }

  let structuralCheck: ReturnType<typeof analyzeMarkdown> | undefined;
  if (args.resultPath && args.factsPath) {
    await readVerifiedLedger(args.factsPath);
    const resultText = readMarkdown(args.resultPath);
    const precomputedStoryNlp = args.hanlp.enabled ? await analyzeWithHanLP(resultText, args.hanlp) : undefined;
    structuralCheck = analyzeMarkdown(resultText, {
      level: args.level,
      expectedStyle: args.style,
      factsPath: args.factsPath,
      requireFacts: true,
      hanlpOptions: args.hanlp,
      precomputedStoryNlp,
    });
    await writeFile(join(outputDir, "scorecard.json"), `${JSON.stringify({
      structural_check: structuralCheck,
      human_rubric: {
        required_dimensions: ["能懂", "保真", "同构", "表达不挡懂"],
        rule: "四项均需人工或独立模型给出 2/2，才可宣称总分 8/8。结构检查 PASS 或事实 ID 覆盖 PASS 都不能代替语义质量或用户理解。",
      },
      hanlp_auxiliary_metrics: structuralCheck.hanlp_report,
      mechanical: {
        structure_verdict: structuralCheck.structure_verdict,
        term_id_coverage_verdict: structuralCheck.term_id_coverage_verdict,
        semantic_quality_verdict: structuralCheck.semantic_quality_verdict,
        comprehension_verdict: structuralCheck.comprehension_verdict,
      },
      verdict: structuralCheck.verdict === "PASS" ? "PENDING_HUMAN_8_OF_8_REVIEW" : "STRUCTURAL_FAIL",
    }, null, 2)}\n`, "utf8");
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  const manifest = {
    tool: "conversion-skill/evaluate-pdf",
    source_pdf: basename(args.pdfPath),
    workspace: outputDir,
    style: args.style,
    page_count: extracted.pageCount,
    navigation_entries: navigation.length,
    rendered,
    structural_check: structuralCheck ? structuralCheck.verdict : "NOT_RUN",
    ...(args.deterministic ? {} : { elapsed_ms: elapsedMs }),
    cleanup: "该目录是一次性本地测试产物；验收完成后由调用者删除。",
    git: "本工具不调用 Git，且拒绝把产物写入仓库。",
  };
  const manifestText = args.deterministic ? stableJson(manifest) : `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(outputDir, "evaluation-manifest.json"), manifestText);
  process.stdout.write(manifestText);
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(2);
  });
}
