import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { analyzeMarkdown, evaluateChunksIndependently, readMarkdown, renderDeterministic } from "./check-output";
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
});
