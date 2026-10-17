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

  test("verse, narrative, and podcast are selectable styles", () => {
    for (const style of ["verse", "narrative", "podcast"] as const) {
      const markdown = renderTemplate("上下文压缩", style, "default", false);
      expect(markdown).toContain(`> 表达风格：\`${style}\``);
    }
  });

  test("default skeleton does not emit long-form chunk anchors", () => {
    const markdown = renderTemplate("快速排序", "anime", "default", false);
    expect(markdown).not.toContain("CHUNK_ANCHOR");
    expect(markdown).not.toContain("## 第 1 节");
  });

  test("long skeleton emits four chunk anchors unless a count is given", () => {
    const markdown = renderTemplate("技能", "anime", "long", false);
    expect(markdown).toContain("> 表达强度：`standard`");
    expect(markdown).toContain("## 第 1 节：痛点切入与初始状态");
    expect(markdown).toContain("<!-- [CHUNK_ANCHOR_4]");
    expect(markdown).not.toContain("CHUNK_ANCHOR_5");
    const three = renderTemplate("技能", "anime", "long", false, "standard", false, undefined, undefined, undefined, 3);
    expect(three).toContain("<!-- [CHUNK_ANCHOR_3]");
    expect(three).not.toContain("CHUNK_ANCHOR_4");
  });

  test("comprehension section is opt-in", () => {
    const markdown = renderTemplate("CAP", "war-room", "default", false, "standard", true);
    expect(markdown).toContain("## 理解检验");
    expect(markdown).toContain("复述问题");
    expect(markdown).toContain("迁移问题");
  });
});
