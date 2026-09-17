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
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { analyzeMarkdown, readMarkdown, type FactLedger } from "./check-output";
import { isExpressionStyle, printJson, relativeIsInside, type ExpressionStyle, usageError } from "./shared";

type NavigationKind = "title" | "abstract" | "method" | "conclusion";

interface PageText {
  page: number;
  text: string;
  characters: number;
}

interface NavigationEntry {
  id: string;
  kind: NavigationKind;
  page: number;
  section: string;
  evidence: string;
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
}

const SECTION_PATTERNS: Record<Exclude<NavigationKind, "title">, RegExp> = {
  abstract: /(?:^|\n)\s*(?:摘要|abstract)\b/imu,
  method: /(?:^|\n)\s*(?:方法|研究方法|方法论|method(?:ology)?|approach|model)\b/imu,
  conclusion: /(?:^|\n)\s*(?:结论|讨论与结论|conclusion|conclusions|discussion)\b/imu,
};

function help(): void {
  process.stdout.write(`本地 PDF 评测准备工具（Bun/TypeScript）\n\n用法：\n  bun run evaluate-pdf -- <论文.pdf> --style war-room --workspace C:\\Temp\\conversion-eval\n  bun run evaluate-pdf -- <论文.pdf> --style detective --workspace C:\\Temp\\conversion-eval --render-pages key\n  bun run evaluate-pdf -- <论文.pdf> --style detective --workspace C:\\Temp\\conversion-eval --result C:\\Temp\\article.md --facts C:\\Temp\\fact-ledger.verified.json\n\n行为：\n  - 必须指定仓库外、无 .git 的空 --workspace；不会复制 PDF 或调用 Git。\n  - 生成 extraction.json、navigation.json、fact-ledger.draft.json、evaluation-manifest.json。\n  - --render-pages 时调用系统 PATH 中的 pdftoppm，或 --poppler 指定的可执行文件。\n  - 仅在传入 --result 与事实清单时写入结构评分卡；不会生成文章或自行宣布 8/8。\n\n选项：\n  --workspace <仓库外目录>\n  --style <anime|detective|war-room|nature-documentary|neutral>\n  --result <仓库外 Markdown>\n  --facts <仓库外 fact-ledger.verified.json>\n  --level <default|expand|long>\n  --render-pages <key|1,3,5>\n  --render                         兼容别名，等同于 --render-pages key\n  --poppler <pdftoppm 路径>\n`);
}

function parseArgs(argv: string[]): PdfEvaluatorArgs {
  let pdfPath: string | undefined;
  let workspace: string | undefined;
  let style: ExpressionStyle | undefined;
  let resultPath: string | undefined;
  let factsPath: string | undefined;
  let renderPages: PdfEvaluatorArgs["renderPages"];
  let popplerPath: string | undefined;
  let level: PdfEvaluatorArgs["level"] = "default";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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

function normalizePdfText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPages(pdfPath: string): Promise<{ pages: PageText[]; pageCount: number }> {
  const data = new Uint8Array(await readFile(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true, useWorkerFetch: false });
  const document = await loadingTask.promise;
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str;
      if (item.hasEOL) text += "\n";
      else text += " ";
    }
    text = normalizePdfText(text);
    pages.push({ page: pageNumber, text, characters: text.length });
  }
  await document.destroy();
  return { pages, pageCount: pages.length };
}

function truncateEvidence(text: string, maximum = 420): string {
  const compact = text.replace(/\s+/gu, " ").trim();
  return compact.length <= maximum ? compact : `${compact.slice(0, maximum).trimEnd()}…`;
}

function titleEvidence(pages: PageText[]): NavigationEntry | undefined {
  const first = pages[0];
  if (!first?.text) return undefined;
  const candidate = first.text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length >= 6 && line.length <= 220 && !/^(?:摘要|abstract|关键词|keywords)$/iu.test(line));
  if (!candidate) return undefined;
  return { id: "N01", kind: "title", page: first.page, section: "title", evidence: truncateEvidence(candidate) };
}

function sectionEvidence(kind: Exclude<NavigationKind, "title">, pages: PageText[]): NavigationEntry | undefined {
  const pattern = SECTION_PATTERNS[kind];
  const page = pages.find((item) => pattern.test(item.text));
  if (!page) return undefined;
  const headingMatch = pattern.exec(page.text);
  const fromHeading = headingMatch?.index === undefined ? page.text : page.text.slice(headingMatch.index);
  return {
    id: "",
    kind,
    page: page.page,
    section: kind,
    evidence: truncateEvidence(fromHeading),
  };
}

function buildNavigation(pages: PageText[]): NavigationEntry[] {
  const entries = [
    titleEvidence(pages),
    sectionEvidence("abstract", pages),
    sectionEvidence("method", pages),
    sectionEvidence("conclusion", pages),
  ].filter((entry): entry is NavigationEntry => entry !== undefined);
  return entries.map((entry, index) => ({ ...entry, id: `N${String(index + 1).padStart(2, "0")}` }));
}

function draftLedger(sourcePdf: string, navigation: NavigationEntry[]): Record<string, unknown> {
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
  const draft = draftLedger(args.pdfPath, navigation);
  await writeFile(join(outputDir, "extraction.json"), `${JSON.stringify({ page_count: extracted.pageCount, pages: extracted.pages }, null, 2)}\n`, "utf8");
  await writeFile(join(outputDir, "navigation.json"), `${JSON.stringify({ entries: navigation }, null, 2)}\n`, "utf8");
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
    structuralCheck = analyzeMarkdown(readMarkdown(args.resultPath), {
      level: args.level,
      expectedStyle: args.style,
      factsPath: args.factsPath,
      requireFacts: true,
    });
    await writeFile(join(outputDir, "scorecard.json"), `${JSON.stringify({
      structural_check: structuralCheck,
      human_rubric: {
        required_dimensions: ["能懂", "保真", "同构", "表达不挡懂"],
        rule: "四项均需人工或独立模型给出 2/2，才可宣称总分 8/8。结构检查 PASS 或事实 ID 覆盖 PASS 都不能代替语义质量或用户理解。",
      },
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
    elapsed_ms: elapsedMs,
    cleanup: "该目录是一次性本地测试产物；验收完成后由调用者删除。",
    git: "本工具不调用 Git，且拒绝把产物写入仓库。",
  };
  await writeFile(join(outputDir, "evaluation-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  printJson(manifest);
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(2);
  });
}
