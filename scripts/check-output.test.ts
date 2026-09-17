import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { analyzeMarkdown, readMarkdown } from "./check-output";

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
});
