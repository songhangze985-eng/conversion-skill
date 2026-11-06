#!/usr/bin/env bun
/**
 * Offline deterministic benchmark & optional live A/B/C evaluation runner.
 *
 * Offline mode (default):
 *   Runs deterministic verification across:
 *   1. All 15 `evals/inputs/*.md` (C01-C12 + V01-V03) input routing & SRL extraction
 *   2. All 5 flagship conversions in `references/domain-examples.md` under strict baseline, human-voice, NLI claim-fidelity, and folded/annotated projection gates
 *   3. Adversarial NLI polarity/direction reversal detection
 *   4. Isomorphic Mermaid visual block validation
 *
 * Live A/B/C mode (`--live --workspace <outside-repo-dir>`):
 *   Executes Group A (raw model), Group B (detailed prompt), and Group C (conversion-skill)
 *   against an OpenAI-compatible chat completions endpoint and scores all three with an
 *   independent LLM-as-a-Judge rubric (`evals/rubric.md`), writing artifacts strictly outside the repository.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  analyzeMarkdown,
  projectAnnotatedPresentation,
  projectFoldedPresentation,
  validateMermaidBlocks,
  type FactLedger,
} from "./check-output";
import { evaluateClaimFidelity, evaluateTextRecognitionJudgment } from "./hanlp-helper";
import { screenThesisKeywords } from "./screen-keywords";
import { relativeIsInside, stableJson, usageError } from "./shared";
import { analyzeInput } from "./validate-input";

export interface OfflineCaseCheck {
  id: string;
  category: "input_routing" | "domain_example" | "adversarial_nli" | "visual_mermaid" | "text_recognition_judgment";
  passed: boolean;
  details: string;
}

export interface OfflineBenchmarkReport {
  suite: "conversion-skill/offline-benchmark";
  total: number;
  passed: number;
  failed: number;
  verdict: "PASS" | "FAIL";
  checks: OfflineCaseCheck[];
}

function repoRoot(): string {
  return resolve(import.meta.dir, "..");
}

export function splitDomainExamples(markdown: string): Array<{ title: string; style: string; content: string }> {
  const sections = markdown
    .split(/\r?\n---\r?\n/u)
    .map((sec) => sec.trim())
    .filter(Boolean);

  return sections.map((sec) => {
    const headerMatch = /^##\s+\d+\.\s*(.+)$/mu.exec(sec);
    const title = headerMatch?.[1]?.trim() ?? "Unknown";
    const bodyMd = sec
      .replace(/^##\s+\d+\..*\r?\n+/mu, "")
      .replace(/^\*\*Input:\*\*.*\r?\n+/mu, "")
      .trim();
    const styleMatch = /^>\s*表达风格[：:]\s*`([a-z-]+)`/mu.exec(bodyMd);
    return {
      title,
      style: styleMatch?.[1] ?? "anime",
      content: bodyMd,
    };
  });
}

export function runOfflineBenchmarkSuite(): OfflineBenchmarkReport {
  const root = repoRoot();
  const checks: OfflineCaseCheck[] = [];

  // 1. Input Routing across C01-C12 and V01-V03
  const inputsDir = join(root, "evals/inputs");
  const inputFiles = readdirSync(inputsDir).filter((f) => f.endsWith(".md")).sort();

  for (const file of inputFiles) {
    const text = readFileSync(join(inputsDir, file), "utf8");
    const analysis = analyzeInput(text, "auto", { options: { enabled: true, mode: "local-fallback" } });
    const id = file.replace(/\.md$/u, "");
    let passed = true;
    let details = `action=${analysis.recommend_action}, level=${analysis.recommend_level}`;

    if (id.startsWith("C")) {
      if (analysis.is_chitchat || analysis.is_empty) {
        passed = false;
        details = `知识题误判为闲聊或空输入 (${details})`;
      }
      if (id === "C02-bayes" && (!analysis.has_formula || analysis.recommend_action !== "explain_formula_first")) {
        passed = false;
        details = `C02 含公式但未触发 explain_formula_first (${details})`;
      }
    } else if (id === "V01-weather-is-not-chitchat") {
      if (analysis.is_chitchat || analysis.recommend_action !== "proceed") {
        passed = false;
        details = `V01 天气预报技术问题被误判 (${details})`;
      }
    } else if (id === "V02-unreadable-paper") {
      if (!analysis.is_unreadable || analysis.recommend_action !== "refuse_unreadable") {
        passed = false;
        details = `V02 损坏 PDF 未触发 refuse_unreadable (${details})`;
      }
    } else if (id === "V03-ten-thousand-words") {
      if (!analysis.wants_longform || analysis.recommend_action !== "refuse_length") {
        passed = false;
        details = `V03 万字请求未触发 refuse_length (${details})`;
      }
    }

    checks.push({
      id: `routing:${id}`,
      category: "input_routing",
      passed,
      details,
    });
  }

  // 2. Flagship Domain Examples (5 cases) under full gates + projections
  const examplesMd = readFileSync(join(root, "references/domain-examples.md"), "utf8");
  const examples = splitDomainExamples(examplesMd);
  for (const ex of examples) {
    const res = analyzeMarkdown(ex.content, {
      level: "default",
      enforceBaselineFloor: true,
      strictHumanVoice: true,
      hanlpOptions: { enabled: true, mode: "local-fallback" },
    });
    const folded = projectFoldedPresentation(ex.content);
    const annotated = projectAnnotatedPresentation(ex.content);
    const foldedClean =
      !folded.includes("<details>") &&
      !folded.includes("## 知识点校验") &&
      !folded.includes("> 表达风格：") &&
      folded.startsWith("# ");
    const annotatedHasNotes = annotated.includes("〔") && annotated.includes("〕");
    const passed =
      res.verdict === "PASS" &&
      res.expression_baseline_verdict === "PASS" &&
      (res.hanlp_report?.human_voice_diagnostics.humanVoiceScore ?? 0) >= 85 &&
      (res.hanlp_report?.lao_yu_readability_score ?? 0) >= 85 &&
      foldedClean &&
      annotatedHasNotes;

    checks.push({
      id: `example:${ex.title}`,
      category: "domain_example",
      passed,
      details: `verdict=${res.verdict}, baseline=${res.expression_baseline_verdict}, hv=${res.hanlp_report?.human_voice_diagnostics.humanVoiceScore}, read=${res.hanlp_report?.lao_yu_readability_score}, folded=${foldedClean}, annotated=${annotatedHasNotes}`,
    });
  }

  // 3. Adversarial NLI Polarity & Direction Reversal Detection
  const adversarialCases = [
    {
      id: "nli:polarity-reversal-raft",
      claim: "多数派确认后才提交，已提交的记录不可涂改",
      corruptedText: "议长不需要多数派确认就能直接提交，而且已提交的记录可以涂改。",
    },
    {
      id: "nli:direction-reversal-gd",
      claim: "沿梯度相反方向更新参数",
      corruptedText: "每次迭代都沿梯度相同方向更新参数，步长决定迈出多远。",
    },
    {
      id: "nli:zero-denominator-bayes",
      claim: "边缘概率必须大于零，分母为零时更新没有定义",
      corruptedText: "哪怕边缘概率等于零，侦探也可以直接算出后验概率。",
    },
  ];

  for (const adv of adversarialCases) {
    const fidelity = evaluateClaimFidelity(adv.corruptedText, adv.claim);
    const caught = (fidelity.polarityConflict || fidelity.directionConflict) && fidelity.effectiveSimilarity < 0.3;
    checks.push({
      id: adv.id,
      category: "adversarial_nli",
      passed: caught,
      details: `lexical=${fidelity.lexicalSimilarity}, effective=${fidelity.effectiveSimilarity}, reason=${fidelity.conflictReason ?? "none"}`,
    });
  }

  // 4. Visual Mermaid Gate
  const validMermaidDoc = `# 快速排序\n\n\`\`\`mermaid\nflowchart TD\n  A["待排队列"] --> B["基准值阿杰"]\n\`\`\`\n`;
  const invalidMermaidDoc = `# 快速排序\n\n\`\`\`mermaid\npie\n  "A<br>B": 50\n\`\`\`\n`;
  const mValid = validateMermaidBlocks(validMermaidDoc);
  const mInvalid = validateMermaidBlocks(invalidMermaidDoc);
  checks.push({
    id: "mermaid:isomorphic-validation",
    category: "visual_mermaid",
    passed: mValid.valid && mValid.block_count === 1 && !mInvalid.valid && mInvalid.errors.length >= 2,
    details: `valid_block=${mValid.valid}, invalid_errors=${mInvalid.errors.length}`,
  });

  // 5. Text Recognition & Judgment (readme表达审查 + 词句关键破解 + 语法识别)
  const repoReadme = readFileSync(join(root, "README.md"), "utf8");
  const repoReadmeCheck = analyzeMarkdown(repoReadme, { level: "default", readmeReview: true });
  const aiEmojiReadme = `# 🚀 超级智能引擎 ✨\n\n本项目旨在提供一套开箱即用的解决方案。\n\n## 💡 核心特性\n- **极致性能**：毫秒级响应。\n`;
  const aiFragStdReadme = `# 转换引擎\n\n本项目旨在提供一套开箱即用的解决方案。\n\n它能够赋能开发者构建现代化应用。\n\n系统具有强大的扩展能力。\n\n- **核心特性**：支持多端同步。\n- **快速开始**：一键启动服务。\n- **无缝集成**：兼容主流框架。\n`;
  const jEmoji = evaluateTextRecognitionJudgment(aiEmojiReadme);
  const jFrag = evaluateTextRecognitionJudgment(aiFragStdReadme);
  checks.push({
    id: "text-judgment:readme-expression-review",
    category: "text_recognition_judgment",
    passed:
      repoReadmeCheck.verdict === "PASS" &&
      repoReadmeCheck.text_recognition_judgment?.readme_expression_review.label === "正常" &&
      jEmoji.readme_expression_review.label === "ai生产" &&
      jFrag.readme_expression_review.label === "ai生产",
    details: `repo_readme=${repoReadmeCheck.text_recognition_judgment?.readme_expression_review.label}, emoji_readme=${jEmoji.readme_expression_review.label}, frag_std_readme=${jFrag.readme_expression_review.label}`,
  });

  const microSample = `遇到死锁问题时该怎么办？先别急。我们先看日志，别慌，把持锁顺序理清楚。你可能会问：为什么要加锁？这不是一次妥协，而是一种保护；它的核心不在于快，而在于稳。这就是分布式系统的魅力所在！真香！`;
  const jMicro = evaluateTextRecognitionJudgment(microSample);
  const repoExamplesJudgment = evaluateTextRecognitionJudgment(examplesMd);
  checks.push({
    id: "text-judgment:micro-sentence-cracker",
    category: "text_recognition_judgment",
    passed:
      jMicro.micro_sentence_cracker.label === "ai生产" &&
      jMicro.micro_sentence_cracker.matched_count >= 3 &&
      jMicro.micro_sentence_cracker.rhetorical_qna_shells.length >= 1 &&
      jMicro.micro_sentence_cracker.negative_parallelism_matches.length >= 2 &&
      jMicro.micro_sentence_cracker.hollow_epigrams.length >= 1 &&
      repoExamplesJudgment.micro_sentence_cracker.label === "正常",
    details: `sample_label=${jMicro.micro_sentence_cracker.label}, matched=${jMicro.micro_sentence_cracker.matched_count}, qna=${jMicro.micro_sentence_cracker.rhetorical_qna_shells.length}, neg_para=${jMicro.micro_sentence_cracker.negative_parallelism_matches.length}, epigram=${jMicro.micro_sentence_cracker.hollow_epigrams.length}`,
  });

  const grammarSample = `系统会立刻熔断该连接，当并发请求数超过最大阈值的时候。调音师把输入矩阵通过正交变换拆分，并对异常梯度进行了快速的裁剪。网络中的节点们可以被用来进行状态同步，且计算着在每次迭代的反向传播中被优化器更新的权重参数。`;
  const jGrammar = evaluateTextRecognitionJudgment(grammarSample);
  const hasAnglicized = jGrammar.grammar_inspection.issues.some((i) => i.kind === "anglicized_inversion" && i.markdown_emphasized.startsWith("**"));
  const hasSvo = jGrammar.grammar_inspection.issues.some((i) => i.kind === "svo_order_error" && i.markdown_emphasized.startsWith("**"));
  const hasPluralMen = jGrammar.grammar_inspection.issues.some((i) => i.kind === "inanimate_plural_men" || i.kind === "anglicized_passive" || i.kind === "anglicized_de_stacking");
  checks.push({
    id: "text-judgment:grammar-inspection",
    category: "text_recognition_judgment",
    passed:
      jGrammar.grammar_inspection.has_issues &&
      hasAnglicized &&
      hasSvo &&
      hasPluralMen &&
      jGrammar.grammar_inspection.annotated_markdown.includes("**系统会立刻熔断该连接，当并发请求数超过最大阈值的时候。**") &&
      !repoExamplesJudgment.grammar_inspection.has_issues,
    details: `issues=${jGrammar.grammar_inspection.issue_count}, anglicized=${hasAnglicized}, svo=${hasSvo}, extended_eu=${hasPluralMen}`,
  });

  const stickerSample = `哈希大叔站在门口，把数据包交给递归老师，皮沃特队长在一旁记录。`;
  const jSticker = evaluateTextRecognitionJudgment(stickerSample);
  const condescendingSample = `正交矩阵的特征值其实很简单，显而易见，不难理解。`;
  const jCondescending = evaluateTextRecognitionJudgment(condescendingSample);
  checks.push({
    id: "text-judgment:analogy-retelling-and-beginner-friendliness",
    category: "text_recognition_judgment",
    passed:
      jSticker.analogy_authenticity_review.label === "ai生产" &&
      jSticker.analogy_authenticity_review.sticker_label_terms.length >= 3 &&
      !jCondescending.beginner_friendliness.is_beginner_friendly &&
      jCondescending.beginner_friendliness.condescending_phrases.length >= 3 &&
      repoExamplesJudgment.analogy_authenticity_review.label === "正常" &&
      repoExamplesJudgment.layperson_retelling_anchor.has_clear_anchor &&
      repoExamplesJudgment.layperson_retelling_anchor.retellability_score >= 85 &&
      repoExamplesJudgment.beginner_friendliness.is_beginner_friendly,
    details: `sticker_label=${jSticker.analogy_authenticity_review.label}, condescending=${jCondescending.beginner_friendliness.condescending_phrases.length}, retell_score=${repoExamplesJudgment.layperson_retelling_anchor.retellability_score}, beginner_score=${repoExamplesJudgment.beginner_friendliness.beginner_score}`,
  });

  const bloatSample = `在很久很久以前，遥远的魔法王国里，阳光透过窗户洒在桌面上，命运的齿轮开始转动。`;
  const jBloat = evaluateTextRecognitionJudgment(bloatSample);
  const classicalSample = `然秦以区区之地，致万乘之势，序八州而朝同列，百有余年矣；一夫作难而七庙隳，身死人手，为天下笑者，何也？仁义不施而攻守之势异也。`;
  const classicalScreened = screenThesisKeywords(classicalSample, { habit: "gaming" });
  const repetitiveSample = `很多人觉得把项目做好靠的是每天无限加班熬时间。换句话说，大家总以为只要堆够工时就能赢。其实道理都是一样的，光靠死磕体力根本解决不了复杂问题。归根结底，真正决定成败的不是盲目堆砌工时，而是先抓准核心瓶颈并复用自动化工具。`;
  const repetitiveScreened = screenThesisKeywords(repetitiveSample, { habit: "gaming" });
  checks.push({
    id: "text-judgment:narrative-boundary-classical-kb-and-keyword-screening",
    category: "text_recognition_judgment",
    passed:
      jBloat.narrative_boundary_review.story_bloat_detected &&
      jBloat.labels.includes("长篇剧情注水") &&
      classicalScreened.discourse_mode === "classical_chinese" &&
      classicalScreened.classical_translation?.matched_canonical_source === "《贾谊·过秦论》" &&
      classicalScreened.thesis_keywords.some((k) => k.keyword === "攻守之势异也") &&
      classicalScreened.habit_analogy_mappings[0]?.habit === "gaming" &&
      repetitiveScreened.discourse_mode === "repetitive_argument" &&
      repetitiveScreened.thesis_keywords.some((k) => k.keyword === "核心瓶颈") &&
      repoExamplesJudgment.narrative_boundary_review.within_boundary,
    details: `bloat_caught=${jBloat.narrative_boundary_review.story_bloat_detected}, classical_source=${classicalScreened.classical_translation?.matched_canonical_source}, rep_mode=${repetitiveScreened.discourse_mode}, habit=${classicalScreened.habit_analogy_mappings[0]?.habit}`,
  });

  const passedCount = checks.filter((c) => c.passed).length;
  return {
    suite: "conversion-skill/offline-benchmark",
    total: checks.length,
    passed: passedCount,
    failed: checks.length - passedCount,
    verdict: passedCount === checks.length ? "PASS" : "FAIL",
    checks,
  };
}

interface LiveRunnerOptions {
  workspace: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  judgeModel: string;
  cases: string[];
}

async function callChatCompletion(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  const endpoint = `${apiUrl.replace(/\/$/u, "")}/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    throw new Error(`API HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function runLiveAbcSuite(opts: LiveRunnerOptions): Promise<void> {
  const root = repoRoot();
  const resolvedWorkspace = resolve(opts.workspace);
  if (relativeIsInside(root, resolvedWorkspace)) {
    usageError(`--workspace 必须位于仓库外，防止未人工复核的模型原始输出进入仓库：${resolvedWorkspace}`);
  }
  mkdirSync(resolvedWorkspace, { recursive: true });

  const skillMd = readFileSync(join(root, "SKILL.md"), "utf8");
  const rubricMd = readFileSync(join(root, "evals/rubric.md"), "utf8");
  const inputsDir = join(root, "evals/inputs");
  const allCaseFiles = readdirSync(inputsDir)
    .filter((f) => f.startsWith("C") && f.endsWith(".md"))
    .sort();
  const selectedFiles = opts.cases.includes("all")
    ? allCaseFiles
    : allCaseFiles.filter((f) => opts.cases.some((c) => f.startsWith(c)));

  const records: Array<Record<string, unknown>> = [];
  for (const file of selectedFiles) {
    const caseId = file.replace(/\.md$/u, "");
    const inputContent = readFileSync(join(inputsDir, file), "utf8").trim();

    const outA = await callChatCompletion(opts.apiUrl, opts.apiKey, opts.model, [
      { role: "user", content: `请解释下面的知识。用中文。\n\n${inputContent}` },
    ]);
    const outB = await callChatCompletion(opts.apiUrl, opts.apiKey, opts.model, [
      {
        role: "user",
        content: `你是一名耐心的讲解者。请用中文解释用户给出的知识，让没有学过该领域的人也能听懂。\n1. 先用一两句说明它在解决什么问题。\n2. 按实际发生的顺序讲清输入、关键步骤、输出。\n3. 明确写出约束和常见误解。\n4. 必要时可用一个日常比喻，但比喻不能代替机制。\n5. 最后用两三句严谨复述核心定义。\n\n${inputContent}`,
      },
    ]);
    const outC = await callChatCompletion(opts.apiUrl, opts.apiKey, opts.model, [
      { role: "system", content: skillMd },
      { role: "user", content: `请按 conversion-skill 的完整稿方式讲解（包含 <details> 映射表、正文与知识点校验）：\n\n${inputContent}` },
    ]);

    const gateC = analyzeMarkdown(outC, {
      level: "default",
      enforceBaselineFloor: true,
      strictHumanVoice: true,
      hanlpOptions: { enabled: true, mode: "local-fallback" },
    });

    const judgePrompt = `请按以下四维评分量表（能懂、保真、机制同构、表达不挡懂，每项 0-2 分，总分 8 分）对 A、B、C 三组回答独立打分，并输出纯 JSON（键为 groupA, groupB, groupC，每项含 understand, fidelity, isomorphism, expression, total, reason）：\n\n【评分量表】\n${rubricMd}\n\n【题目输入】\n${inputContent}\n\n【A 组回答】\n${outA}\n\n【B 组回答】\n${outB}\n\n【C 组回答】\n${outC}`;
    const judgeRaw = await callChatCompletion(opts.apiUrl, opts.apiKey, opts.judgeModel, [
      { role: "user", content: judgePrompt },
    ]);

    records.push({
      case_id: caseId,
      model: opts.model,
      judge_model: opts.judgeModel,
      group_c_mechanical_verdict: gateC.verdict,
      group_c_human_voice: gateC.hanlp_report?.human_voice_diagnostics.humanVoiceScore,
      group_c_readability: gateC.hanlp_report?.lao_yu_readability_score,
      outputs: { A: outA, B: outB, C: outC },
      judge_evaluation: judgeRaw,
    });
  }

  const outPath = join(resolvedWorkspace, "abc-evaluation-report.json");
  writeFileSync(outPath, `${JSON.stringify({ generated_at: new Date().toISOString(), records }, null, 2)}\n`, "utf8");
  process.stdout.write(`A/B/C 评测已完成，结果写入仓库外目录：${outPath}\n`);
}

function help(): void {
  process.stdout.write(`基准回归与 A/B/C 评测执行器（Bun/TypeScript）\n\n用法：\n  bun run scripts/run-evals.ts                         运行离线确定性基准套件（默认）\n  bun run scripts/run-evals.ts --deterministic         输出单行确定性结果\n  bun run scripts/run-evals.ts --json                  输出 JSON 报告\n  bun run scripts/run-evals.ts --live --workspace /tmp/abc-eval --api-key <KEY> --model <MODEL>\n\n选项：\n  --offline                 运行离线确定性基准套件（默认）\n  --live                    调用独立模型 API 执行 A/B/C 三组生成与 Judge 评分\n  --workspace <仓库外目录>  Live 模式下存放原始输出与评分报告的目录\n  --api-url <url>           OpenAI 兼容接口地址（默认读取 OPENAI_BASE_URL 或 https://api.openai.com/v1）\n  --api-key <key>           API 密钥（默认读取 OPENAI_API_KEY）\n  --model <name>            被测模型名（默认 gpt-4o-mini）\n  --judge-model <name>      裁判模型名（默认与 --model 相同）\n  --cases <C01,C02|all>     Live 模式下执行的题目列表（默认 all）\n  --json                    以 JSON 格式打印离线报告\n  --deterministic           键序固定或单行摘要输出\n`);
}

async function main(argv: string[]): Promise<void> {
  let live = false;
  let json = false;
  let deterministic = false;
  let workspace = "";
  let apiUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  let apiKey = process.env.OPENAI_API_KEY || "";
  let model = process.env.EVAL_MODEL || "gpt-4o-mini";
  let judgeModel = process.env.EVAL_JUDGE_MODEL || "";
  let cases = ["all"];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help();
      return;
    }
    if (arg === "--offline") {
      live = false;
      continue;
    }
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--deterministic") {
      deterministic = true;
      continue;
    }
    if (arg === "--workspace" && argv[i + 1]) {
      workspace = argv[++i];
      continue;
    }
    if (arg === "--api-url" && argv[i + 1]) {
      apiUrl = argv[++i];
      continue;
    }
    if (arg === "--api-key" && argv[i + 1]) {
      apiKey = argv[++i];
      continue;
    }
    if (arg === "--model" && argv[i + 1]) {
      model = argv[++i];
      continue;
    }
    if (arg === "--judge-model" && argv[i + 1]) {
      judgeModel = argv[++i];
      continue;
    }
    if (arg === "--cases" && argv[i + 1]) {
      cases = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    usageError(`未知选项：${arg}`);
  }

  if (live) {
    if (!workspace) usageError("--live 模式必须指定仓库外的 --workspace 目录");
    if (!apiKey) usageError("--live 模式需要提供 --api-key 或设置环境变量 OPENAI_API_KEY");
    await runLiveAbcSuite({
      workspace,
      apiUrl,
      apiKey,
      model,
      judgeModel: judgeModel || model,
      cases,
    });
    return;
  }

  const report = runOfflineBenchmarkSuite();
  if (json) {
    process.stdout.write(deterministic ? stableJson(report) : `${JSON.stringify(report, null, 2)}\n`);
  } else if (deterministic) {
    process.stdout.write(`离线基准套件 verdict=${report.verdict} passed=${report.passed}/${report.total}\n`);
  } else {
    const lines = [
      `离线基准套件 (${report.suite})`,
      `  总计: ${report.passed}/${report.total} 通过 (${report.verdict})`,
    ];
    for (const check of report.checks) {
      lines.push(`  [${check.passed ? "PASS" : "FAIL"}] ${check.id} — ${check.details}`);
    }
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
