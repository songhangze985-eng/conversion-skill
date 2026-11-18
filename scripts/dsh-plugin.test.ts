import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { apply, TOOL_NAMES, version } from "../index.js";

const root = resolve(import.meta.dir, "..");

describe("DeepSeek Harness plugin", () => {
  test("package manifest matches the bundle layout and the skill version", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      name: string;
      version: string;
      main: string;
      dsh: { bundle: { patch: string } };
    };
    const patch = readFileSync(join(root, pkg.dsh.bundle.patch), "utf8");
    const skill = readFileSync(join(root, "SKILL.md"), "utf8");
    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    expect(pkg.name).toBe("conversion-skill");
    expect(pkg.version).toBe("3.1.0");
    expect(version).toBe(pkg.version);
    expect(pkg.main).toBe("index.js");
    expect(pkg.dsh.bundle.patch).toBe("./cordis.patch.yml");
    expect(patch).toContain("name: 'conversion-skill'");
    expect(patch).toContain("id: conversion-skill");
    expect(skill).toContain(`version: "${pkg.version}"`);
    expect(changelog.startsWith("# Changelog\n\n## 3.1.0")).toBe(true);
    expect(changelog).toContain("## 3.0.0 — 2026-11-11");
  });

  test("apply registers the bun tools and the voice tools", () => {
    const registered: Array<{ name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }> = [];
    apply({
      tools: {
        register(tool: { name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }) {
          registered.push(tool);
          return () => {};
        },
      },
      effect(dispose: () => void) {
        dispose();
      },
    });
    expect(registered.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  test("score_card and voice tools run the bun scripts", async () => {
    const registered = new Map<string, (args: Record<string, unknown>) => Promise<Record<string, unknown>>>();
    const storePath = join(mkdtempSync(join(tmpdir(), "dsh-voice-")), "profiles.json");
    apply(
      {
        tools: {
          register(tool: { name: string; execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }) {
            registered.set(tool.name, tool.execute);
            return () => {};
          },
        },
      },
      { storagePath: storePath },
    );

    const score = await registered.get("score_card")!({
      path: join(root, "evals/fixtures/fail-no-mapping.md"),
      style: "neutral",
    });
    expect(score.ok).toBe(true);
    expect(typeof score.score).toBe("number");
    expect(score.grade).toBeTruthy();
    expect(Array.isArray(score.hits)).toBe(true);

    const imported = await registered.get("voice_import")!({
      name: "我的",
      samples: ["我昨天又把菜做咸了。你说这盐怎么这么不听话？我就先尝一口，再决定加不加。真烦。下次盐搁远一点。"],
    });
    expect(imported.ok).toBe(true);

    const scored = await registered.get("voice_score")!({
      name: "我的",
      text: "我今天还是把汤做咸了。你尝一口就知道。我就先关火，再兑水。烦死了。盐罐给我搁远点。",
    });
    expect(scored.ok).toBe(true);
    expect(typeof scored.score).toBe("number");
    expect(scored.sub_scores).toBeTruthy();

    const removed = await registered.get("voice_remove")!({ name: "我的" });
    expect(removed.ok).toBe(true);
  });
});
