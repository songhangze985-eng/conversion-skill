import { describe, expect, test } from "bun:test";
import { buildNavigation, draftLedger, extractPaperArtifacts, type PageText } from "./evaluate-pdf";

describe("evaluate-pdf layout & artifact navigation", () => {
  const samplePages: PageText[] = [
    {
      page: 1,
      characters: 450,
      text: [
        "GraphFlow: Scalable Isomorphic Attention for Dynamic Networks",
        "Alice Smith, Bob Jones",
        "Abstract",
        "We propose GraphFlow, a sparse attention mechanism that bounds memory growth by pruning low-weight edges before aggregation.",
        "1. Introduction",
        "Standard self-attention scales quadratically with sequence length.",
      ].join("\n"),
    },
    {
      page: 2,
      characters: 520,
      text: [
        "2. Proposed Architecture",
        "Our framework computes attention weights using a thresholded kernel and updates node states iteratively.",
        "Algorithm 1: Thresholded GraphFlow Update",
        "Input: Graph G=(V,E), threshold tau. Output: Updated embeddings H.",
        "score(u, v) = softmax(Q_u K_v^T / sqrt(d)) (1)",
        "Figure 1: Overview of the GraphFlow sparse pruning pipeline across three layers.",
      ].join("\n"),
    },
    {
      page: 3,
      characters: 380,
      text: [
        "3. Experiments and Results",
        "GraphFlow reduces peak GPU memory by 62% while maintaining accuracy on three benchmarks.",
        "Table 1: Memory and latency comparison across baseline transformers.",
        "4. Conclusion and Future Work",
        "We demonstrated that thresholded pruning preserves accuracy under bounded degree assumptions.",
      ].join("\n"),
    },
  ];

  test("recognizes numbered custom section headings for method, results, and conclusion", () => {
    const nav = buildNavigation(samplePages);
    const sections = nav.map((n) => n.section);
    expect(sections).toEqual(["title", "abstract", "results", "method", "conclusion"]);
    const methodEntry = nav.find((n) => n.section === "method");
    expect(methodEntry?.page).toBe(2);
    expect(methodEntry?.evidence).toContain("Proposed Architecture");
  });

  test("recognizes Chinese headings for abstract, method, results, and conclusion", () => {
    const pages: PageText[] = [
      {
        page: 1,
        characters: 680,
        text: [
          "稀疏注意力在长文档上的内存边界研究",
          "摘要",
          "本文方法在聚合之前剪除低权重边，实验结果表明峰值显存下降，并在三个基准上验证该机制的有效性与复杂度。",
          "1. 引言",
          "标准自注意力的计算开销随序列长度呈二次增长，长文档场景下显存很快成为主要瓶颈，因此需要新的剪枝策略。",
          "2. 研究方法",
          "我们的算法使用阈值核计算注意力权重，模型架构包含三个模块，目标函数约束复杂度，并通过公式推导迭代更新节点状态。",
          "结果",
          "三个基准上的峰值显存下降百分之六十二，准确率与稠密模型保持在一个点以内。",
          "结论",
          "阈值剪枝在有界度假设下能够保持准确率，适合长文档推理部署。",
        ].join("\n"),
      },
    ];
    const nav = buildNavigation(pages);
    expect(nav.map((n) => n.section)).toEqual(["title", "abstract", "results", "method", "conclusion"]);
    expect(nav.find((n) => n.section === "abstract")?.evidence.startsWith("摘要")).toBe(true);
    expect(nav.find((n) => n.section === "method")?.evidence.startsWith("2. 研究方法")).toBe(true);
    expect(nav.find((n) => n.section === "results")?.evidence.startsWith("结果 三个基准")).toBe(true);
    expect(nav.find((n) => n.section === "conclusion")?.evidence.startsWith("结论")).toBe(true);
  });

  test("slices results evidence from the heading line that matched", () => {
    const pages: PageText[] = [
      {
        page: 4,
        characters: 420,
        text: [
          "Results from the pilot study showed a twelve percent gain on the validation split before the main training run.",
          "1. Introduction",
          "This paper studies sparse attention under a fixed memory budget for long documents.",
          "Results",
          "Peak GPU memory fell by 62% while accuracy stayed within one point of the dense baseline.",
        ].join("\n"),
      },
    ];
    const results = buildNavigation(pages).find((n) => n.section === "results");
    expect(results?.page).toBe(4);
    expect(results?.evidence.startsWith("Results Peak GPU memory fell by 62%")).toBe(true);
  });

  test("extracts figures, tables, algorithms, and numbered equations into structured artifacts", () => {
    const artifacts = extractPaperArtifacts(samplePages);
    const kinds = artifacts.map((a) => a.kind);
    expect(kinds).toContain("algorithm");
    expect(kinds).toContain("figure");
    expect(kinds).toContain("table");
    expect(kinds).toContain("equation");

    const ledger = draftLedger("paper.pdf", buildNavigation(samplePages), artifacts);
    expect(Array.isArray(ledger.structured_artifacts)).toBe(true);
  });
});
