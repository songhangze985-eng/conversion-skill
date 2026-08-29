# -*- coding: utf-8 -*-
"""
输出校验：验映射表、知识点校验、默认篇幅、情况句泄漏、概念覆盖。
风格关键词（咖啡馆/酱/然而）不再决定 PASS。

用法:
    python check_output.py result.md
    python check_output.py result.md --level default
    python check_output.py result.md --json
"""

import argparse
import json
import re
import sys

VERIFY_TITLE = re.compile(r"知识点校验")
MAP_HEADER = re.compile(r"知识概念|专业概念")
STORY_HEADER = re.compile(r"(文章正文|^#+\s*正文|###\s*4[.\s]*转换)")
LEVELS = {
    "default": (0, 800),
    "expand": (800, 2500),
    "long": (0, None),
}
# 只允许出现在对使用者的情况行，禁止进正文和校验。原句见 references/author-voice.md
VOICE_LEAKS = (
    "卡文了，稍等",
    "封禁中",
    "没有稿费我可不写",
    "这么多！是让我写水文吗",
    "水文ing，有事请拨打10086",
)


def read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        sys.stderr.write(f"错误: 文件不存在: {path}\n")
        sys.exit(2)
    except UnicodeDecodeError:
        with open(path, "r", encoding="gbk", errors="ignore") as f:
            return f.read()


def strip_markup(md: str) -> str:
    text = re.sub(r"<[^>]+>", "", md)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^---+\s*$", "", text, flags=re.MULTILINE)
    return text


def count_words(md: str) -> int:
    text = strip_markup(md)
    return len(re.findall(r"[\u4e00-\u9fff]", text)) + len(re.findall(r"[a-zA-Z]+", text))


def has_mapping_table(md: str) -> bool:
    if not MAP_HEADER.search(md):
        return False
    return bool(re.search(r"\|.+\|.+\|", md))


def verify_section_ok(md: str) -> bool:
    m = re.search(r"#{1,6}\s*.*知识点校验\s*\n+(.*?)(?=\n#{1,6}\s|\Z)", md, re.DOTALL)
    if not m:
        return "知识点校验" in md and len(md.split("知识点校验", 1)[-1].strip()) > 8
    return len(m.group(1).strip()) > 8


def extract_keywords(md: str):
    hints = {"关键概念", "变量", "约束", "关系", "核心"}
    keywords = []
    m = re.search(r"#{1,6}\s*.*提炼(.*?)(?=#{1,6}\s*.*(?:意象映射|映射))", md, re.DOTALL)
    if not m:
        return keywords
    for line in m.group(1).splitlines():
        stripped = line.strip().lstrip("-").strip()
        if not stripped:
            continue
        kw = re.split(r"[:：]", stripped, maxsplit=1)[0].strip()
        kw = re.sub(r"[`$]", "", kw)
        if len(kw) < 2 or any(kw.startswith(h) for h in hints):
            continue
        keywords.append(kw)
    return keywords


def story_body(md: str) -> str:
    m = re.search(
        r"(?:#{1,6}\s*(?:✨\s*)?(?:文章)?正文|###\s*4[.\s]*转换)(.*?)(?=#{1,6}\s*.*知识点校验|\Z)",
        md,
        re.DOTALL,
    )
    return m.group(1) if m else md


def verify_text(md: str) -> str:
    m = re.search(r"#{1,6}\s*.*知识点校验\s*\n+(.*?)(?=\n#{1,6}\s|\Z)", md, re.DOTALL)
    if m:
        return m.group(1)
    if "知识点校验" in md:
        return md.split("知识点校验", 1)[-1]
    return ""


def voice_leaks_in(md: str) -> list:
    hay = story_body(md) + "\n" + verify_text(md)
    return [p for p in VOICE_LEAKS if p in hay]


def coverage(md: str):
    kws = extract_keywords(md)
    body = story_body(md)
    covered, missing = [], []
    for kw in kws:
        token = re.split(r"[\s（(]", kw, maxsplit=1)[0]
        if token and token in body:
            covered.append(kw)
        else:
            missing.append(kw)
    return covered, missing


def analyze(md: str, level: str):
    mapping = has_mapping_table(md)
    verify = verify_section_ok(md)
    wc = count_words(story_body(md))
    lo, hi = LEVELS[level]
    if hi is None:
        level_ok, level_msg = True, f"长篇不设上限，正文约 {wc} 字"
    elif level == "expand":
        level_ok = lo <= wc <= hi
        level_msg = f"展开期望 {lo}-{hi}，实际 {wc}"
    else:
        level_ok = wc <= hi
        level_msg = f"默认期望 ≤{hi}，实际 {wc}"
    covered, missing = coverage(md)
    cover_ok = True
    leaks = voice_leaks_in(md)
    leak_ok = not leaks
    verdict = "PASS" if mapping and verify and level_ok and leak_ok else "FAIL"
    return {
        "has_mapping_table": mapping,
        "has_verify": verify,
        "word_count": wc,
        "level": level,
        "level_ok": level_ok,
        "level_msg": level_msg,
        "voice_leaks": leaks,
        "leak_ok": leak_ok,
        "covered": covered,
        "missing": missing,
        "cover_ok": cover_ok,
        "verdict": verdict,
    }


def render(result: dict) -> str:
    lines = [
        "转换结果校验",
        f"  映射表: {'OK' if result['has_mapping_table'] else 'MISSING'}",
        f"  知识点校验: {'OK' if result['has_verify'] else 'MISSING'}",
        f"  篇幅: {result['level_msg']} ({'OK' if result['level_ok'] else 'FAIL'})",
        f"  情况句泄漏: {'OK' if result['leak_ok'] else 'LEAK ' + str(result['voice_leaks'])}",
        f"  概念覆盖: {len(result['covered'])}/{len(result['covered'])+len(result['missing'])}",
    ]
    if result["missing"]:
        lines.append(f"  未覆盖(参考): {result['missing']}")
    lines.append(f"结论: {result['verdict']}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="校验转换结果：映射表、校验段、篇幅、情况句泄漏、覆盖。")
    parser.add_argument("file", nargs="?", help="markdown 路径")
    parser.add_argument("-f", "--file", dest="file_opt")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--level",
        choices=["default", "expand", "long"],
        default="default",
        help="default≤800 / expand 800-2500 / long 不限",
    )
    args = parser.parse_args(argv)
    path = args.file or args.file_opt
    if not path:
        parser.error("请提供 markdown 路径")
    result = analyze(read_file(path), args.level)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(render(result))
    return 0 if result["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
