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
});
