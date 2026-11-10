import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as screenKeywords from "./screen-keywords";
import { analyzeInput } from "./validate-input";

// Knowledge Base Paths
const GAMING_KB_PATH = resolve(import.meta.dir, "../assets/knowledge/gaming-kb.json");
const LIFE_MEMES_KB_PATH = resolve(import.meta.dir, "../assets/knowledge/life-memes-kb.json");
const CLASSICAL_KB_PATH = resolve(import.meta.dir, "../assets/knowledge/classical-chinese-kb.json");
const STORY_AUTHORS_KB_PATH = resolve(import.meta.dir, "../assets/knowledge/story-authors-kb.json");
const SKILL_MD_PATH = resolve(import.meta.dir, "../SKILL.md");
const SOCRATIC_MD_PATH = resolve(import.meta.dir, "../references/socratic-microstep.md");
const STYLE_NARRATIVE_MD_PATH = resolve(import.meta.dir, "../references/style-narrative.md");

// Helper to safely load Knowledge Base JSON structures
function loadGamingJson() {
  if (typeof (screenKeywords as any).loadGamingKnowledgeBase === "function") {
    return (screenKeywords as any).loadGamingKnowledgeBase();
  }
  if (!existsSync(GAMING_KB_PATH)) {
    throw new Error(`Gaming KB not found at: ${GAMING_KB_PATH}`);
  }
  return JSON.parse(readFileSync(GAMING_KB_PATH, "utf-8"));
}

function loadLifeMemesJson() {
  if (typeof (screenKeywords as any).loadLifeMemesKnowledgeBase === "function") {
    return (screenKeywords as any).loadLifeMemesKnowledgeBase();
  }
  if (!existsSync(LIFE_MEMES_KB_PATH)) {
    throw new Error(`Life Memes KB not found at: ${LIFE_MEMES_KB_PATH}`);
  }
  return JSON.parse(readFileSync(LIFE_MEMES_KB_PATH, "utf-8"));
}

function loadClassicalJson() {
  if (typeof (screenKeywords as any).loadClassicalKnowledgeBase === "function") {
    return (screenKeywords as any).loadClassicalKnowledgeBase();
  }
  if (!existsSync(CLASSICAL_KB_PATH)) {
    throw new Error(`Classical Chinese KB not found at: ${CLASSICAL_KB_PATH}`);
  }
  return JSON.parse(readFileSync(CLASSICAL_KB_PATH, "utf-8"));
}

function loadStoryAuthorsJson() {
  if (typeof (screenKeywords as any).loadStoryAuthorsKnowledgeBase === "function") {
    return (screenKeywords as any).loadStoryAuthorsKnowledgeBase();
  }
  if (!existsSync(STORY_AUTHORS_KB_PATH)) {
    throw new Error(`Story Authors KB not found at: ${STORY_AUTHORS_KB_PATH}`);
  }
  return JSON.parse(readFileSync(STORY_AUTHORS_KB_PATH, "utf-8"));
}

function loadSkillMarkdown(): string {
  if (!existsSync(SKILL_MD_PATH)) {
    throw new Error(`SKILL.md not found at: ${SKILL_MD_PATH}`);
  }
  return readFileSync(SKILL_MD_PATH, "utf-8");
}

/* =========================================================================
   TIER 1 — Feature Coverage (F01–F13)
   Comprehensive verification of each knowledge base's JSON schema,
   required properties, entry counts, and interactive pipeline stage wording.
   ========================================================================= */
describe("Tier 1: Feature Coverage (F01–F13)", () => {
  // F01: Gaming KB Schema & Taxonomy
  test("F01: Gaming KB JSON top-level structure, schema_version === '1.0', 8+ genres, 8 mechanic categories", () => {
    const kb = loadGamingJson();
    expect(kb).toBeDefined();
    expect(kb.schema_version).toBe("1.0");
    expect(kb.name).toBe("conversion-skill-gaming-kb");
    expect(typeof kb.description).toBe("string");
    expect(kb.description.length).toBeGreaterThanOrEqual(15);
    expect(kb.metadata).toBeDefined();
    expect(kb.metadata.author).toBe("conversion-skill-team");
    expect(typeof kb.metadata.total_entries).toBe("number");
    expect(kb.metadata.total_entries).toBeGreaterThanOrEqual(22);

    // Verify 8+ genres
    const expectedGenres = [
      "MMO",
      "MOBA",
      "ARPG_SOULS",
      "GACHA_RPG",
      "FTG",
      "ROGUELIKE",
      "STRATEGY_RTS",
      "FPS_BR",
      "UNIVERSAL",
    ];
    expect(Array.isArray(kb.genres)).toBe(true);
    for (const genre of expectedGenres) {
      expect(kb.genres).toContain(genre);
    }

    // Verify 8 mechanic categories
    const expectedCategories = [
      "resource_management",
      "combat_action_flow",
      "threat_and_targeting",
      "crowd_control_defense",
      "progression_economy",
      "frame_and_timing",
      "spatial_and_vision",
      "system_and_meta",
    ];
    expect(Array.isArray(kb.mechanic_categories)).toBe(true);
    for (const cat of expectedCategories) {
      expect(kb.mechanic_categories).toContain(cat);
    }
  });

  // F02: Core Game Mechanics entries (>=22 entries)
  test("F02: Gaming KB entries count (>=22) with all required properties present and valid", () => {
    const kb = loadGamingJson();
    expect(Array.isArray(kb.entries)).toBe(true);
    expect(kb.entries.length).toBeGreaterThanOrEqual(22);

    // Verify all required properties on every entry
    for (const entry of kb.entries) {
      expect(entry.id).toMatch(/^GM-[A-Z0-9-]+$/);
      expect(typeof entry.term_zh).toBe("string");
      expect(entry.term_zh.trim().length).toBeGreaterThanOrEqual(2);
      expect(typeof entry.term_en).toBe("string");
      expect(entry.term_en.trim().length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(entry.aliases.length).toBeGreaterThanOrEqual(1);
      expect(kb.genres).toContain(entry.genre);
      expect(kb.mechanic_categories).toContain(entry.category);
      expect(typeof entry.mechanic_definition).toBe("string");
      expect(entry.mechanic_definition.length).toBeGreaterThanOrEqual(15);
      expect(Array.isArray(entry.abstract_concept_mapping)).toBe(true);
      expect(entry.abstract_concept_mapping.length).toBeGreaterThanOrEqual(3);
      expect(typeof entry.real_life_analogy).toBe("string");
      expect(entry.real_life_analogy.length).toBeGreaterThanOrEqual(10);
      expect(typeof entry.narrative_boundary_tip).toBe("string");
      expect(entry.narrative_boundary_tip.length).toBeGreaterThanOrEqual(10);

      // Verify conversion examples
      expect(Array.isArray(entry.conversion_examples)).toBe(true);
      expect(entry.conversion_examples.length).toBeGreaterThanOrEqual(1);
      for (const ex of entry.conversion_examples) {
        expect(typeof ex.source_concept).toBe("string");
        expect(ex.source_concept.length).toBeGreaterThanOrEqual(5);
        expect(typeof ex.game_analogy_output).toBe("string");
        expect(ex.game_analogy_output.length).toBeGreaterThanOrEqual(10);
        expect(typeof ex.boundary_limitation).toBe("string");
        expect(ex.boundary_limitation.length).toBeGreaterThanOrEqual(6);
      }
    }

    // Verify key core mechanics are present
    const entryIds = kb.entries.map((e: any) => e.id);
    expect(entryIds).toContain("GM-CD-001"); // CD
    expect(entryIds).toContain("GM-MANA-002"); // 蓝耗
    expect(entryIds).toContain("GM-AGGRO-003"); // 仇恨
    expect(entryIds).toContain("GM-SL-004"); // 读档/SL
    expect(entryIds).toContain("GM-ARMOR-005"); // 霸体
    expect(entryIds).toContain("GM-FRAME-006"); // 判定帧与前后摇
    expect(entryIds).toContain("GM-IFRAME-007"); // 无敌帧
    expect(entryIds).toContain("GM-INFLATION-008"); // 数值膨胀
  });

  // F03: Life Memes KB Schema & Taxonomy
  test("F03: Life Memes KB JSON structure, schema_version === '1.0', 4 categories, 7+ emotional tones", () => {
    const kb = loadLifeMemesJson();
    expect(kb).toBeDefined();
    expect(kb.schema_version).toBe("1.0");
    expect(kb.name).toBe("conversion-skill-life-memes-kb");
    expect(typeof kb.description).toBe("string");
    expect(kb.description.length).toBeGreaterThanOrEqual(15);
    expect(kb.metadata).toBeDefined();
    expect(kb.metadata.author).toBe("conversion-skill-team");
    expect(typeof kb.metadata.total_entries).toBe("number");
    expect(kb.metadata.total_entries).toBeGreaterThanOrEqual(22);

    // Verify 4 categories
    const expectedCategories = [
      "internet_memes",
      "workplace_social",
      "colloquialisms_idioms",
      "life_metaphors",
    ];
    expect(Array.isArray(kb.categories)).toBe(true);
    for (const cat of expectedCategories) {
      expect(kb.categories).toContain(cat);
    }

    // Verify 7+ emotional tones
    const expectedTones = [
      "humorous",
      "self_deprecating",
      "sarcastic",
      "warning",
      "neutral",
      "empathic",
      "critical",
    ];
    expect(Array.isArray(kb.emotional_tones)).toBe(true);
    for (const tone of expectedTones) {
      expect(kb.emotional_tones).toContain(tone);
    }
  });

  // F04: Core Life Memes entries (>=22 entries)
  test("F04: Life Memes entries count (>=22) with required properties, pragmatic vs literal disambiguation", () => {
    const kb = loadLifeMemesJson();
    expect(Array.isArray(kb.entries)).toBe(true);
    expect(kb.entries.length).toBeGreaterThanOrEqual(22);

    for (const entry of kb.entries) {
      expect(entry.id).toMatch(/^LM-[A-Z0-9-]+$/);
      expect(typeof entry.term).toBe("string");
      expect(entry.term.trim().length).toBeGreaterThanOrEqual(2);
      expect(typeof entry.pinyin_or_source).toBe("string");
      expect(entry.pinyin_or_source.trim().length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(entry.aliases.length).toBeGreaterThanOrEqual(1);
      expect(kb.categories).toContain(entry.category);
      expect(kb.emotional_tones).toContain(entry.emotional_tone);
      expect(typeof entry.literal_meaning).toBe("string");
      expect(entry.literal_meaning.length).toBeGreaterThanOrEqual(10);
      expect(typeof entry.pragmatic_meaning).toBe("string");
      expect(entry.pragmatic_meaning.length).toBeGreaterThanOrEqual(10);
      expect(typeof entry.layman_explanation).toBe("string");
      expect(entry.layman_explanation.length).toBeGreaterThanOrEqual(10);
      expect(Array.isArray(entry.abstract_concept_mapping)).toBe(true);
      expect(entry.abstract_concept_mapping.length).toBeGreaterThanOrEqual(2);
      expect(typeof entry.narrative_boundary_tip).toBe("string");
      expect(entry.narrative_boundary_tip.length).toBeGreaterThanOrEqual(10);

      // Verify conversion examples
      expect(Array.isArray(entry.conversion_examples)).toBe(true);
      expect(entry.conversion_examples.length).toBeGreaterThanOrEqual(1);
      for (const ex of entry.conversion_examples) {
        expect(typeof ex.source_concept).toBe("string");
        expect(ex.source_concept.length).toBeGreaterThanOrEqual(5);
        expect(typeof ex.colloquial_output).toBe("string");
        expect(ex.colloquial_output.length).toBeGreaterThanOrEqual(10);
        expect(typeof ex.boundary_limitation).toBe("string");
        expect(ex.boundary_limitation.length).toBeGreaterThanOrEqual(6);
      }
    }

    // Verify key trending memes and colloquial expressions are present
    const terms = kb.entries.map((e: any) => e.term);
    expect(terms).toContain("草台班子");
    expect(terms).toContain("画大饼");
    expect(terms).toContain("对齐颗粒度");
    expect(terms).toContain("破防");
    expect(terms).toContain("硬控");
    expect(terms).toContain("摸鱼 / 薪水小偷");
    expect(terms).toContain("电子布洛芬");
    expect(terms).toContain("脆皮大学生");
  });

  // F05: Classical Chinese KB Schema Compatibility
  test("F05: Classical Chinese KB schema_version === '1.0', preserving backward compatibility", () => {
    const kb = loadClassicalJson();
    expect(kb).toBeDefined();
    expect(kb.schema_version).toBe("1.0");
    expect(kb.name).toBe("conversion-skill-classical-chinese-kb");
    expect(typeof kb.description).toBe("string");
    expect(Array.isArray(kb.particles_and_patterns)).toBe(true);
    expect(Array.isArray(kb.lexical_entries)).toBe(true);
    expect(Array.isArray(kb.canonical_passages)).toBe(true);
    expect(typeof kb.habit_analogy_lexicon).toBe("object");
  });

  // F06: Particle Patterns Expansion (P01–P30)
  test("F06: Particle patterns count >= 30, entries P01-P30 present with valid regexes", () => {
    const kb = loadClassicalJson();
    expect(kb.particles_and_patterns.length).toBeGreaterThanOrEqual(30);

    const ids = kb.particles_and_patterns.map((p: any) => p.id);
    for (let i = 1; i <= 30; i++) {
      const pid = `P${String(i).padStart(2, "0")}`;
      expect(ids).toContain(pid);
    }

    for (const pattern of kb.particles_and_patterns) {
      expect(pattern.id).toMatch(/^P\d+$/);
      expect(typeof pattern.token).toBe("string");
      expect(typeof pattern.regex).toBe("string");
      expect(typeof pattern.category).toBe("string");
      expect(typeof pattern.vernacular).toBe("string");
      expect(typeof pattern.thesis_signal_weight).toBe("number");
      expect(pattern.thesis_signal_weight).toBeGreaterThanOrEqual(0);
      expect(pattern.thesis_signal_weight).toBeLessThanOrEqual(1.0);
      expect(typeof pattern.explanation).toBe("string");
      expect(typeof pattern.example).toBe("string");
    }

    // Check expanded syntax patterns: 定语后置 (P19), 状语后置 (P20), 主谓倒装 (P21), 反诘岂…哉 (P25)
    const p19 = kb.particles_and_patterns.find((p: any) => p.id === "P19");
    expect(p19).toBeDefined();
    expect(p19.category).toContain("后置");

    const p20 = kb.particles_and_patterns.find((p: any) => p.id === "P20");
    expect(p20).toBeDefined();
    expect(p20.token).toContain("于");

    const p21 = kb.particles_and_patterns.find((p: any) => p.id === "P21");
    expect(p21).toBeDefined();
    expect(p21.category).toContain("倒装");

    const p25 = kb.particles_and_patterns.find((p: any) => p.id === "P25");
    expect(p25).toBeDefined();
    expect(p25.category).toContain("反诘");
  });

  // F07: Lexical Entries Expansion (80+ items)
  test("F07: Lexical entries count >= 80, 40+ false friends, syntactic shifts and pivots present", () => {
    const kb = loadClassicalJson();
    expect(kb.lexical_entries.length).toBeGreaterThanOrEqual(80);

    let falseFriendCount = 0;
    for (const entry of kb.lexical_entries) {
      expect(typeof entry.word).toBe("string");
      expect(entry.word.trim().length).toBeGreaterThanOrEqual(1);
      expect(typeof entry.classical_meaning).toBe("string");
      expect(typeof entry.pithy_vernacular).toBe("string");
      expect(typeof entry.is_false_friend).toBe("boolean");
      expect(typeof entry.trap_note).toBe("string");

      if (entry.is_false_friend) {
        falseFriendCount++;
      }
    }
    expect(falseFriendCount).toBeGreaterThanOrEqual(40);

    const words = kb.lexical_entries.map((e: any) => e.word);
    expect(words).toContain("善假于物");
    expect(words).toContain("绝境");
    expect(words).toContain("交通");
    expect(words).toContain("爪牙");
    expect(words).toContain("无论");
    expect(words).toContain("卑鄙");
    expect(words).toContain("感激");
    expect(words).toContain("牺牲");
    expect(words).toContain("妻子");
  });

  // F08: Canonical Passages Expansion (CC01–CC30)
  test("F08: Canonical passages count >= 30 (CC01-CC30), xindaya breakdown, tri-domain analogies present", () => {
    const kb = loadClassicalJson();
    expect(kb.canonical_passages.length).toBeGreaterThanOrEqual(30);

    const ids = kb.canonical_passages.map((c: any) => c.id);
    for (let i = 1; i <= 30; i++) {
      const cid = `CC${String(i).padStart(2, "0")}`;
      expect(ids).toContain(cid);
    }

    for (const passage of kb.canonical_passages) {
      expect(passage.id).toMatch(/^CC\d+$/);
      expect(typeof passage.source).toBe("string");
      expect(typeof passage.classical_text).toBe("string");
      expect(Array.isArray(passage.match_anchors)).toBe(true);
      expect(passage.match_anchors.length).toBeGreaterThanOrEqual(1);
      expect(typeof passage.pithy_vernacular).toBe("string");
      expect(typeof passage.core_thesis).toBe("string");
      expect(Array.isArray(passage.thesis_keywords)).toBe(true);

      // Verify habit mappings for tri-domain
      expect(passage.habit_mappings).toBeDefined();
      expect(typeof passage.habit_mappings.gaming).toBe("string");
      expect(typeof passage.habit_mappings.daily).toBe("string");
      expect(typeof passage.habit_mappings.workplace).toBe("string");
      expect(passage.habit_mappings.gaming.length).toBeGreaterThanOrEqual(5);
      expect(passage.habit_mappings.daily.length).toBeGreaterThanOrEqual(5);
      expect(passage.habit_mappings.workplace.length).toBeGreaterThanOrEqual(5);
    }
  });

  // F09: Script loaders: loadGamingKnowledgeBase(), loadLifeMemesKnowledgeBase(), loadClassicalKnowledgeBase()
  test("F09: Script loaders: loadGamingKnowledgeBase(), loadLifeMemesKnowledgeBase(), loadClassicalKnowledgeBase()", () => {
    expect(typeof (screenKeywords as any).loadClassicalKnowledgeBase).toBe("function");
    expect(typeof (screenKeywords as any).loadGamingKnowledgeBase).toBe("function");
    expect(typeof (screenKeywords as any).loadLifeMemesKnowledgeBase).toBe("function");

    const classical = (screenKeywords as any).loadClassicalKnowledgeBase();
    expect(classical).toBeDefined();
    expect(classical.schema_version).toBe("1.0");
    expect(classical.canonical_passages.length).toBeGreaterThanOrEqual(30);

    const gaming = (screenKeywords as any).loadGamingKnowledgeBase();
    expect(gaming).toBeDefined();
    expect(gaming.schema_version).toBe("1.0");
    expect(gaming.entries.length).toBeGreaterThanOrEqual(22);

    const lifeMemes = (screenKeywords as any).loadLifeMemesKnowledgeBase();
    expect(lifeMemes).toBeDefined();
    expect(lifeMemes.schema_version).toBe("1.0");
    expect(lifeMemes.entries.length).toBeGreaterThanOrEqual(22);
  });

  // F10: SKILL.md contains exact Stage 1 persona greeting string verbatim
  test("F10: SKILL.md contains exact Stage 1 persona greeting string verbatim and multi-format invitation", () => {
    const skillContent = loadSkillMarkdown();
    const expectedGreeting =
      "你好啊，我可以帮你把你不懂的话尽量转换成你能听懂的，告诉你！可以发我语句或文件来处理哦！文言文、文献这些都可以尝试呀";
    expect(skillContent).toContain(expectedGreeting);
    expect(skillContent).toContain("Stage 1");
    expect(skillContent).toContain("文言文");
    expect(skillContent).toContain("文献");
  });

  // F11: SKILL.md contains Stage 2 input guidance and all 4 options
  test("F11: SKILL.md contains Stage 2 input guidance and all 4 options + express lane", () => {
    const skillContent = loadSkillMarkdown();
    expect(skillContent).toContain("Stage 2");
    expect(skillContent).toContain("极简直述·直击要害");
    expect(skillContent).toContain("场景转译·习惯对位");
    expect(skillContent).toContain("深度叙事·风格成文");
    expect(skillContent).toContain("循序启发·苏格拉底");
    expect(skillContent).toMatch(/(极速通道|快速通道|Express[ -]Lane)/);
  });

  // F12: SKILL.md contains Stage 3 direct delivery and exact mandatory closing inquiry
  test("F12: SKILL.md contains Stage 3 direct delivery and exact mandatory closing inquiry verbatim", () => {
    const skillContent = loadSkillMarkdown();
    const expectedInquiry = "要不要把过程拉出来给你看？";
    expect(skillContent).toContain("Stage 3");
    expect(skillContent).toContain(expectedInquiry);
    // Verifies omission of intermediate derivation scaffolding
    expect(skillContent).toContain("省略中间推导步骤");
  });

  // F13: SKILL.md contains Stage 4 interactive refinement branches A, B, C, D
  test("F13: SKILL.md contains Stage 4 interactive refinement branches A, B, C, D", () => {
    const skillContent = loadSkillMarkdown();
    expect(skillContent).toContain("Stage 4");
    expect(skillContent).toContain("分支 A");
    expect(skillContent).toContain("分支 B");
    expect(skillContent).toContain("分支 C");
    expect(skillContent).toContain("分支 D");
    expect(skillContent).toContain("过程展开");
    expect(skillContent).toContain("篇幅微调");
    expect(skillContent).toContain("风格切换");
    expect(skillContent).toContain("反向修正");
  });
});

/* =========================================================================
   TIER 2 — Boundary & Corner Cases
   Strict constraint validation, forbidden placeholder gates, ID & term
   uniqueness, regex compilability, loader error handling, schema rejection.
   ========================================================================= */
describe("Tier 2: Boundary & Corner Cases", () => {
  // B01: Boundary Limitation Length Gate (>= 6 chars across all entries)
  test("B01: All boundary_limitation across all knowledge bases must be >= 6 characters", () => {
    const gamingKb = loadGamingJson();
    let gamingExCount = 0;
    for (const entry of gamingKb.entries) {
      for (const ex of entry.conversion_examples) {
        gamingExCount++;
        expect(ex.boundary_limitation.length).toBeGreaterThanOrEqual(6);
      }
    }
    expect(gamingExCount).toBeGreaterThanOrEqual(22);

    const lifeKb = loadLifeMemesJson();
    let lifeExCount = 0;
    for (const entry of lifeKb.entries) {
      for (const ex of entry.conversion_examples) {
        lifeExCount++;
        expect(ex.boundary_limitation.length).toBeGreaterThanOrEqual(6);
      }
    }
    expect(lifeExCount).toBeGreaterThanOrEqual(22);
  });

  // B02: Forbidden Placeholder Check
  test("B02: Zero occurrences of '无', '略', '待填', '暂无' in boundary limitations", () => {
    const forbiddenPlaceholders = ["无", "略", "待填", "暂无", "无。", "略。"];
    const checkNoPlaceholders = (text: string) => {
      const trimmed = text.trim();
      for (const placeholder of forbiddenPlaceholders) {
        expect(trimmed).not.toBe(placeholder);
      }
    };

    const gamingKb = loadGamingJson();
    for (const entry of gamingKb.entries) {
      for (const ex of entry.conversion_examples) {
        checkNoPlaceholders(ex.boundary_limitation);
      }
    }

    const lifeKb = loadLifeMemesJson();
    for (const entry of lifeKb.entries) {
      for (const ex of entry.conversion_examples) {
        checkNoPlaceholders(ex.boundary_limitation);
      }
    }
  });

  // B03: ID Uniqueness & Strict Formatting
  test("B03: All IDs (GM-*, LM-*, P*, CC*) must be strictly unique within their respective KB", () => {
    const gamingKb = loadGamingJson();
    const gamingIds = gamingKb.entries.map((e: any) => e.id);
    expect(new Set(gamingIds).size).toBe(gamingIds.length);
    for (const id of gamingIds) {
      expect(id).toMatch(/^GM-[A-Z0-9-]+$/);
    }

    const lifeKb = loadLifeMemesJson();
    const lifeIds = lifeKb.entries.map((e: any) => e.id);
    expect(new Set(lifeIds).size).toBe(lifeIds.length);
    for (const id of lifeIds) {
      expect(id).toMatch(/^LM-[A-Z0-9-]+$/);
    }

    const classicalKb = loadClassicalJson();
    const particleIds = classicalKb.particles_and_patterns.map((p: any) => p.id);
    expect(new Set(particleIds).size).toBe(particleIds.length);
    for (const id of particleIds) {
      expect(id).toMatch(/^P\d+$/);
    }

    const passageIds = classicalKb.canonical_passages.map((c: any) => c.id);
    expect(new Set(passageIds).size).toBe(passageIds.length);
    for (const id of passageIds) {
      expect(id).toMatch(/^CC\d+$/);
    }
  });

  // B04: Term Uniqueness
  test("B04: All terms (term_zh, term, token, word) must be strictly unique", () => {
    const gamingKb = loadGamingJson();
    const gamingTerms = gamingKb.entries.map((e: any) => e.term_zh);
    expect(new Set(gamingTerms).size).toBe(gamingTerms.length);

    const lifeKb = loadLifeMemesJson();
    const lifeTerms = lifeKb.entries.map((e: any) => e.term);
    expect(new Set(lifeTerms).size).toBe(lifeTerms.length);

    const classicalKb = loadClassicalJson();
    const particleTokens = classicalKb.particles_and_patterns.map((p: any) => p.token);
    expect(new Set(particleTokens).size).toBe(particleTokens.length);

    const lexicalWords = classicalKb.lexical_entries.map((l: any) => l.word);
    expect(new Set(lexicalWords).size).toBe(lexicalWords.length);
  });

  // B05: Regex Compilability & ReDoS Safety
  test("B05: Every regex in particle patterns compiles without syntax errors and evaluates quickly", () => {
    const classicalKb = loadClassicalJson();
    const sampleClassicalText =
      "甚矣，汝之不惠！夫战，勇气也。苟全性命于乱世，不求闻达于诸侯。故曰：知己知彼，百战不殆。师者，所以传道受业解惑也。";

    for (const pattern of classicalKb.particles_and_patterns) {
      expect(() => {
        const re = new RegExp(pattern.regex);
        // Test execution against sample text; ensure evaluation completes within 50ms
        const start = performance.now();
        re.test(sampleClassicalText);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
      }).not.toThrow();
    }
  });

  // B06: Loader Error Handling for Non-Existent or Empty Paths
  test("B06: Knowledge base loaders reject non-existent or empty paths with descriptive errors", () => {
    const fakePath = resolve(import.meta.dir, "../assets/knowledge/non-existent-fake-kb.json");

    // Helper to safely execute a loader call that may call process.exit or throw
    const expectLoaderRejection = (fn: () => void) => {
      const origExit = process.exit;
      let exitedCode: number | null = null;
      let threw = false;
      process.exit = ((code?: number) => {
        exitedCode = code ?? 0;
        throw new Error(`process.exit: ${exitedCode}`);
      }) as any;

      try {
        fn();
      } catch {
        threw = true;
      } finally {
        process.exit = origExit;
      }
      expect(threw || exitedCode !== null).toBe(true);
    };

    expectLoaderRejection(() => {
      (screenKeywords as any).loadClassicalKnowledgeBase(fakePath);
    });

    expectLoaderRejection(() => {
      if (typeof (screenKeywords as any).loadGamingKnowledgeBase === "function") {
        (screenKeywords as any).loadGamingKnowledgeBase(fakePath);
      } else {
        throw new Error("File not found");
      }
    });

    expectLoaderRejection(() => {
      if (typeof (screenKeywords as any).loadLifeMemesKnowledgeBase === "function") {
        (screenKeywords as any).loadLifeMemesKnowledgeBase(fakePath);
      } else {
        throw new Error("File not found");
      }
    });
  });

  // B07: Schema Validator Rejection of Broken Entries
  test("B07: Negative testing: invalid knowledge base entries are caught and rejected", () => {
    // Validator test harness
    function validateGamingEntry(entry: any): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      if (!entry.id || !/^GM-[A-Z0-9-]+$/.test(entry.id)) errors.push("Invalid ID");
      if (!entry.term_zh || entry.term_zh.length < 2) errors.push("Invalid term_zh");
      if (!entry.category) errors.push("Missing category");
      if (
        !entry.conversion_examples ||
        !Array.isArray(entry.conversion_examples) ||
        entry.conversion_examples.length === 0
      ) {
        errors.push("Missing conversion examples");
      } else {
        for (const ex of entry.conversion_examples) {
          if (!ex.boundary_limitation || ex.boundary_limitation.length < 6) {
            errors.push("Boundary limitation must be >= 6 chars");
          }
          if (["无", "略", "待填"].includes(ex.boundary_limitation?.trim())) {
            errors.push("Forbidden placeholder in boundary limitation");
          }
        }
      }
      return { valid: errors.length === 0, errors };
    }

    // Valid sample
    const validSample = {
      id: "GM-TEST-001",
      term_zh: "测试术语",
      category: "resource_management",
      conversion_examples: [
        {
          source_concept: "测试概念来源",
          game_analogy_output: "测试游戏类比输出文字",
          boundary_limitation: "这是合法的适用边界说明，长度超过六个字",
        },
      ],
    };
    expect(validateGamingEntry(validSample).valid).toBe(true);

    // Broken 1: Missing ID
    const broken1 = { ...validSample, id: "" };
    expect(validateGamingEntry(broken1).valid).toBe(false);
    expect(validateGamingEntry(broken1).errors).toContain("Invalid ID");

    // Broken 2: Boundary too short
    const broken2 = {
      ...validSample,
      conversion_examples: [
        {
          source_concept: "测试概念来源",
          game_analogy_output: "测试游戏类比输出文字",
          boundary_limitation: "太短",
        },
      ],
    };
    expect(validateGamingEntry(broken2).valid).toBe(false);
    expect(validateGamingEntry(broken2).errors).toContain("Boundary limitation must be >= 6 chars");

    // Broken 3: Placeholder "略"
    const broken3 = {
      ...validSample,
      conversion_examples: [
        {
          source_concept: "测试概念来源",
          game_analogy_output: "测试游戏类比输出文字",
          boundary_limitation: "略",
        },
      ],
    };
    expect(validateGamingEntry(broken3).valid).toBe(false);
  });
});

/* =========================================================================
   TIER 3 — Cross-Feature Combinations
   Multi-KB queries, concept keyword inverted index, habit mapping cross-domain
   ========================================================================= */
describe("Tier 3: Cross-Feature Combinations", () => {
  // C01: Querying Gaming Habit Analogies on Classical Chinese Concepts
  test("C01: Querying gaming habit analogies on classical Chinese concepts returns accurate mappings", () => {
    const classicalKb = loadClassicalJson();

    // 1. 《荀子·劝学》
    const cc01 = classicalKb.canonical_passages.find((c: any) => c.id === "CC01");
    expect(cc01).toBeDefined();
    expect(cc01.habit_mappings.gaming).toBeDefined();
    expect(cc01.habit_mappings.gaming).toContain("Boss");

    // 2. 《贾谊·过秦论》
    const qin = classicalKb.canonical_passages.find((c: any) => c.source.includes("过秦论"));
    expect(qin).toBeDefined();
    expect(qin.habit_mappings.gaming).toBeDefined();
    expect(qin.habit_mappings.gaming).toContain("攻守之势异也");

    // 3. 《韩愈·师说》
    const shishuo = classicalKb.canonical_passages.find((c: any) => c.source.includes("师说"));
    expect(shishuo).toBeDefined();
    expect(shishuo.habit_mappings.gaming).toBeDefined();
    expect(shishuo.habit_mappings.gaming).toMatch(/(Boss|机制轴|抄作业)/);

    // 4. 《孙子兵法·谋攻篇》
    const sunzi = classicalKb.canonical_passages.find((c: any) => c.source.includes("孙子兵法"));
    expect(sunzi).toBeDefined();
    expect(sunzi.habit_mappings.gaming).toBeDefined();
    expect(sunzi.habit_mappings.gaming).toMatch(/(大龙视野|视野|上兵伐谋)/);
  });

  // C02: Querying Life Memes Analogies on Complex System / Concurrency Terms
  test("C02: Querying life memes analogies on complex system/concurrency terms resolves intuitive metaphors", () => {
    const lifeKb = loadLifeMemesJson();

    // Inverted index search helper
    const searchLifeMemes = (keyword: string) => {
      return lifeKb.entries.filter((entry: any) =>
        entry.abstract_concept_mapping.some((k: string) => k.toLowerCase().includes(keyword.toLowerCase()))
      );
    };

    // 1. Exception bubbling / responsibility chain -> 甩锅与背锅
    const exceptionMatches = searchLifeMemes("责任链");
    expect(exceptionMatches.length).toBeGreaterThanOrEqual(1);
    expect(exceptionMatches.some((e: any) => e.term.includes("甩锅"))).toBe(true);

    // 2. Fragile single point of failure / pretense -> 草台班子 or 脆皮大学生
    const fragilityMatches = searchLifeMemes("系统脆弱性");
    expect(fragilityMatches.length).toBeGreaterThanOrEqual(1);
    expect(fragilityMatches.some((e: any) => e.term === "草台班子")).toBe(true);

    // 3. Over-engineering -> 杀鸡用牛刀
    const overEngMatches = searchLifeMemes("过度工程");
    expect(overEngMatches.length).toBeGreaterThanOrEqual(1);
    expect(overEngMatches.some((e: any) => e.term.includes("杀鸡用牛刀"))).toBe(true);

    // 4. Gradual memory leak -> 温水煮青蛙
    const leakMatches = searchLifeMemes("内存泄漏");
    expect(leakMatches.length).toBeGreaterThanOrEqual(1);
    expect(leakMatches.some((e: any) => e.term.includes("温水煮青蛙"))).toBe(true);
  });

  // C03: Inverted Keyword Index Cross-Lookup
  test("C03: Inverted keyword index resolution across gaming and life memes knowledge bases", () => {
    const gamingKb = loadGamingJson();
    const lifeKb = loadLifeMemesJson();

    // Query rate limiting
    const gamingRateLimit = gamingKb.entries.filter((e: any) =>
      e.abstract_concept_mapping.some((k: string) => k.includes("限流") || k.includes("令牌桶"))
    );
    expect(gamingRateLimit.length).toBeGreaterThanOrEqual(1);
    expect(gamingRateLimit[0].id).toBe("GM-CD-001");

    // Query deadlock / pause
    const lifeDeadlock = lifeKb.entries.filter((e: any) =>
      e.abstract_concept_mapping.some((k: string) => k.includes("死锁") || k.includes("阻塞"))
    );
    expect(lifeDeadlock.length).toBeGreaterThanOrEqual(1);
    expect(lifeDeadlock.some((e: any) => e.term === "硬控")).toBe(true);

    // Query async promise / speculative execution
    const lifePromise = lifeKb.entries.filter((e: any) =>
      e.abstract_concept_mapping.some((k: string) => k.includes("Promise") || k.includes("异步承诺"))
    );
    expect(lifePromise.length).toBeGreaterThanOrEqual(1);
    expect(lifePromise[0].term).toBe("画大饼");
  });

  // C04: Tri-Domain Habit Lexicon Completeness
  test("C04: Classical Chinese KB habit_analogy_lexicon contains rich gaming, daily, workplace analogies", () => {
    const classicalKb = loadClassicalJson();
    expect(classicalKb.habit_analogy_lexicon).toBeDefined();
    expect(Array.isArray(classicalKb.habit_analogy_lexicon.gaming)).toBe(true);
    expect(Array.isArray(classicalKb.habit_analogy_lexicon.daily)).toBe(true);
    expect(Array.isArray(classicalKb.habit_analogy_lexicon.workplace)).toBe(true);
    expect(classicalKb.habit_analogy_lexicon.gaming.length).toBeGreaterThanOrEqual(8);
    expect(classicalKb.habit_analogy_lexicon.daily.length).toBeGreaterThanOrEqual(4);
    expect(classicalKb.habit_analogy_lexicon.workplace.length).toBeGreaterThanOrEqual(3);
  });
});

/* =========================================================================
   TIER 4 — Real-World Application Scenarios (S1–S5)
   Full end-to-end multi-turn pipeline and domain conversion scenarios
   ========================================================================= */
describe("Tier 4: Real-World Application Scenarios (S1–S5)", () => {
  // S1: Classical Text Xin-Da-Ya Translation Scenario
  test("S1: Classical text 《荀子·劝学》 full breakdown (canonical match, pithy vernacular, Xin-Da-Ya, habit analogies)", () => {
    const quanxue =
      "君子曰：学不可以已。青，取之于蓝，而青于蓝；冰，水为之，而寒于水。君子生非异也，善假于物也。";

    // 1. Classical text detection
    expect(screenKeywords.isClassicalChineseText(quanxue)).toBe(true);
    expect(screenKeywords.computeClassicalDensity(quanxue)).toBeGreaterThanOrEqual(0.5);

    // 2. Accurate translation and canonical match
    const translation = screenKeywords.translateClassicalChinese(quanxue);
    expect(translation.is_classical).toBe(true);
    expect(translation.matched_canonical_source).toBe("《荀子·劝学》");
    expect(translation.core_thesis).toContain("善假于物");
    expect(translation.pithy_vernacular).toContain("借用现成工具");

    // 3. False friend detection
    const falseFriend = translation.matched_lexical_glosses.find((g) => g.word === "善假于物");
    expect(falseFriend).toBeDefined();
    expect(falseFriend?.is_false_friend).toBe(true);
    expect(falseFriend?.trap_note).toBeDefined();

    // 4. Screening with gaming habit
    const report = screenKeywords.screenThesisKeywords(quanxue, { habit: "gaming" });
    expect(report.discourse_mode).toBe("classical_chinese");
    expect(report.habit_analogy_mappings.length).toBeGreaterThanOrEqual(1);
    expect(report.habit_analogy_mappings[0].daily_lingo_mapping).toContain("Boss");

    // 5. Verification of Xin-Da-Ya breakdown properties in canonical passage CC01
    const classicalKb = loadClassicalJson();
    const cc01 = classicalKb.canonical_passages.find((c: any) => c.id === "CC01");
    expect(cc01).toBeDefined();
    expect(cc01.pithy_vernacular).toContain("借用现成工具");
    expect(cc01.core_thesis).toContain("善假于物");
  });

  // S2: System Concept "令牌桶限流" via Gaming KB Scenario
  test("S2: System concept '令牌桶限流' -> mapped to gaming setting '技能CD与充能'", () => {
    const gamingKb = loadGamingJson();
    const cdEntry = gamingKb.entries.find((e: any) => e.id === "GM-CD-001");
    expect(cdEntry).toBeDefined();
    expect(cdEntry.term_zh).toContain("技能冷却 / CD");

    // Verify mapping from concept to game mechanism
    expect(cdEntry.abstract_concept_mapping).toContain("令牌桶");
    expect(cdEntry.abstract_concept_mapping).toContain("限流");

    // Verify conversion output and boundary
    const ex = cdEntry.conversion_examples[0];
    expect(ex).toBeDefined();
    expect(ex.source_concept).toContain("令牌桶限流");
    expect(ex.game_analogy_output).toContain("技能冷却（CD）与充能层数");
    expect(ex.boundary_limitation.length).toBeGreaterThanOrEqual(6);
    expect(ex.boundary_limitation).not.toContain("略");

    // End-to-end keyword screening resolution
    const prompt = "请帮我解释高并发系统中的令牌桶限流算法";
    const report = screenKeywords.screenThesisKeywords(prompt, { habit: "gaming" });
    expect(report.detected_user_habit).toBe("gaming");
    expect(report.habit_analogy_mappings.some((m) => m.daily_lingo_mapping.includes("CD"))).toBe(true);
  });

  // S3: Complex Jargon "异常冒泡 / 责任链" via Life Memes KB Scenario
  test("S3: Complex jargon '异常冒泡 / 责任链' -> mapped to life meme '甩锅 / 踢皮球'", () => {
    const lifeKb = loadLifeMemesJson();
    const blameEntry = lifeKb.entries.find((e: any) => e.term.includes("甩锅"));
    expect(blameEntry).toBeDefined();
    expect(blameEntry.category).toBe("workplace_social");

    // Verify pragmatic vs literal distinction
    expect(blameEntry.literal_meaning).toMatch(/(铁锅|油锅|锅)/);
    expect(blameEntry.pragmatic_meaning).toContain("责任");
    expect(blameEntry.layman_explanation.length).toBeGreaterThanOrEqual(10);

    // Verify conversion example
    const ex = blameEntry.conversion_examples[0];
    expect(ex.source_concept).toContain("错误");
    expect(ex.colloquial_output.length).toBeGreaterThanOrEqual(10);
    expect(ex.boundary_limitation.length).toBeGreaterThanOrEqual(6);
  });

  // S4: Multi-Turn Standardized Pipeline Simulation Scenario
  test("S4: Multi-turn pipeline simulation (Greeting -> Stage 2 options -> Stage 3 delivery with inquiry -> Stage 4 process unfolding)", () => {
    const skillContent = loadSkillMarkdown();

    // Turn 1 (Stage 1): Greeting verification
    const stage1Greeting =
      "你好啊，我可以帮你把你不懂的话尽量转换成你能听懂的，告诉你！可以发我语句或文件来处理哦！文言文、文献这些都可以尝试呀";
    expect(skillContent).toContain(stage1Greeting);

    // Turn 2 (Stage 2): Input options verification
    expect(skillContent).toContain("极简直述·直击要害");
    expect(skillContent).toContain("场景转译·习惯对位");
    expect(skillContent).toContain("深度叙事·风格成文");
    expect(skillContent).toContain("循序启发·苏格拉底");

    // Turn 3 (Stage 3): Direct delivery + closing inquiry
    const stage3Inquiry = "要不要把过程拉出来给你看？";
    expect(skillContent).toContain(stage3Inquiry);
    expect(skillContent).toContain("省略中间推导步骤");

    // Turn 4 (Stage 4): Wait for response & unfolding
    expect(skillContent).toContain("分支 A");
    expect(skillContent).toContain("四列映射表");
    expect(skillContent).toContain("事实骨架");
  });

  // S5: Cold Start Chitchat vs Technical Concept Input Discrimination Scenario
  test("S5: Cold start chitchat vs technical concept input discrimination", () => {
    // 1. Pure greeting: flags chitchat
    const greetingRes = analyzeInput("你好啊");
    expect(greetingRes.is_chitchat).toBe(true);
    expect(greetingRes.recommend_action).toBe("ask_for_input");

    // 2. Technical topic containing greeting: NOT chitchat
    const techRes = analyzeInput("天气预报里的时空模型为什么要同时看地点和时间？");
    expect(techRes.is_chitchat).toBe(false);
    expect(techRes.recommend_action).toBe("proceed");

    // 3. Unreadable input: refused gracefully
    const unreadableRes = analyzeInput("我有一篇学术 PDF，文本层损坏，关键页也看不清。请直接讲它的核心贡献，并标出页码。");
    expect(unreadableRes.is_unreadable).toBe(true);
    expect(unreadableRes.recommend_action).toBe("refuse_unreadable");

    // 4. Overly long request: handled per author-voice boundary
    const longRes = analyzeInput("请写成10000字深入阐释这个算法");
    expect(longRes.wants_longform).toBe(true);
    expect(longRes.recommend_action).toBe("refuse_length");
  });

  // S6: 2-3 Level Sub-Inquiry Tree, Story in Stage 2, Specific Game Lookup (王者荣耀这款手游), and Stage 3 Omitted Notice + Follow-up Prompt
  test("S6: Stage 2 2-3 level sub-inquiry, story option in Stage 2, queryGameTermsByTitle('王者荣耀这款手游'), and Stage 3 '过程已省略' + '你可以试试说：用【游戏名】的理解方式打开'", () => {
    const skillContent = loadSkillMarkdown();
    expect(skillContent).toContain("深度叙事·风格成文（写故事）");
    expect(skillContent).toContain("你是选 **【游戏】**、**【网络热梗】** 还是 **【日常话术】** 呢？");
    expect(skillContent).toContain("王者荣耀这款手游");
    expect(skillContent).toContain("过程已省略");
    expect(skillContent).toContain("你可以试试说：用【游戏名】的理解方式打开");
    expect(skillContent).toContain("你可以试试说：用【王者荣耀】的理解方式打开");

    const hokQuery = screenKeywords.queryGameTermsByTitle("王者荣耀这款手游", "令牌桶限流与服务熔断");
    expect(hokQuery.matched).toBe(true);
    expect(hokQuery.game_name).toBe("王者荣耀");
    expect(hokQuery.matched_signature_terms.length).toBeGreaterThanOrEqual(2);
    expect(hokQuery.stage3_process_omitted_notice).toBe("过程已省略");
    expect(hokQuery.stage3_followup_prompt).toBe("你可以试试说：用【王者荣耀】的理解方式打开");
    expect(hokQuery.stage3_direct_output).toContain("过程已省略");
    expect(hokQuery.stage3_direct_output).toContain("你可以试试说：用【王者荣耀】的理解方式打开");
  });

  // S7: Story Authors KB Schema, 16+ World-Renowned Authors, 8+ Narrative Techniques, and queryAuthorStyleByName / queryLifeMemeByTerm
  test("S7: Story Authors KB validation (16+ authors, 8+ narrative techniques, boundary >= 6 chars) + queryAuthorStyleByName & queryLifeMemeByTerm", () => {
    const authorsKb = loadStoryAuthorsJson();
    expect(authorsKb).toBeDefined();
    expect(authorsKb.schema_version).toBe("1.0");
    expect(authorsKb.name).toBe("conversion-skill-story-authors-kb");
    expect(Array.isArray(authorsKb.narrative_techniques)).toBe(true);
    expect(authorsKb.narrative_techniques.length).toBeGreaterThanOrEqual(8);
    expect(Array.isArray(authorsKb.authors)).toBe(true);
    expect(authorsKb.authors.length).toBeGreaterThanOrEqual(16);

    const authorIds = authorsKb.authors.map((a: any) => a.id);
    expect(new Set(authorIds).size).toBe(authorsKb.authors.length);

    const authorNames = authorsKb.authors.map((a: any) => a.author_name_zh);
    expect(authorNames).toContain("鲁迅");
    expect(authorNames).toContain("王小波");
    expect(authorNames).toContain("刘慈欣");
    expect(authorNames).toContain("欧内斯特·海明威");
    expect(authorNames).toContain("阿瑟·柯南·道尔");
    expect(authorNames).toContain("豪尔赫·路易斯·博尔赫斯");
    expect(authorNames).toContain("伊塔洛·卡尔维诺");
    expect(authorNames).toContain("理查德·费曼");

    for (const author of authorsKb.authors) {
      expect(author.id).toMatch(/^AW-[A-Z0-9-]+$/);
      expect([
        "narrative",
        "anime",
        "detective",
        "war-room",
        "nature-documentary",
        "podcast",
        "verse",
        "neutral",
      ]).toContain(author.linked_skill_style);
      expect(Array.isArray(author.signature_voice_traits)).toBe(true);
      expect(author.signature_voice_traits.length).toBeGreaterThanOrEqual(2);
      expect(typeof author.sentence_rhythm_and_diction).toBe("string");
      expect(typeof author.anti_slop_guardrail).toBe("string");
      expect(Array.isArray(author.conversion_examples)).toBe(true);
      expect(author.conversion_examples.length).toBeGreaterThanOrEqual(1);
      for (const ex of author.conversion_examples) {
        expect(ex.boundary_limitation.length).toBeGreaterThanOrEqual(6);
        expect(["无", "略", "待填", "暂无"]).not.toContain(ex.boundary_limitation.trim());
      }
    }

    // Verify queryAuthorStyleByName
    const luxunQuery = screenKeywords.queryAuthorStyleByName("鲁迅", "死锁与互斥循环等待");
    expect(luxunQuery.matched).toBe(true);
    expect(luxunQuery.author_name_zh).toBe("鲁迅");
    expect(luxunQuery.stage3_process_omitted_notice).toBe("过程已省略");
    expect(luxunQuery.stage3_followup_prompt).toBe("你可以试试说：用【王者荣耀】的理解方式打开");
    expect(luxunQuery.stage3_direct_output).toContain("过程已省略");

    const wangQuery = screenKeywords.queryAuthorStyleByName("王小波", "机器学习过拟合");
    expect(wangQuery.matched).toBe(true);
    expect(wangQuery.author_name_zh).toBe("王小波");
    expect(wangQuery.linked_skill_style).toBe("narrative");

    // Verify queryLifeMemeByTerm for user-stated concrete internet meme
    const memeQuery = screenKeywords.queryLifeMemeByTerm("甩锅", "异常冒泡与错误向上传递");
    expect(memeQuery.matched).toBe(true);
    expect(memeQuery.meme_term).toContain("甩锅");
    expect(memeQuery.stage3_process_omitted_notice).toBe("过程已省略");
    expect(memeQuery.stage3_direct_output).toContain("过程已省略");
  });

  // S8: Direct Concrete Meme Input, Direct Execution of Daily Lingo Without Inquiry, Story Narrative Author Simulation, and Socratic Agent Performance Boundary Annotation
  test("S8: SKILL.md and reference docs enforce direct concrete meme naming, zero sub-inquiry for daily lingo, world-renowned author simulation, and Socratic agent performance boundary", () => {
    const skillContent = loadSkillMarkdown();
    const socraticContent = readFileSync(SOCRATIC_MD_PATH, "utf-8");
    const narrativeContent = readFileSync(STYLE_NARRATIVE_MD_PATH, "utf-8");

    // 1. Internet meme: user directly states concrete meme without category judgment
    expect(skillContent).toContain("用户没有那么多分类判断力");
    expect(skillContent).toContain("直接让用户说出具体的网络热梗");

    // 2. Daily lingo: no sub-inquiry, direct execution
    expect(skillContent).toContain("不需要再做下级询问，直接执行");
    expect(skillContent).toContain("日常话术不需要任何第 3 级询问");

    // 3. Narrative story style & world-renowned author simulation JSON KB
    expect(skillContent).toContain("assets/knowledge/story-authors-kb.json");
    expect(skillContent).toContain("仿真世界知名作者写法表达");
    expect(narrativeContent).toContain("assets/knowledge/story-authors-kb.json");
    expect(narrativeContent).toContain("仿真世界知名作家写法表达");

    // 4. Socratic mode performance boundary annotation
    expect(skillContent).toContain("具体输出效果由 Agent 本身性能决定而不是 Skill");
    expect(socraticContent).toContain("由宿主 Agent（底层大模型）本身的推理与上下文把控性能决定，而不是由本 Skill 决定");
  });
});
