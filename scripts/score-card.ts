/**
 * One-page score card for a converted draft.
 *
 * The long check-output report stays the default. This view is only built
 * when the caller asks for it. The number is a delivery score (higher is
 * cleaner), assembled from the gates that already exist: structure, retelling,
 * grammar, AI-tone labels, narrative boundary, and beginner load.
 */

import type { TextRecognitionJudgment } from "./hanlp-helper";

export const SCORE_GRADES = ["可直接交稿", "小改后可交", "需要改写", "重写"] as const;
export type ScoreGrade = (typeof SCORE_GRADES)[number];

export interface ScoreCardHit {
  line: number;
  dimension: string;
  excerpt: string;
  fix: string;
  weight: number;
}

export interface ScoreCardSubScores {
  gate: number;
  retell: number;
  grammar: number;
  tone: number;
  boundary: number;
  beginner: number;
}

export interface ScoreCard {
  score: number;
  grade: ScoreGrade;
  verdict: "PASS" | "FAIL";
  labels: string[];
  sub_scores: ScoreCardSubScores;
  hit_count: number;
  hits: ScoreCardHit[];
  summary: string;
}

export interface ScoreCardSource {
  verdict: "PASS" | "FAIL";
  structure_verdict: "PASS" | "FAIL";
  term_id_coverage_verdict: "PASS" | "FAIL";
  has_mapping_table: boolean;
  mapping_error?: string;
  has_verify: boolean;
  level_ok: boolean;
  level_msg: string;
  voice_leaks: string[];
  missing: string[];
  expression_baseline_report?: { baseline_verdict: "PASS" | "FAIL"; violations: string[] };
  chunk_reports?: Array<{ chunk_index: number; heading: string; verdict: "PASS" | "FAIL"; violations: string[] }>;
  text_recognition_judgment?: TextRecognitionJudgment;
}

const HIT_LIMIT = 12;

const WEIGHTS = {
  gate: 0.22,
  retell: 0.22,
  grammar: 0.18,
  tone: 0.16,
  boundary: 0.12,
  beginner: 0.1,
} as const;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function gradeForScore(score: number): ScoreGrade {
  if (score >= 85) return "可直接交稿";
  if (score >= 70) return "小改后可交";
  if (score >= 50) return "需要改写";
  return "重写";
}

function locateLine(markdown: string, snippet: string): number {
  const needle = snippet.trim();
  if (!needle) return 1;
  const probes = [needle, needle.slice(0, 24), needle.slice(0, 8)].filter((item) => item.length >= 2);
  for (const probe of probes) {
    const index = markdown.indexOf(probe);
    if (index >= 0) return markdown.slice(0, index).split(/\n/u).length;
  }
  return 1;
}

function clip(text: string, max = 42): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max)}…`;
}

function pushHit(hits: ScoreCardHit[], seen: Set<string>, hit: ScoreCardHit): void {
  const key = `${hit.dimension}|${hit.line}|${hit.excerpt}`;
  if (seen.has(key)) return;
  seen.add(key);
  hits.push(hit);
}

function gateScore(source: ScoreCardSource): number {
  let score = source.structure_verdict === "PASS" && source.term_id_coverage_verdict === "PASS" ? 100 : source.structure_verdict === "PASS" ? 68 : 32;
  if (!source.has_verify) score -= 12;
  if (!source.level_ok) score -= 14;
  if (source.voice_leaks.length > 0) score -= 18;
  if (source.expression_baseline_report?.baseline_verdict === "FAIL") score -= 10;
  return clampScore(score);
}

function toneScore(judgment: TextRecognitionJudgment | undefined): number {
  if (!judgment) return 80;
  let score = 100;
  if (judgment.overall_ai_produced) score -= 34;
  score -= judgment.micro_sentence_cracker.matched_count * 8;
  score -= judgment.micro_sentence_cracker.rhetorical_qna_shells.length * 12;
  score -= Math.min(24, judgment.micro_sentence_cracker.negative_parallelism_matches.length * 8);
  score -= judgment.micro_sentence_cracker.hollow_epigrams.length * 10;
  if (judgment.readme_expression_review.is_ai_produced) score -= 16;
  if (judgment.analogy_authenticity_review.is_ai_produced) score -= 18;
  return clampScore(score);
}

function boundaryScore(judgment: TextRecognitionJudgment | undefined): number {
  if (!judgment) return 80;
  const review = judgment.narrative_boundary_review;
  if (review.within_boundary) return clampScore(review.conciseness_score);
  return clampScore(Math.min(review.conciseness_score, 42));
}

function beginnerScore(judgment: TextRecognitionJudgment | undefined): number {
  if (!judgment) return 80;
  return clampScore(judgment.beginner_friendliness.beginner_score);
}

function collectHits(markdown: string, source: ScoreCardSource): ScoreCardHit[] {
  const hits: ScoreCardHit[] = [];
  const seen = new Set<string>();
  const judgment = source.text_recognition_judgment;

  if (!source.has_mapping_table) {
    pushHit(hits, seen, {
      line: locateLine(markdown, "## 正文") || 1,
      dimension: "结构",
      excerpt: clip(source.mapping_error ?? "缺映射表"),
      fix: "补一张四列表：知识概念 | 类比元素 | 对应机制 | 适用边界。至少 3 行，适用边界写清比喻在哪里失效，不要填「无」。",
      weight: 5,
    });
  } else if (source.structure_verdict === "FAIL" && source.mapping_error) {
    pushHit(hits, seen, {
      line: locateLine(markdown, "| 知识概念"),
      dimension: "结构",
      excerpt: clip(source.mapping_error),
      fix: "把空单元格补上。适用边界写这句话在什么情况下不能再拿去类比，至少 6 个字。",
      weight: 5,
    });
  }
  if (!source.has_verify) {
    pushHit(hits, seen, {
      line: markdown.split(/\n/u).length,
      dimension: "结构",
      excerpt: "没有知识点校验",
      fix: "文末加一节「知识点校验」，用一两句把触发、动作、限制和结果再说一遍，超过 12 个字。",
      weight: 5,
    });
  }
  if (!source.level_ok) {
    pushHit(hits, seen, {
      line: 1,
      dimension: "篇幅",
      excerpt: clip(source.level_msg),
      fix: "把正文收到这一档的字数里，或改用匹配的 --level 再验一次。",
      weight: 4,
    });
  }
  for (const leak of source.voice_leaks) {
    pushHit(hits, seen, {
      line: locateLine(markdown, leak),
      dimension: "情况句",
      excerpt: leak,
      fix: `删掉「${leak}」。这句是跟编辑报状态用的，不能留在给读者的正文里。`,
      weight: 5,
    });
  }
  for (const missing of source.missing.slice(0, 3)) {
    pushHit(hits, seen, {
      line: 1,
      dimension: "覆盖",
      excerpt: clip(missing),
      fix: `正文和映射表的对应机制列都要出现「${missing}」，用同一种说法，不要只在标题里点一下。`,
      weight: 4,
    });
  }

  if (judgment) {
    for (const issue of judgment.grammar_inspection.issues.slice(0, 6)) {
      pushHit(hits, seen, {
        line: locateLine(markdown, issue.sentence),
        dimension: "语法",
        excerpt: clip(issue.sentence),
        fix: issue.suggestion,
        weight: 4,
      });
    }
    for (const match of judgment.micro_sentence_cracker.matched_sentences.slice(0, 4)) {
      const imperative = match.pattern_type === "xian_bie_imperative";
      pushHit(hits, seen, {
        line: locateLine(markdown, match.text),
        dimension: "腔调",
        excerpt: match.text,
        fix: imperative
          ? `删掉「${match.text}」，把后面那句直接写成正在发生的动作。`
          : `「${match.text}」不要单独成句。并进旁边那句，写成一个完整的动作。`,
        weight: imperative ? 4 : 3,
      });
    }
    for (const shell of judgment.micro_sentence_cracker.rhetorical_qna_shells.slice(0, 2)) {
      pushHit(hits, seen, {
        line: locateLine(markdown, shell),
        dimension: "腔调",
        excerpt: clip(shell),
        fix: "删掉设问和自答的过门，把答案那一句留下，直接往下说。",
        weight: 4,
      });
    }
    for (const row of judgment.micro_sentence_cracker.negative_parallelism_matches.slice(0, 2)) {
      pushHit(hits, seen, {
        line: locateLine(markdown, row),
        dimension: "腔调",
        excerpt: clip(row),
        fix: "拆成两句，只留读者需要的那一半，不要用「不是…而是…」对着说。",
        weight: 3,
      });
    }
    for (const line of judgment.micro_sentence_cracker.hollow_epigrams.slice(0, 2)) {
      pushHit(hits, seen, {
        line: locateLine(markdown, line),
        dimension: "腔调",
        excerpt: clip(line),
        fix: "删掉这句拔高，停在上一句那个具体结果上。",
        weight: 3,
      });
    }
    for (const term of judgment.analogy_authenticity_review.sticker_label_terms.slice(0, 3)) {
      pushHit(hits, seen, {
        line: locateLine(markdown, term),
        dimension: "类比",
        excerpt: term,
        fix: `不要把「${term}」写成假人名。先写读者看得到的动作，概念名字放在动作后面。`,
        weight: 4,
      });
    }
    for (const row of judgment.analogy_authenticity_review.non_isomorphic_rows.slice(0, 2)) {
      pushHit(hits, seen, {
        line: locateLine(markdown, row.slice(0, 12)),
        dimension: "类比",
        excerpt: clip(row),
        fix: "这一行只是名词画等号。改成「什么情况下、做了什么、被什么卡住、得到什么」。",
        weight: 4,
      });
    }
    if (!judgment.narrative_boundary_review.within_boundary) {
      const sample = judgment.narrative_boundary_review.story_bloat_matches[0] ?? judgment.narrative_boundary_review.reasons[0] ?? "长篇剧情注水";
      pushHit(hits, seen, {
        line: locateLine(markdown, sample),
        dimension: "边界",
        excerpt: clip(sample),
        fix: "删掉不推动机制的情节。对照留 1 到 2 句日常或游戏里的动作就够。",
        weight: 4,
      });
    }
    const retell = judgment.layperson_retelling_anchor;
    if (retell.retellability_score < 60) {
      pushHit(hits, seen, {
        line: retell.best_anchor_sentence ? locateLine(markdown, retell.best_anchor_sentence) : 1,
        dimension: "复述",
        excerpt: retell.best_anchor_sentence ? clip(retell.best_anchor_sentence) : "没有能单独拿走的一句",
        fix: "补一句能单独转述的话，按「遇到什么麻烦，做了什么，结果怎样」说完，不要夹未解释的缩写。",
        weight: 3,
      });
    }
    const beginner = judgment.beginner_friendliness;
    for (const phrase of beginner.condescending_phrases.slice(0, 2)) {
      pushHit(hits, seen, {
        line: locateLine(markdown, phrase),
        dimension: "小白",
        excerpt: phrase,
        fix: `删掉「${phrase}」。直接写读者会踩坑的那一步。`,
        weight: 3,
      });
    }
    if (!beginner.opening_jargon_free) {
      pushHit(hits, seen, {
        line: 1,
        dimension: "小白",
        excerpt: "开头先出现了没解释的词",
        fix: "前 45 个字先写一件生活里吃过的亏，再出现术语。",
        weight: 3,
      });
    }
    if (!beginner.working_memory_load_ok) {
      pushHit(hits, seen, {
        line: 1,
        dimension: "小白",
        excerpt: `小句均长 ${beginner.avg_clause_chars} 字`,
        fix: "把小句拆到大约 20 字。一句只留一个动作。",
        weight: 2,
      });
    }
  }

  for (const violation of source.expression_baseline_report?.violations.slice(0, 3) ?? []) {
    pushHit(hits, seen, {
      line: 1,
      dimension: "基线",
      excerpt: clip(violation),
      fix: "按这条例外把对应段落补满：一段至少两句，先写动作再点术语。",
      weight: 3,
    });
  }
  for (const chunk of source.chunk_reports?.filter((item) => item.verdict === "FAIL").slice(0, 2) ?? []) {
    pushHit(hits, seen, {
      line: locateLine(markdown, chunk.heading),
      dimension: "分块",
      excerpt: clip(`${chunk.heading}：${chunk.violations[0] ?? "未过门禁"}`),
      fix: `只改第 ${chunk.chunk_index} 节「${chunk.heading}」，让这一节单独过门禁后再写下一节。`,
      weight: 4,
    });
  }

  hits.sort((a, b) => b.weight - a.weight || a.line - b.line);
  return hits;
}

export function buildScoreCard(markdown: string, source: ScoreCardSource): ScoreCard {
  const judgment = source.text_recognition_judgment;
  const sub_scores: ScoreCardSubScores = {
    gate: gateScore(source),
    retell: clampScore(judgment?.layperson_retelling_anchor.retellability_score ?? 0),
    grammar: clampScore(100 - (judgment?.grammar_inspection.issue_count ?? 0) * 22),
    tone: toneScore(judgment),
    boundary: boundaryScore(judgment),
    beginner: beginnerScore(judgment),
  };
  let score = clampScore(
    sub_scores.gate * WEIGHTS.gate
      + sub_scores.retell * WEIGHTS.retell
      + sub_scores.grammar * WEIGHTS.grammar
      + sub_scores.tone * WEIGHTS.tone
      + sub_scores.boundary * WEIGHTS.boundary
      + sub_scores.beginner * WEIGHTS.beginner,
  );
  // The weighted average can stay high when the prose is fine and only the
  // skeleton is missing. A structure failure is not "small edits"; any
  // mechanical FAIL is not "ready to hand over".
  if (source.structure_verdict === "FAIL") score = Math.min(score, 69);
  else if (source.verdict === "FAIL") score = Math.min(score, 84);
  const allHits = collectHits(markdown, source);
  const hits = allHits.slice(0, HIT_LIMIT);
  const grade = gradeForScore(score);
  const labels = judgment?.labels.length ? judgment.labels : ["正常"];
  const summary = hits.length === 0
    ? `总分 ${score}/100，${grade}。按现有门禁没有要改的命中。`
    : `总分 ${score}/100，${grade}。先改第 ${hits[0]?.line ?? 1} 行的${hits[0]?.dimension ?? "问题"}。`;
  return {
    score,
    grade,
    verdict: source.verdict,
    labels,
    sub_scores,
    hit_count: allHits.length,
    hits,
    summary,
  };
}

export function renderScoreCard(card: ScoreCard): string {
  const sub = card.sub_scores;
  const lines = [
    "一页成绩单",
    `总分 ${card.score}/100  档位 ${card.grade}  机械门禁 ${card.verdict}`,
    `标签 ${card.labels.join("、")}`,
    `分项  门禁 ${sub.gate}  复述 ${sub.retell}  语法 ${sub.grammar}  腔调 ${sub.tone}  边界 ${sub.boundary}  小白 ${sub.beginner}`,
    "",
  ];
  if (card.hit_count === 0) {
    lines.push("没有需要改的命中。这份稿按现有门禁可以直接往下用。");
  } else {
    lines.push(`命中 ${card.hit_count} 处${card.hit_count > card.hits.length ? `，下面列出 ${card.hits.length} 处` : ""}`);
    card.hits.forEach((hit, index) => {
      lines.push(`${index + 1}. 第 ${hit.line} 行  [${hit.dimension}] ${hit.excerpt}`);
      lines.push(`   改法：${hit.fix}`);
    });
  }
  lines.push("");
  lines.push(card.summary);
  return lines.join("\n");
}

export function renderScoreCardLine(card: ScoreCard): string {
  return `成绩单 score=${card.score} grade=${card.grade} hits=${card.hit_count} verdict=${card.verdict}`;
}
