import { describe, expect, test } from "bun:test";
import {
  computeClassicalDensity,
  detectDiscourseMode,
  detectUserHabit,
  isClassicalChineseText,
  loadClassicalKnowledgeBase,
  renderKeywordScreeningMarkdown,
  screenThesisKeywords,
  translateClassicalChinese,
} from "./screen-keywords";

describe("screen-keywords & classical-chinese-kb", () => {
  test("loads self-built classical Chinese JSON knowledge base with particles, lexical entries, canonical passages, and habit lexicon", () => {
    const kb = loadClassicalKnowledgeBase();
    expect(kb.schema_version).toBe("1.0");
    expect(kb.particles_and_patterns.length).toBeGreaterThanOrEqual(15);
    expect(kb.lexical_entries.length).toBeGreaterThanOrEqual(35);
    expect(kb.canonical_passages.length).toBeGreaterThanOrEqual(12);
    expect(kb.habit_analogy_lexicon.gaming.length).toBeGreaterThanOrEqual(8);
  });

  test("accurately translates classical Chinese passages into pithy vernacular and catches false-friend words", () => {
    const quanxue = "君子曰：学不可以已。青，取之于蓝，而青于蓝；冰，水为之，而寒于水。君子生非异也，善假于物也。";
    expect(isClassicalChineseText(quanxue)).toBe(true);
    expect(computeClassicalDensity(quanxue)).toBeGreaterThanOrEqual(0.5);

    const translation = translateClassicalChinese(quanxue);
    expect(translation.is_classical).toBe(true);
    expect(translation.matched_canonical_source).toBe("《荀子·劝学》");
    expect(translation.core_thesis).toContain("善假于物");
    expect(translation.pithy_vernacular).toContain("借用现成工具");
    expect(translation.matched_lexical_glosses.some((g) => g.word === "善假于物" && g.is_false_friend)).toBe(true);

    const report = screenThesisKeywords(quanxue, { habit: "gaming" });
    expect(report.discourse_mode).toBe("classical_chinese");
    expect(report.narrative_boundary.mode).toBe("direct_pithy_gist");
    expect(report.narrative_boundary.forbid_long_story_worldbuilding).toBe(true);
    expect(report.thesis_keywords.map((k) => k.keyword)).toContain("善假于物");
    expect(report.habit_analogy_mappings[0]?.habit).toBe("gaming");
    expect(report.habit_analogy_mappings[0]?.daily_lingo_mapping).toContain("Boss");
  });

  test("screens thesis-hitting keywords and condenses repetitive opinion articles into one pithy vernacular thesis", () => {
    const repetitiveArticle = [
      "很多人觉得把项目做好靠的是每天无限加班熬时间。",
      "换句话说，大家总以为只要堆够工时就能赢。",
      "其实道理都是一样的，光靠死磕体力根本解决不了复杂问题。",
      "再举个例子，就算全员通宵十天，方向错了也是白搭。",
      "归根结底，真正决定成败的不是盲目堆砌工时，而是先抓准核心瓶颈并复用自动化工具。",
    ].join("");

    const modeInfo = detectDiscourseMode(repetitiveArticle);
    expect(modeInfo.mode).toBe("repetitive_argument");
    expect(modeInfo.redundancyRatio).toBeGreaterThanOrEqual(0.24);

    const screened = screenThesisKeywords(repetitiveArticle, { habit: "workplace" });
    expect(screened.discourse_mode).toBe("repetitive_argument");
    expect(screened.narrative_boundary.mode).toBe("direct_pithy_gist");
    expect(screened.filtered_redundant_phrases).toContain("换句话说");
    expect(screened.filtered_redundant_phrases).toContain("再举个例子");
    expect(screened.core_thesis_statement).toContain("抓准核心瓶颈并复用自动化工具");
    const topKeywords = screened.thesis_keywords.map((k) => k.keyword);
    expect(topKeywords).toContain("核心瓶颈");
    expect(topKeywords).toContain("自动化工具");
  });

  test("maps technical mechanisms to user gaming habits without long story bloat", () => {
    const prompt = "我平时常玩英雄联盟和FPS游戏，别长篇大论讲故事，帮我解释一下令牌桶限流和梯度下降。";
    expect(detectUserHabit(prompt)).toBe("gaming");

    const report = screenThesisKeywords(prompt);
    expect(report.detected_user_habit).toBe("gaming");
    expect(report.narrative_boundary.mode).toBe("daily_habit_analogy");
    expect(report.narrative_boundary.max_analogy_sentences_per_concept).toBe(2);
    expect(report.habit_analogy_mappings.length).toBeGreaterThanOrEqual(2);
    const allMappings = report.habit_analogy_mappings.map((m) => m.daily_lingo_mapping).join("\n");
    expect(allMappings).toContain("技能冷却（CD）与充能层数");
    expect(allMappings).toContain("FPS 压枪与灵敏度校准");

    const md = renderKeywordScreeningMarkdown(report);
    expect(md).toContain("# 切中观点·极简白话与话术映射报告");
    expect(md).toContain("游戏玩家常用话术");
  });
});
