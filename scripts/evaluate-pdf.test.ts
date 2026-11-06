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
