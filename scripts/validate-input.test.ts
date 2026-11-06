import { describe, expect, test } from "bun:test";
import { analyzeInput } from "./validate-input";

describe("validate-input routing", () => {
  test("formulas recommend explaining the symbols first", () => {
    const result = analyzeInput("贝叶斯定理 P(A|B)=P(B|A)P(A)/P(B)");
    expect(result.has_formula).toBe(true);
    expect(result.recommend_action).toBe("explain_formula_first");
  });

  test("short greetings ask for knowledge text", () => {
    const result = analyzeInput("你好啊");
    expect(result.is_chitchat).toBe(true);
    expect(result.recommend_action).toBe("ask_for_input");
  });

  test("requested ten-thousand-word dumps are refused as longform", () => {
    const result = analyzeInput("请写成10000字");
    expect(result.wants_longform).toBe(true);
    expect(result.recommend_action).toBe("refuse_length");
  });

  test("weather as a technical topic is not chitchat", () => {
    const result = analyzeInput("天气预报里的时空模型为什么要同时看地点和时间？");
    expect(result.is_chitchat).toBe(false);
    expect(result.recommend_action).toBe("proceed");
  });

  test("unreadable or corrupted academic PDF requests are refused instead of guessed", () => {
    const result = analyzeInput("我有一篇学术 PDF，文本层损坏，关键页也看不清。请直接讲它的核心贡献，并标出页码。");
    expect(result.is_unreadable).toBe(true);
    expect(result.is_academic_paper).toBe(true);
    expect(result.recommend_action).toBe("refuse_unreadable");
  });

  test("beginner and low-comprehension cues set wants_beginner_mode", () => {
    const result = analyzeInput("我是纯小白，理解能力差，完全看不懂递归算法，能用大白话讲讲吗？");
    expect(result.is_chitchat).toBe(false);
    expect(result.wants_beginner_mode).toBe(true);
    expect(result.recommend_action).toBe("proceed");
  });

  test("classical Chinese and gaming habit cues route to concise gist or gaming habit analogy", () => {
    const classical = analyzeInput("君子曰：学不可以已。青，取之于蓝，而青于蓝；冰，水为之，而寒于水。君子生非异也，善假于物也。");
    expect(classical.is_chitchat).toBe(false);
    expect(classical.is_classical_chinese).toBe(true);
    expect(classical.narrative_mode).toBe("direct_pithy_gist");
    expect(classical.keyword_screening?.classical_translation?.matched_canonical_source).toBe("《荀子·劝学》");

    const gaming = analyzeInput("我常玩英雄联盟和FPS游戏，能用游戏技能CD和压枪给我讲讲限流器和梯度下降吗？", "auto", { screenKeywords: true });
    expect(gaming.detected_user_habit).toBe("gaming");
    expect(gaming.narrative_mode).toBe("daily_habit_analogy");
    expect(gaming.keyword_screening?.habit_analogy_mappings[0]?.habit).toBe("gaming");
  });
});
