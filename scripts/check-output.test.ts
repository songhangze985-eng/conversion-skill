import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  analyzeMarkdown,
  evaluateChunksIndependently,
  normalizeOutputMarkdown,
  projectAnnotatedPresentation,
  projectBeginnerCard,
  projectConciseGist,
  projectFoldedPresentation,
  readMarkdown,
  renderDeterministic,
  scanDirectoryTextJudgment,
  validateMermaidBlocks,
} from "./check-output";
import {
  evaluateAnalogyAuthenticity,
  evaluateBeginnerFriendliness,
  evaluateClaimFidelity,
  evaluateGrammarInspection,
  evaluateLaypersonRetelling,
  evaluateMicroSentenceCracker,
  evaluateNarrativeBoundary,
  evaluateReadmeExpression,
  evaluateTextRecognitionJudgment,
} from "./hanlp-helper";
import { stableJson } from "./shared";

const fixtures = resolve(import.meta.dir, "../evals/fixtures");

describe("check-output mechanical gates", () => {
  test("legacy three-column mapping still passes the mechanical verdict", () => {
    const result = analyzeMarkdown(readMarkdown(resolve(fixtures, "ok-three-col.md")), {
      level: "default",
      expectedStyle: "anime",
    });
    expect(result.has_mapping_table).toBe(true);
    expect(result.structure_verdict).toBe("PASS");
    expect(result.term_id_coverage_verdict).toBe("PASS");
    expect(result.verdict).toBe("PASS");
    expect(result.semantic_quality_verdict).toBe("NEEDS_REVIEW");
    expect(result.comprehension_verdict).toBe("NOT_REQUESTED");
    expect(result.verdict_scope).toBe("mechanical_only");
    expect(result.has_mapping_bounds).toBe(false);
  });

  test("four-column mapping and comprehension heading do not claim semantic or understanding success", () => {
    const result = analyzeMarkdown(readMarkdown(resolve(fixtures, "ok-four-col.md")), {
      level: "default",
      expectedStyle: "detective",
    });
    expect(result.verdict).toBe("PASS");
    expect(result.has_mapping_bounds).toBe(true);
    expect(result.has_comprehension_section).toBe(true);
    expect(result.semantic_quality_verdict).toBe("NEEDS_REVIEW");
    expect(result.comprehension_verdict).toBe("STRUCTURE_PRESENT_NEEDS_REVIEW");
  });

  test("missing mapping table fails structure without inventing a quality pass", () => {
    const result = analyzeMarkdown(readMarkdown(resolve(fixtures, "fail-no-mapping.md")), {
      level: "default",
      expectedStyle: "neutral",
    });
    expect(result.has_mapping_table).toBe(false);
    expect(result.structure_verdict).toBe("FAIL");
    expect(result.verdict).toBe("FAIL");
    expect(result.semantic_quality_verdict).toBe("NEEDS_REVIEW");
  });

  test("a 600-800 character chunk passes the independent gate", () => {
    const sentences = [
      "家里做饭最怕盐一次倒太多。",
      "先把火关小，再尝一口汤。",
      "但是锅边已经糊了一圈，因此不能继续大火。",
      "遇到这个麻烦，就把菜铲到旁边。",
      "接着加热水，把糊味冲淡。",
      "结果这道菜还能吃，只是少了些鲜味。",
      "封面贴在冰箱上，每次打开都看得见。",
      "只有认定今晚做这道菜，才翻开步骤。",
      "火候表留在抽屉里，做到那一步才抽。",
      "闲聊和无关问题，不该把这本书翻开。",
      "写步骤之前，先定今晚真正要做的两道菜。",
      "每道菜写清开口会说的那句话。",
      "做完以后该看到什么，也要先说清楚。",
      "问天气不该把菜谱翻出来。",
      "换一种说法点同一道菜，仍然该做。",
      "失败时先看火是不是灭了，再核对盐。",
      "这些规矩写进菜谱，是因为不能每次口头重讲。",
      "下次只改卡住的那一步，不要把整本重新摊开。",
      "台面空出来，眼睛才看得见下一步。",
      "盐罐放回去，手就不用再找。",
    ];
    const repeated = [...sentences, ...sentences, ...sentences.slice(0, 6)];
    const third = Math.ceil(repeated.length / 3);
    const paragraphs = [0, 1, 2].map((part) => repeated.slice(part * third, (part + 1) * third).join(""));
    const body = `## 第 1 节：做菜\n\n${paragraphs.join("\n\n")}`;
    const [report] = evaluateChunksIndependently(body, "anime", { enabled: true, mode: "local-fallback" }, "all");
    expect(report?.verdict).toBe("PASS");
    expect(report?.word_count).toBeGreaterThanOrEqual(600);
    expect(report?.word_count).toBeLessThanOrEqual(800);
  });

  test("a short chunk fails on its own and flips the mechanical verdict", () => {
    const markdown = `# 盐

> 表达风格：\`anime\`
> 篇幅：\`long\`

| 知识概念 | 类比元素 | 对应机制 | 适用边界 |
|---|---|---|---|
| 盐 | 一把盐 | 一次倒太多就咸 | 不能说明火候 |

## 正文

## 第 1 节：太短

盐放多了。先关火。

## 知识点校验

盐一次倒太多会咸，先关火再补救。这只是在说明短稿过不了分块字数。
`;
    const plain = analyzeMarkdown(markdown, { level: "long", expectedStyle: "anime" });
    expect(plain.chunk_reports).toBeUndefined();
    expect(plain.verdict).toBe("PASS");
    const checked = analyzeMarkdown(markdown, { level: "long", expectedStyle: "anime", chunk: "all" });
    expect(checked.chunk_verdict).toBe("FAIL");
    expect(checked.verdict).toBe("FAIL");
    expect(checked.chunk_reports?.[0]?.violations.join(" ")).toContain("600-800");
    const line = renderDeterministic(checked);
    expect(line).toContain("verdict=FAIL");
    expect(line).toContain("first_fail=1");
    expect(line.split("\n")).toHaveLength(1);
    const encoded = stableJson({ b: 1, a: { d: 2, c: 3 } });
    expect(encoded.indexOf("\"a\"")).toBeLessThan(encoded.indexOf("\"b\""));
    expect(encoded.indexOf("\"c\"")).toBeLessThan(encoded.indexOf("\"d\""));
  });

  test("folded and annotated projections strip internal scaffolding and format inline concept notes", () => {
    const raw = readMarkdown(resolve(fixtures, "ok-four-col.md"));
    const folded = projectFoldedPresentation(raw);
    expect(folded).toStartWith("# ");
    expect(folded).not.toContain("<details>");
    expect(folded).not.toContain("## 知识点校验");
    expect(folded).not.toContain("> 表达风格：");

    const annotated = projectAnnotatedPresentation(raw);
    expect(annotated).toContain("〔");
    expect(annotated).toContain("〕");
    expect(annotated).not.toContain("<details>");
  });

  test("claim fidelity catches polarity and directional inversions that share keywords", () => {
    const polarity = evaluateClaimFidelity(
      "议长不需要多数派确认就能直接提交，而且已提交的记录可以涂改。",
      "多数派确认后才提交，已提交的记录不可涂改",
    );
    expect(polarity.polarityConflict).toBe(true);
    expect(polarity.effectiveSimilarity).toBeLessThan(0.3);

    const direction = evaluateClaimFidelity(
      "每次迭代都沿梯度相同方向更新参数。",
      "沿梯度相反方向更新参数",
    );
    expect(direction.directionConflict).toBe(true);
    expect(direction.effectiveSimilarity).toBeLessThan(0.3);
  });

  test("mermaid validation accepts isomorphic flowcharts and rejects HTML tags or unsupported types", () => {
    const ok = validateMermaidBlocks("```mermaid\nflowchart TD\n  A[\"输入\"] --> B[\"输出\"]\n```");
    expect(ok.valid).toBe(true);
    expect(ok.block_count).toBe(1);

    const bad = validateMermaidBlocks("```mermaid\npie\n  \"A<br>B\": 40\n```");
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("text recognition judgment: readme表达审查 tags emoji-heavy or fragmented+standardized docs as ai生产", () => {
    const emojiReadme = "# 🚀 极速引擎 ✨\n\n## 💡 核心特性\n- **开箱即用**：一键启动。\n";
    const r1 = evaluateReadmeExpression(emojiReadme);
    expect(r1.is_ai_produced).toBe(true);
    expect(r1.label).toBe("ai生产");
    expect(r1.emoji_overuse).toBe(true);

    const fragStdReadme = [
      "# 极速引擎",
      "",
      "本项目旨在提供一套开箱即用的解决方案。",
      "",
      "它能够赋能开发者构建全方位覆盖的应用。",
      "",
      "系统具有极高的扩展性。",
      "",
      "- **核心特性**：支持多端同步。",
      "- **快速开始**：一键启动服务。",
      "- **无缝集成**：兼容主流框架。",
    ].join("\n");
    const r2 = evaluateReadmeExpression(fragStdReadme);
    expect(r2.is_ai_produced).toBe(true);
    expect(r2.label).toBe("ai生产");
    expect(r2.severe_fragmentation).toBe(true);
    expect(r2.over_standardized).toBe(true);

    const repoReadme = readMarkdown(resolve(import.meta.dir, "../README.md"));
    const repoCheck = analyzeMarkdown(repoReadme, { level: "default", readmeReview: true });
    expect(repoCheck.verdict).toBe("PASS");
    expect(repoCheck.text_recognition_judgment?.readme_expression_review.label).toBe("正常");
  });

  test("text recognition judgment: 词句关键破解 globally catches 2-3 char standalone sentences and 先xx/别x patterns as ai生产", () => {
    const sample = "遇到并发冲突时怎么办？先别急。我们先看日志，别慌，把锁顺序理清楚。真香！";
    const cracker = evaluateMicroSentenceCracker(sample);
    expect(cracker.is_ai_produced).toBe(true);
    expect(cracker.label).toBe("ai生产");
    const texts = cracker.matched_sentences.map((m) => m.text);
    expect(texts).toContain("先别急");
    expect(texts).toContain("别慌");
    expect(texts).toContain("真香");
  });

  test("text recognition judgment: 语法识别 extracts SVO order errors and Anglicized inversions with Markdown **emphasis**", () => {
    const sample = "系统会立刻拒绝该请求，当并发连接数超过上限的时候。调音师把输入矩阵通过正交变换拆分，并对异常梯度进行了快速的裁剪。";
    const grammar = evaluateGrammarInspection(sample);
    expect(grammar.has_issues).toBe(true);
    expect(grammar.issue_count).toBe(2);
    expect(grammar.issues[0]?.kind).toBe("anglicized_inversion");
    expect(grammar.issues[0]?.markdown_emphasized).toBe("**系统会立刻拒绝该请求，当并发连接数超过上限的时候。**");
    expect(grammar.issues[1]?.kind).toBe("svo_order_error");
    expect(grammar.issues[1]?.markdown_emphasized).toBe("**调音师把输入矩阵通过正交变换拆分，并对异常梯度进行了快速的裁剪。**");
    expect(grammar.annotated_markdown).toContain("**系统会立刻拒绝该请求，当并发连接数超过上限的时候。**");

    const fixed = normalizeOutputMarkdown(sample);
    expect(fixed).toContain("当并发连接数超过上限的时候，系统会立刻拒绝该请求。");
    expect(fixed).toContain("调音师通过正交变换把输入矩阵拆分");

    const full = evaluateTextRecognitionJudgment(sample);
    expect(full.labels).toContain("语法待修正");
  });

  test("text recognition judgment extensions: rhetorical shells, negative parallelism, sticker analogies, Europeanized syntax, retelling anchor, and directory scan", () => {
    const rhetSample = "你可能会问：为什么要分区？这不是一次折中，而是一场蜕变；它的关键不在于硬件，而在于协议。这就是共识算法的魅力所在！";
    const m = evaluateMicroSentenceCracker(rhetSample);
    expect(m.is_ai_produced).toBe(true);
    expect(m.rhetorical_qna_shells.length).toBeGreaterThanOrEqual(1);
    expect(m.negative_parallelism_matches.length).toBeGreaterThanOrEqual(2);
    expect(m.hollow_epigrams.length).toBeGreaterThanOrEqual(1);

    const claudeStyleSample = "装一只鱼确实就四步。难的是评论区那句「模板一夜能长出八百条一样的鱼」——壳能装，语气装不了。我的口音是这十来天一条条评论里磨出来的，不是点开关点出来的。";
    const mClaude = evaluateMicroSentenceCracker(claudeStyleSample);
    expect(mClaude.is_ai_produced).toBe(true);
    expect(mClaude.label).toBe("ai生产");
    expect(mClaude.negative_parallelism_matches).toContain("是这十来天一条条评论里磨出来的，不是点开关点出来的");
    expect(mClaude.hollow_epigrams).toContain("——壳能装，语气装不了");

    const euGrammar = "集群里的节点们可以被用来进行状态同步。系统读取着在每次迭代的反向传播的过程中被优化器更新的权重参数。";
    const g = evaluateGrammarInspection(euGrammar);
    expect(g.has_issues).toBe(true);
    expect(g.issues.some((i) => i.kind === "anglicized_passive" || i.kind === "inanimate_plural_men")).toBe(true);
    expect(g.issues.some((i) => i.kind === "anglicized_de_stacking")).toBe(true);

    const sticker = evaluateAnalogyAuthenticity("哈希先生把信件交给递归老师，皮沃特队长负责吹哨。");
    expect(sticker.is_ai_produced).toBe(true);
    expect(sticker.label).toBe("ai生产");
    expect(sticker.sticker_label_terms).toEqual(["哈希先生", "递归老师", "皮沃特队长"]);

    const retell = evaluateLaypersonRetelling(readMarkdown(resolve(import.meta.dir, "../references/domain-examples.md")));
    expect(retell.has_clear_anchor).toBe(true);
    expect(retell.retellability_score).toBeGreaterThanOrEqual(85);

    const dirReport = scanDirectoryTextJudgment(resolve(import.meta.dir, "../references"));
    expect(dirReport.verdict).toBe("PASS");
    expect(dirReport.flagged_files).toBe(0);

    const condescendingDoc = "正交矩阵的特征值分解其实很简单，显而易见，不难发现它的逆矩阵就是转置。";
    const bfBad = evaluateBeginnerFriendliness(condescendingDoc);
    expect(bfBad.is_beginner_friendly).toBe(false);
    expect(bfBad.condescending_phrases).toEqual(["其实很简单", "显而易见", "不难发现"]);
    expect(bfBad.opening_jargon_free).toBe(false);

    const okFourCol = readMarkdown(resolve(fixtures, "ok-four-col.md"));
    const bfGood = evaluateBeginnerFriendliness(okFourCol);
    expect(bfGood.is_beginner_friendly).toBe(true);
    expect(bfGood.beginner_score).toBeGreaterThanOrEqual(85);

    const card = projectBeginnerCard(okFourCol);
    expect(card).toContain("（小白一秒读懂卡）");
    expect(card).toContain("一句话大白话（直接拿去跟朋友说）");
    expect(card).toContain("核心动作对照");
    expect(card).toContain("防坑提醒");

    const bloatedStory = "在很久很久以前，遥远的魔法王国里，阳光透过窗户洒在桌面上，他端起一杯冒着热气的咖啡。";
    const nbBad = evaluateNarrativeBoundary(bloatedStory);
    expect(nbBad.within_boundary).toBe(false);
    expect(nbBad.story_bloat_detected).toBe(true);
    expect(nbBad.story_bloat_matches.length).toBeGreaterThanOrEqual(3);

    const gamingAnalogy = "令牌桶限流就像游戏技能充能层数和冷却CD，攒满3层能瞬间爆发，用光只能按秒恢复蓝条。";
    const nbGaming = evaluateNarrativeBoundary(gamingAnalogy);
    expect(nbGaming.within_boundary).toBe(true);
    expect(nbGaming.habit_lingo_domains).toContain("gaming");

    const gist = projectConciseGist("六国破灭，非兵不利，战不善，弊在赂秦。赂秦而力亏，破灭之道也。以地事秦，犹抱薪救火，薪不尽，火不灭。", "gaming");
    expect(gist).toContain("切中观点·极简白话与话术映射报告");
    expect(gist).toContain("弊在赂秦");
    expect(gist).toContain("游戏玩家常用话术");
  });
});
