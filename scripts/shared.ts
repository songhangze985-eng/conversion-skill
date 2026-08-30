/** Shared, dependency-free helpers for the Bun command-line tools. */

import { isAbsolute, relative } from "node:path";

export const EXPRESSION_STYLES = [
  "anime",
  "detective",
  "war-room",
  "nature-documentary",
  "neutral",
] as const;

export type ExpressionStyle = (typeof EXPRESSION_STYLES)[number];

export const LEVELS = ["default", "expand", "long"] as const;
export type OutputLevel = (typeof LEVELS)[number];

export const LEVEL_LIMITS: Record<OutputLevel, readonly [number, number | null]> = {
  default: [0, 800],
  expand: [800, 2500],
  long: [0, null],
};

export function isExpressionStyle(value: string): value is ExpressionStyle {
  return (EXPRESSION_STYLES as readonly string[]).includes(value);
}

export function isOutputLevel(value: string): value is OutputLevel {
  return (LEVELS as readonly string[]).includes(value);
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function readStdIn(): Promise<string> {
  return new Response(Bun.stdin.stream()).text();
}

export function markdownWordCount(markdown: string): number {
  const text = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^---+\s*$/gm, "");
  const han = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0;
  return han + latin;
}

export function normalizedContains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

export function relativeIsInside(parent: string, child: string): boolean {
  const pathDelta = relative(parent, child);
  return pathDelta === "" || (!pathDelta.startsWith("..") && !isAbsolute(pathDelta));
}

export function usageError(message: string): never {
  process.stderr.write(`错误：${message}\n`);
  process.exit(2);
}
