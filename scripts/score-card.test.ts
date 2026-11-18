import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { analyzeMarkdown, readMarkdown } from "./check-output";
import { buildScoreCard, renderScoreCard } from "./score-card";

const root = resolve(import.meta.dir, "..");
const fixtures = resolve(root, "evals/fixtures");

async function runCheck(args: string[]): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(["bun", "scripts/check-output.ts", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { code, stdout };
}

describe("one-page score card", () => {
  test("default check-output text stays the long report", async () => {
    const { code, stdout } = await runCheck(["evals/fixtures/ok-three-col.md", "--style", "anime"]);
    expect(code).toBe(0);
    expect(stdout).toContain("转换结果校验");
    expect(stdout).not.toContain("一页成绩单");
  });

  test("a missing mapping table scores below a complete draft and names the fix", () => {
    const goodMarkdown = readMarkdown(resolve(fixtures, "ok-four-col.md"));
    const badMarkdown = readMarkdown(resolve(fixtures, "fail-no-mapping.md"));
    const good = buildScoreCard(goodMarkdown, analyzeMarkdown(goodMarkdown, { level: "default", expectedStyle: "detective" }));
    const bad = buildScoreCard(badMarkdown, analyzeMarkdown(badMarkdown, { level: "default", expectedStyle: "neutral" }));
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeGreaterThanOrEqual(50);
    expect(good.score).toBeLessThanOrEqual(100);
    expect(bad.grade === "需要改写" || bad.grade === "重写").toBe(true);
    expect(bad.hits.some((hit) => hit.dimension === "结构" && hit.line >= 1 && hit.fix.includes("四列"))).toBe(true);
    const page = renderScoreCard(bad);
    expect(page).toContain("一页成绩单");
    expect(page).toContain("改法：");
    expect(page).toContain(`总分 ${bad.score}/100`);
  });

  test("--score-card prints the page and --json keeps the card shape", async () => {
    const text = await runCheck(["evals/fixtures/fail-no-mapping.md", "--style", "neutral", "--score-card"]);
    expect(text.code).toBe(1);
    expect(text.stdout.startsWith("一页成绩单")).toBe(true);
    expect(text.stdout).not.toContain("结构检查:");

    const json = await runCheck(["evals/fixtures/ok-four-col.md", "--style", "detective", "--score-card", "--json"]);
    expect(json.code).toBe(0);
    const card = JSON.parse(json.stdout) as { score: number; grade: string; hits: unknown[]; sub_scores: { retell: number } };
    expect(card.score).toBeGreaterThanOrEqual(0);
    expect(card.grade.length).toBeGreaterThan(0);
    expect(Array.isArray(card.hits)).toBe(true);
    expect(card.sub_scores.retell).toBeGreaterThanOrEqual(0);
    expect(json.stdout).not.toContain("structure_verdict");
  });
});
