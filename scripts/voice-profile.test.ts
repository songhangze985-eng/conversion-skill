import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  extractFingerprint,
  importVoiceProfile,
  listVoiceProfiles,
  removeVoiceProfile,
  scoreAgainstFingerprint,
  scoreDraft,
} from "./voice-profile";

const mine = [
  "我昨天又把菜做咸了。你说这盐怎么这么不听话？我就先尝一口，再决定加不加。真烦。下次盐搁远一点。",
  "我今天还是把汤做咸了。你尝一口就知道。我就先关火，再兑水。烦死了。盐罐给我搁远点。",
];
const notMine = "综上所述，本文拟从系统层面探讨盐度控制之必要性。首先，盐的投放应当遵循科学流程。其次，相关主体需要充分认识到过量投放所带来的负面影响。因此，我们必须构建一套完整的闭环机制，从而实现盐度管理的规范化与高质量发展。";

describe("voice profile", () => {
  test("the same passage scores higher than a different register, and the score is stable", () => {
    const fingerprint = extractFingerprint(mine);
    const like = scoreAgainstFingerprint(mine[0] ?? "", fingerprint);
    const unlike = scoreAgainstFingerprint(notMine, fingerprint);
    const again = scoreAgainstFingerprint(mine[0] ?? "", fingerprint);
    expect(like.score).toBeGreaterThanOrEqual(70);
    expect(like.score).toBeGreaterThan(unlike.score);
    expect(like.score - unlike.score).toBeGreaterThanOrEqual(15);
    expect(again.score).toBe(like.score);
    expect(like.sub_scores.sentence_length).toBeGreaterThanOrEqual(0);
    expect(like.sub_scores.punctuation).toBeGreaterThanOrEqual(0);
    expect(like.sub_scores.stance).toBeGreaterThanOrEqual(0);
    expect(like.sub_scores.wording).toBeGreaterThanOrEqual(0);
    expect(unlike.notes.length).toBeGreaterThan(0);
    expect(fingerprint.sentence.avgChars).toBeGreaterThan(0);
  });

  test("import, score, and remove round-trip through a local json file", () => {
    const storePath = join(mkdtempSync(join(tmpdir(), "voice-")), "profiles.json");
    const profile = importVoiceProfile({ storePath, name: "我的", samples: mine, now: "2026-11-18T00:00:00.000Z" });
    expect(profile.sampleCount).toBe(2);
    expect(profile.excerpts).toHaveLength(2);
    const listed = listVoiceProfiles(storePath);
    expect(listed.map((item) => item.id)).toEqual(["我的"]);

    const scored = scoreDraft(storePath, "我的", mine[0] ?? "");
    expect(scored.score.score).toBeGreaterThanOrEqual(70);
    expect(scored.score.features.map((feature) => feature.feature)).toEqual([
      "sentence_length",
      "rhythm",
      "punctuation",
      "stance",
      "wording",
      "paragraph",
    ]);

    expect(removeVoiceProfile(storePath, "我的")).toBe(true);
    expect(listVoiceProfiles(storePath)).toHaveLength(0);
    expect(() => scoreDraft(storePath, "我的", mine[0] ?? "")).toThrow(/没有名为/);
  });

  test("an empty sample is refused", () => {
    const storePath = join(mkdtempSync(join(tmpdir(), "voice-")), "profiles.json");
    expect(() => importVoiceProfile({ storePath, name: "空", samples: ["   ", "短"] })).toThrow(/8 个字/);
  });

  test("the cli writes and scores a profile", async () => {
    const storePath = join(mkdtempSync(join(tmpdir(), "voice-cli-")), "profiles.json");
    const root = resolve(import.meta.dir, "..");
    const imported = Bun.spawn([
      "bun",
      "scripts/voice-profile.ts",
      "import",
      "--store",
      storePath,
      "--name",
      "我的",
      "--text",
      mine[0] ?? "",
      "--text",
      mine[1] ?? "",
      "--json",
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(await imported.exited).toBe(0);
    const scored = Bun.spawn([
      "bun",
      "scripts/voice-profile.ts",
      "score",
      "--store",
      storePath,
      "--name",
      "我的",
      "--text",
      mine[0] ?? "",
      "--json",
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(scored.stdout).text();
    expect(await scored.exited).toBe(0);
    const payload = JSON.parse(stdout) as { score: number; sub_scores: { sentence_length: number } };
    expect(payload.score).toBeGreaterThanOrEqual(70);
    expect(payload.sub_scores.sentence_length).toBeGreaterThanOrEqual(0);
  });
});
