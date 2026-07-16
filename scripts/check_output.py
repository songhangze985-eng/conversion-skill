# -*- coding: utf-8 -*-
"""
输出校验脚本 (check_output.py)

用途:
    为"转换skill"(把晦涩专业知识转为二次元故事风格)做输出结果校验。
    读取一个 markdown 转换结果文件,检查:
      - 四步标题是否齐全(理解/提炼/抽取/转换)
      - 是否存在"知识点校验"小节
      - 粗略统计风格要素满足数(角色化/场景化/对话化/拟人化/伏笔反转),≥3 视为达标
    输出人类可读的校验报告,并给出 PASS/FAIL 结论。

用法:
    python check_output.py result.md
    python check_output.py --file result.md
    python check_output.py --help

仅依赖 Python 标准库 (json, argparse, sys, re)。
Windows 兼容。
"""

import argparse
import json
import re
import sys


# 四步关键词(标题中出现任一即认为该步存在)
STEP_KEYWORDS = {
    "理解": ["理解"],
    "提炼": ["提炼"],
    "抽取": ["抽取"],
    "转换": ["转换"],
}

# 知识点校验关键词
VERIFY_KEYWORDS = ["知识点校验", "校验"]

# 场景化关键词
SCENE_KEYWORDS = [
    "咖啡馆", "咖啡店", "茶馆", "茶室",
    "校园", "教室", "课堂", "学校", "学园",
    "异世界", "异界", "幻想乡",
    "实验室", "研究所", "工坊",
    "雨夜", "雪夜", "月夜", "星空", "黄昏",
    "街头", "巷口", "天台", "屋顶",
    "列车", "电车", "船", "飞船",
    "城堡", "王宫", "神社", "庙宇",
]

# 角色化迹象:对话引号 或 名字+后缀(酱/同学/小姐/先生)
ROLE_REGEX = re.compile(
    r"[「」『』]|"
    r"\w+(?:同学|小姐|先生|酱|ちゃん|さん|くん|老师|殿下|大人)"
)

# 对话化:含「」或中文双引号“”引号对话
# 用 Unicode 转义表示中文双引号,避免与 Python 字符串定界符冲突
DIALOGUE_REGEX = re.compile("[「」『』]|\u201c[^\u201d]+?\u201d")

# 拟人化:她/他/它 指代概念(简化:只要出现这些代词即算)
PERSONIFICATION_REGEX = re.compile(r"她|他(?!们)|它(?!们)")

# 伏笔反转:含转折/揭示词
TWIST_REGEX = re.compile(r"然而|突然|原来|其实|不料|谁知|偏偏|竟[然]?")


def read_file(path: str) -> str:
    """读取文件内容。"""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def find_headers(md: str):
    """
    提取所有 markdown 标题行。
    返回 [(level, title), ...],level 为 # 的数量。
    """
    headers = []
    for line in md.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*?)\s*$", line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            headers.append((level, title))
    return headers


def check_steps(headers):
    """检查四步标题是否齐全。"""
    all_titles = " ".join(t for _, t in headers)
    present = {}
    for step, kws in STEP_KEYWORDS.items():
        present[step] = any(kw in all_titles for kw in kws)
    return present


def check_verify_section(headers, md: str):
    """检查是否存在知识点校验小节。"""
    for level, title in headers:
        for kw in VERIFY_KEYWORDS:
            if kw in title:
                return True
    # 也扫描正文(以防无标题但有小节内容)
    for kw in VERIFY_KEYWORDS:
        if kw in md:
            return True
    return False


def check_style_elements(md: str):
    """
    检查风格要素满足数。
    返回 {要素: bool} 与满足数。
    """
    elements = {
        "角色化": bool(ROLE_REGEX.search(md)),
        "场景化": any(kw in md for kw in SCENE_KEYWORDS),
        "对话化": bool(DIALOGUE_REGEX.search(md)),
        "拟人化": bool(PERSONIFICATION_REGEX.search(md)),
        "伏笔反转": bool(TWIST_REGEX.search(md)),
    }
    count = sum(1 for v in elements.values() if v)
    return elements, count


def render_report(steps_present, has_verify, style_elements, style_count):
    """渲染人类可读的校验报告。"""
    lines = []
    lines.append("=" * 50)
    lines.append("转换结果校验报告")
    lines.append("=" * 50)
    lines.append("")

    # 1. 四步标题
    lines.append("【1】四步标题检查")
    all_steps_ok = True
    for step in ["理解", "提炼", "抽取", "转换"]:
        ok = steps_present.get(step, False)
        mark = "OK" if ok else "MISSING"
        if not ok:
            all_steps_ok = False
        lines.append(f"    - {step}: {mark}")
    lines.append("")

    # 2. 知识点校验
    lines.append("【2】知识点校验小节")
    verify_mark = "OK" if has_verify else "MISSING"
    lines.append(f"    - 存在: {verify_mark}")
    lines.append("")

    # 3. 风格要素
    lines.append("【3】风格要素满足数")
    for name, ok in style_elements.items():
        mark = "OK" if ok else "ABSENT"
        lines.append(f"    - {name}: {mark}")
    threshold_met = style_count >= 3
    lines.append(f"    满足数: {style_count}/5  (达标要求 ≥3: {'是' if threshold_met else '否'})")
    lines.append("")

    # 4. 结论
    lines.append("=" * 50)
    if all_steps_ok and has_verify and threshold_met:
        verdict = "PASS"
    else:
        verdict = "FAIL"
    lines.append(f"结论: {verdict}")
    if verdict == "FAIL":
        lines.append("未通过项:")
        if not all_steps_ok:
            missing = [s for s in ["理解", "提炼", "抽取", "转换"] if not steps_present.get(s, False)]
            lines.append(f"  - 四步缺失: {missing}")
        if not has_verify:
            lines.append("  - 缺少知识点校验小节")
        if not threshold_met:
            lines.append(f"  - 风格要素不足({style_count}/5 < 3)")
    lines.append("=" * 50)

    return "\n".join(lines), verdict


def analyze(md: str):
    """对 markdown 做完整分析。"""
    headers = find_headers(md)
    steps_present = check_steps(headers)
    has_verify = check_verify_section(headers, md)
    style_elements, style_count = check_style_elements(md)
    report, verdict = render_report(steps_present, has_verify, style_elements, style_count)
    return {
        "steps_present": steps_present,
        "has_verify": has_verify,
        "style_elements": style_elements,
        "style_count": style_count,
        "verdict": verdict,
        "report": report,
    }


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="check_output.py",
        description="输出校验:检查转换结果 markdown 是否结构齐全、风格达标。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
示例:
  python check_output.py result.md
  python check_output.py --file result.md
""",
    )
    parser.add_argument(
        "file",
        nargs="?",
        default=None,
        help="要校验的 markdown 文件路径(或用 --file 指定)",
    )
    parser.add_argument(
        "-f", "--file",
        dest="file_opt",
        default=None,
        help="要校验的 markdown 文件路径(--file 指定;也可直接用位置参数)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="以 JSON 格式输出结果(便于脚本消费)",
    )
    return parser


def main(argv=None) -> int:
    """主入口。"""
    parser = build_parser()
    args = parser.parse_args(argv)

    # 优先级:位置参数 file > --file
    path = args.file or args.file_opt
    if not path:
        parser.error("请提供 markdown 文件路径(位置参数或 --file)。")

    md = read_file(path)
    result = analyze(md)

    if args.json:
        out = {
            "steps_present": result["steps_present"],
            "has_verify": result["has_verify"],
            "style_elements": result["style_elements"],
            "style_count": result["style_count"],
            "verdict": result["verdict"],
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(result["report"])

    return 0 if result["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
