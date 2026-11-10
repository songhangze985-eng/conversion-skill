import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeMarkdown } from "./check-output";
import { buildNavigation, normalizePdfAcademicText, sortPdfTextItemsTwoColumn } from "./evaluate-pdf";
import { evaluateAnalogyAuthenticity, evaluateTextRecognitionJudgment, resolveAuthorGateProfile } from "./hanlp-helper";
import { bundleStandaloneWebSkill, runUnifiedPipeline } from "./pipeline";
import { runOfflineBenchmarkSuite } from "./run-evals";
import {
  buildContextAwareFollowupPrompt,
  loadGamingKnowledgeBase,
  loadStoryAuthorsKnowledgeBase,
  queryAuthorStyleByName,
  queryGameTermsByTitle,
  queryLifeMemeByTerm,
  translateClassicalChinese,
} from "./screen-keywords";

const ROOT_DIR = resolve(import.meta.dir, "..");

describe("v3.0 Eight-Point Third-Party Critique Remediations", () => {
  test("R1 (Context Diet & Progressive Disclosure): SKILL.md is <= 180 lines and < 18 KB while interactive examples live in references/", () => {
    const skillRaw = readFileSync(resolve(ROOT_DIR, "SKILL.md"), "utf8");
    const lineCount = skillRaw.split(/\r?\n/u).length;
    const byteSize = Buffer.byteLength(skillRaw, "utf8");
    expect(lineCount).toBeLessThanOrEqual(180);
    expect(byteSize).toBeLessThan(18000);
    expect(skillRaw).toContain("version: \"3.0.0\"");
    expect(skillRaw).toContain("references/interactive-pipeline-examples.md");

    const examplesRaw = readFileSync(resolve(ROOT_DIR, "references/interactive-pipeline-examples.md"), "utf8");
    expect(examplesRaw.length).toBeGreaterThan(800);
  });

  test("R2 (Zero-Friction First Value & Context-Aware Follow-ups): Classical Chinese & academic papers get domain-aware Stage 3 hooks instead of hardcoding Honor of Kings", () => {
    const classicalHook = buildContextAwareFollowupPrompt("君子曰：学不可以已。青，取之于蓝，而青于蓝。");
    expect(classicalHook).toContain("古今异义");
    expect(classicalHook).not.toBe("你可以试试说：用【王者荣耀】的理解方式打开");

    const paperHook = buildContextAwareFollowupPrompt(
      "Abstract: We propose FlashAttention, an IO-aware exact attention algorithm. Introduction ... Methodology ... $$\\text{Attention}(Q,K,V)$$",
    );
    expect(paperHook).toContain("理查德·费曼");
    expect(paperHook).not.toBe("你可以试试说：用【王者荣耀】的理解方式打开");

    const techHook = buildContextAwareFollowupPrompt("死锁与互斥循环等待");
    expect(techHook).toBe("你可以试试说：用【王者荣耀】的理解方式打开");
  });

  test("R3 (Rule Consistency & Expanded KBs): Explicit default routing hierarchy + 12 popular games + 19 world-renowned authors", () => {
    const gamingKb = loadGamingKnowledgeBase();
    const authorsKb = loadStoryAuthorsKnowledgeBase();
    expect((gamingKb.popular_games ?? []).length).toBeGreaterThanOrEqual(12);
    expect(authorsKb.authors.length).toBeGreaterThanOrEqual(19);
    expect(authorsKb.authors.map((a) => a.author_name_zh)).toEqual(
      expect.arrayContaining(["金庸", "张爱玲", "刘震云", "古龙", "鲁迅", "王小波"]),
    );

    const classicalRoute = runUnifiedPipeline({ inputText: "臣本布衣，躬耕于南阳，苟全性命于乱世。" });
    expect(classicalRoute.default_routing.mode).toBe("neutral_direct_gist");
    expect(classicalRoute.default_routing.recommended_style).toBe("neutral");

    const shortConceptRoute = runUnifiedPipeline({ inputText: "什么是操作系统的死锁？" });
    expect(shortConceptRoute.default_routing.mode).toBe("habit_fast_value");

    const authorRoute = runUnifiedPipeline({ inputText: "什么是操作系统的死锁？", authorName: "古龙" });
    expect(authorRoute.default_routing.mode).toBe("author_or_story_narrative");
  });

  test("R4a (Eliminate Silent Fallback Spoofing & Static Specimen Trap): Unmatched author/game/meme returns matched=false, preserves user entity, and emits target_concept_slots", () => {
    const murakami = queryAuthorStyleByName("村上春树", "CAP定理中的一致性与可用性权衡");
    expect(murakami.matched).toBe(false);
    expect(murakami.author_name_zh).toBe("村上春树");
    expect(murakami.unmatched_guidance).toContain("村上春树");
    expect(murakami.style_spec_card?.matched_in_kb).toBe(false);
    expect(murakami.style_spec_card?.target_concept_slots.length).toBeGreaterThan(0);

    const tetris = queryGameTermsByTitle("俄罗斯方块", "JVM 垃圾回收与内存碎片整理");
    expect(tetris.matched).toBe(false);
    expect(tetris.game_name).toBe("俄罗斯方块");
    expect(tetris.unmatched_guidance).toContain("俄罗斯方块");
    expect(tetris.style_spec_card?.target_concept_slots.length).toBeGreaterThan(0);

    const customMeme = queryLifeMemeByTerm("班味太重", "线程池长期满载耗尽连接");
    expect(customMeme.matched).toBe(false);
    expect(customMeme.meme_term).toBe("班味太重");
    expect(customMeme.style_spec_card?.matched_in_kb).toBe(false);
  });

  test("R4b (Classical Chinese Context-Sensitive Polysemy Disambiguation): Distinguishes 假寐/借书/善假于物, 绝江河/绝境/群响毕绝, 委而去之/相去甚远", () => {
    const wolf = translateClassicalChinese("乃悟前狼假寐，盖以诱敌。");
    expect(wolf.pithy_vernacular).toContain("闭眼装睡");
    expect(wolf.pithy_vernacular).not.toContain("借用");
    expect((wolf.polysemy_disambiguations ?? []).some((r) => r.char === "假")).toBe(true);

    const borrowBook = translateClassicalChinese("以是人多以书假余。");
    expect(borrowBook.pithy_vernacular).toContain("把书借给我");

    const quanxue = translateClassicalChinese("假舟楫者，非能水也，而绝江河。");
    expect(quanxue.pithy_vernacular).toContain("横渡长江黄河");

    const taohua = translateClassicalChinese("率妻子邑人来此绝境，不复出焉。");
    expect(taohua.pithy_vernacular).toContain("与世隔绝");

    const kouji = translateClassicalChinese("忽然抚尺一下，群响毕绝。");
    expect(kouji.pithy_vernacular).toContain("停止消失");

    const leaveCity = translateClassicalChinese("城非不高也，池非不深也，委而去之。");
    expect(leaveCity.pithy_vernacular).toContain("弃城逃离");

    const distanceFar = translateClassicalChinese("今夫天斯昭昭之多，及其无穷也，日月星辰系焉，此二者相去甚远。");
    expect(distanceFar.pithy_vernacular).toContain("距离相差很远");
  });

  test("R5 (Single-Shot Pipeline & Zero-Dead-Link Standalone Web Skill): pipeline runs in single call and --bundle-web strips dead local links/CLI commands", () => {
    const res = runUnifiedPipeline({
      inputText: "两阶段提交协议中协调者宕机导致参与者阻塞",
      gameTitle: "无畏契约",
      withScaffold: true,
    });
    expect(res.game_lookup?.matched).toBe(true);
    expect(res.game_lookup?.game_name).toContain("无畏契约");
    expect(res.template_scaffold).toContain("# 核心机制通俗转译");

    const bundled = bundleStandaloneWebSkill(ROOT_DIR);
    expect(bundled).toContain("内置离线速查卡片");
    expect(bundled).toContain("金庸");
    expect(bundled).toContain("无畏契约");
    expect(bundled).not.toMatch(/\]\((?:references|scripts|assets)\//u);
    expect(bundled).not.toMatch(/bun\s+run\s+/u);
  });

  test("R6 (Author-Aware Gate Profiles & Dynamic Mechanism Isomorphism): Gu Long/Hemingway staccato prose and Lu Xun dialectic prose pass their profiles while static noun-sticker tables fail", () => {
    expect(resolveAuthorGateProfile("古龙")).toBe("staccato_literary");
    expect(resolveAuthorGateProfile("海明威")).toBe("staccato_literary");
    expect(resolveAuthorGateProfile("鲁迅")).toBe("dialectic_satire");

    const staticTableMd = `| 知识概念 | 类比元素 | 对应机制 | 适用边界 |\n|---|---|---|---|\n| 节点 | 宾客 | 节点就是宾客 | 真实网络节点还会宕机重连 |\n| 令牌 | 餐券 | 令牌相当于餐券 | 令牌还携带过期时间戳信息 |\n\n宾客拿着餐券走进大厅坐下。`;
    const authReview = evaluateAnalogyAuthenticity(staticTableMd);
    expect(authReview.non_isomorphic_rows.length).toBe(2);
    expect(authReview.is_ai_produced).toBe(true);

    const luxunSatire = `铁屋子里的两个线程各自攥着半把钥匙，这不是什么高深的玄学，而是互不相让的死结；它们的困局不在于算力太慢，而在于谁也不肯先松手。`;
    const stdLuxun = evaluateTextRecognitionJudgment(luxunSatire);
    const profileLuxun = evaluateTextRecognitionJudgment(luxunSatire, "鲁迅");
    expect(stdLuxun.micro_sentence_cracker.is_ai_produced).toBe(true);
    expect(profileLuxun.micro_sentence_cracker.is_ai_produced).toBe(false);

    const gulongFullMd = `# 窄巷死锁\n\n> 表达风格：\`narrative\`\n> 篇幅：\`default\`\n\n<details>\n<summary>幕后分析</summary>\n\n| 知识概念 | 类比元素 | 对应机制 | 适用边界 |\n|---|---|---|---|\n| 互斥条件 | 独扇窄铁门 | 同一时刻只容一人握住门闩通过，另一人必须在外等候 | 铁门是物理空间排他，软件锁还涉及内核态上下文切换开销 |\n| 持有并等待 | 攥紧门闩索要钥匙 | 手里死死扣住门闩不放，同时伸手向对方讨要开锁铜钥 | 现实中人会体力不支松手，线程无超时机制会永久挂起阻塞 |\n| 循环等待 | 窄巷两人对峙成环 | 甲等乙交出铜钥、乙等甲让出门闩，形成首尾咬死的等待闭环 | 真实死锁环可能跨越数十个微服务节点而非仅有两个参与者 |\n\n</details>\n\n## 正文\n\n风很冷，窄巷里只有一扇生锈的铁门。\n\n张聋子右手死死扣住门闩，眼睛却盯着李瞎子腰间的铜钥匙。\n\n李瞎子按住铜钥匙不肯松手，除非张聋子先把门闩让开半寸。\n\n谁也不肯退后一步，谁也没本事硬撬开对方的手指，结果两个人就像两颗咬死的齿轮卡在巷口直到天明。\n\n## 知识点校验\n\n死锁在互斥条件、持有并等待、不可抢占与循环等待四个条件同时成立时触发；只要破坏其中任意一环（如统一加锁顺序或设置超时释放），阻塞闭环最终即告解除。\n`;
    const passGulong = analyzeMarkdown(gulongFullMd, {
      level: "default",
      authorProfile: "古龙",
      strictHumanVoice: true,
      enforceBaselineFloor: true,
      textJudgment: true,
      hanlpOptions: { enabled: true, mode: "local-fallback" },
    });
    expect(passGulong.verdict).toBe("PASS");
  });

  test("R7 (Academic PDF Two-Column Coordinate Sorting, Ligature/Math Repair & Custom Method Section Fallback)", () => {
    const interleavedStream = [
      { str: "Attention Is All You Need", x: 140, y: 745, width: 330 },
      { str: "1 Introduction", x: 72, y: 680, width: 110 },
      { str: "3 Model Architecture", x: 320, y: 680, width: 150 },
      { str: "Recurrent models factor computation sequentially.", x: 72, y: 662, width: 210 },
      { str: "The Transformer uses stacked self-attention layers.", x: 320, y: 662, width: 215 },
      { str: "This sequential nature precludes parallelization.", x: 72, y: 644, width: 210 },
      { str: "Each encoder layer has two sub-layers.", x: 320, y: 644, width: 205 },
    ];
    const sorted = sortPdfTextItemsTwoColumn(interleavedStream, 612);
    expect(sorted.layoutMode).toBe("two-column");
    expect(sorted.lines[0]).toBe("Attention Is All You Need");
    // Left column must finish completely before right column starts
    const lastLeftIdx = sorted.lines.indexOf("This sequential nature precludes parallelization.");
    const firstRightIdx = sorted.lines.indexOf("3 Model Architecture");
    expect(lastLeftIdx).toBeGreaterThan(0);
    expect(firstRightIdx).toBeGreaterThan(lastLeftIdx);

    const cleaned = normalizePdfAcademicText("efﬁcient ﬂash atten-\ntion with \uE012 glyph");
    expect(cleaned.text).toBe("efficient flash attention with glyph");
    expect(cleaned.mathWarnings.length).toBeGreaterThanOrEqual(1);

    const nav = buildNavigation([
      {
        page: 2,
        characters: 300,
        text: [
          "1. Introduction",
          "Long sequences incur quadratic complexity.",
          "2. IO-Aware Tiling Formulation",
          "Our algorithm tiles Q, K, V blocks into fast SRAM to compute exact softmax attention without HBM round-trips, where complexity = O(N^2 / M).",
        ].join("\n"),
      },
    ]);
    expect(nav.some((n) => n.kind === "method" && n.evidence.includes("IO-Aware Tiling Formulation"))).toBe(true);
  });

  test("R8 (Full Offline Benchmark Lift & Stress Suite Passes 100%)", () => {
    const suite = runOfflineBenchmarkSuite();
    expect(suite.failed).toBe(0);
    expect(suite.verdict).toBe("PASS");
    expect(suite.checks.some((c) => c.id === "v3-lift:naive-eli5-vs-skill-delta" && c.passed)).toBe(true);
  });
});
