# -*- coding: utf-8 -*-
"""生成五步骨架。默认篇幅 default（≤800）。"""

import argparse
import sys

STYLE_DESC = {
    "light": "轻度：克制比喻，可无角色。",
    "standard": "标准：一场景、少量对话，机制在情节里发生。",
    "heavy": "重度：仅用户点名；仍须过老妪门禁。",
}
LEVEL_DESC = {
    "default": "默认：正文 ≤800 字。",
    "expand": "展开：800-2500 字。",
    "long": "长篇：用户明确要求时；不设万字门槛。",
}


def render(topic: str, style: str, level: str, with_formula: bool) -> str:
    """Emit the same layout as assets/templates/article-output-template.md."""
    parts = [
        f"# {topic}",
        "",
        f"> 皮肤:**{style}** — {STYLE_DESC[style]}",
        f"> 篇幅:**{level}** — {LEVEL_DESC[level]}",
        "",
        "<details>",
        "<summary>分析过程（点击展开）</summary>",
        "",
    ]
    if with_formula:
        parts += [
            "### 公式含义",
            "",
            "- 每个符号在干什么：",
            "- 整句大白话：",
            "",
        ]
    parts += [
        "### 1. 理解",
        "",
        "- 原文含义复述：",
        "- 核心难点：",
        "- 假设：",
        "",
        "### 2. 提炼",
        "",
        "- 关键概念：",
        "- 关系：",
        "- 约束：",
        "",
        "### 3. 意象映射",
        "",
        "| 知识概念 | 故事元素 | 对应理由 |",
        "| --- | --- | --- |",
        "|  |  |  |",
        "",
        "### 门禁自检",
        "",
        "- 会皱眉的词：",
        "- 外行复述：",
        "",
        "</details>",
        "",
        "## 正文",
        "",
        f"> 篇幅：{level} | 皮肤：{style}",
        "",
        f"<!-- {STYLE_DESC[style]} {LEVEL_DESC[level]} 机制在情节里发生。 -->",
        "",
        "### 知识点校验",
        "",
        "- 1-3 句严谨复述：",
        "",
    ]
    return "\n".join(parts)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="生成五步转换骨架。")
    parser.add_argument("-t", "--topic", required=True)
    parser.add_argument("-s", "--style", default="standard", choices=tuple(STYLE_DESC))
    parser.add_argument("-l", "--level", default="default", choices=tuple(LEVEL_DESC))
    parser.add_argument("--with-formula", action="store_true")
    args = parser.parse_args(argv)
    md = render(args.topic, args.style, args.level, args.with_formula)
    sys.stdout.write(md if md.endswith("\n") else md + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
