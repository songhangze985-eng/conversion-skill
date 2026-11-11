import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "pipeline.ts");

async function runPipeline(args: string[], stdin?: string) {
  const proc = Bun.spawn([process.execPath, script, ...args], {
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { status, stdout, stderr };
}

describe("pipeline stdin", () => {
  test("a bare dash reads stdin into routing JSON and -f still reads a file", async () => {
    const fromStdin = await runPipeline(["-", "--json"], "两阶段提交");
    expect(fromStdin.status).toBe(0);
    const stdinJson = JSON.parse(fromStdin.stdout) as {
      default_routing: { mode: string };
      one_shot_fast_value: { pithy_gist: string };
    };
    expect(stdinJson.default_routing.mode).toBe("habit_fast_value");
    expect(stdinJson.one_shot_fast_value.pithy_gist).toContain("两阶段提交");

    const dir = mkdtempSync(join(tmpdir(), "pipeline-stdin-"));
    const file = join(dir, "input.txt");
    writeFileSync(file, "两阶段提交", "utf8");
    const fromFile = await runPipeline(["-f", file, "--json"]);
    expect(fromFile.status).toBe(0);
    const fileJson = JSON.parse(fromFile.stdout) as {
      default_routing: { mode: string };
      one_shot_fast_value: { pithy_gist: string };
    };
    expect(fileJson.default_routing.mode).toBe("habit_fast_value");
    expect(fileJson.one_shot_fast_value.pithy_gist).toContain("两阶段提交");

    const unknown = await runPipeline(["--not-an-option"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("未知选项：--not-an-option");
  });
});
