import { describe, expect, test } from "bun:test";
import { buildNavigation, draftLedger, extractPaperArtifacts, sortPdfTextItemsTwoColumn, type PageText } from "./evaluate-pdf";

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

  test("keeps a wide left-column line in column order instead of gluing across the gutter", () => {
    const page = (leftWidth: number) => [
      { str: "Left column opens with a short sentence.", x: 72, y: 700, width: leftWidth },
      { str: "Right column opens with another sentence.", x: 320, y: 700, width: 220 },
      { str: "Left column continues on the next line.", x: 72, y: 680, width: 230 },
      { str: "Right column continues on the next line.", x: 320, y: 680, width: 220 },
    ];
    const expected = [
      "Left column opens with a short sentence.",
      "Left column continues on the next line.",
      "Right column opens with another sentence.",
      "Right column continues on the next line.",
    ];

    const narrow = sortPdfTextItemsTwoColumn(page(230), 612);
    expect(narrow.layoutMode).toBe("two-column");
    expect(narrow.lines).toEqual(expected);

    const wide = sortPdfTextItemsTwoColumn(page(255), 612);
    expect(wide.layoutMode).toBe("two-column");
    expect(wide.lines).toEqual(expected);
  });

  test("joins same-line fragments on a single-column page", () => {
    const sorted = sortPdfTextItemsTwoColumn(
      [
        { str: "Single column line one", x: 72, y: 700, width: 254 },
        { str: "keeps its second half.", x: 330, y: 700, width: 150 },
        { str: "Single column line two", x: 72, y: 678, width: 254 },
        { str: "keeps its second half.", x: 330, y: 678, width: 150 },
      ],
      612,
    );
    expect(sorted.layoutMode).toBe("single-column");
    expect(sorted.lines).toEqual([
      "Single column line one keeps its second half.",
      "Single column line two keeps its second half.",
    ]);
  });

  test("reads each two-column block separately around a full-width caption", () => {
    const sorted = sortPdfTextItemsTwoColumn(
      [
        { str: "Upper left sentence one.", x: 72, y: 720, width: 220 },
        { str: "Upper right sentence one.", x: 320, y: 720, width: 210 },
        { str: "Upper left sentence two.", x: 72, y: 700, width: 220 },
        { str: "Upper right sentence two.", x: 320, y: 700, width: 210 },
        { str: "Figure 1. A full-width caption spanning both columns.", x: 72, y: 660, width: 460 },
        { str: "Lower left sentence one.", x: 72, y: 620, width: 220 },
        { str: "Lower right sentence one.", x: 320, y: 620, width: 210 },
        { str: "Lower left sentence two.", x: 72, y: 600, width: 220 },
        { str: "Lower right sentence two.", x: 320, y: 600, width: 210 },
      ],
      612,
    );
    expect(sorted.layoutMode).toBe("two-column");
    expect(sorted.lines).toEqual([
      "Upper left sentence one.",
      "Upper left sentence two.",
      "Upper right sentence one.",
      "Upper right sentence two.",
      "Figure 1. A full-width caption spanning both columns.",
      "Lower left sentence one.",
      "Lower left sentence two.",
      "Lower right sentence one.",
      "Lower right sentence two.",
    ]);
  });
});
