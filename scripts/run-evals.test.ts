import { describe, expect, test } from "bun:test";
import { runOfflineBenchmarkSuite } from "./run-evals";

describe("run-evals offline benchmark suite", () => {
  test("passes all 32 routing, flagship example, adversarial NLI, visual Mermaid, text recognition judgment, narrative boundary, classical/keyword screening, and v3 lift/stress checks", () => {
    const report = runOfflineBenchmarkSuite();
    expect(report.verdict).toBe("PASS");
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(32);
  });
});
