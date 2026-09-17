import { describe, expect, test } from "bun:test";
import { renderTemplate } from "./generate-template";

describe("generate-template", () => {
  test("default skeleton stays optional-tool compatible and omits comprehension", () => {
    const markdown = renderTemplate("快速排序", "anime", "default", false);
    expect(markdown).toContain("> 表达风格：`anime`");
    expect(markdown).toContain("| 知识概念 | 类比元素 | 对应机制 | 适用边界 |");
    expect(markdown).toContain("原文事实");
    expect(markdown).not.toContain("## 理解检验");
  });

  test("legacy light style still maps to anime", () => {
    const markdown = renderTemplate("递归", "anime", "default", true, "light");
    expect(markdown).toContain("> 表达强度：`light`");
    expect(markdown).toContain("### 公式含义");
  });

  test("comprehension section is opt-in", () => {
    const markdown = renderTemplate("CAP", "war-room", "default", false, "standard", true);
    expect(markdown).toContain("## 理解检验");
    expect(markdown).toContain("复述问题");
    expect(markdown).toContain("迁移问题");
  });
});
