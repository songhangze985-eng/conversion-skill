# -*- coding: utf-8 -*-
"""
模板生成脚本 (generate_template.py)

用途:
    为「转换skill」(把晦涩专业知识转为二次元故事风格)生成四步输出的 markdown 骨架。
    根据知识点名称与风格强度(light/standard/heavy)输出 markdown 到 stdout。

用法:
    python generate_template.py --topic "贝叶斯定理" --style standard
    python generate_template.py --topic "区块链" --style heavy
    python generate_template.py --topic "递归"           # 默认 standard
    python generate_template.py --topic "递归" --with-formula   # 含公式小节
    python generate_template.py --help

style 可选:
    light    轻度:少量角色化点缀,贴近原知识
    standard 标准:角色化 + 场景化 + 对话,平衡可读与准确
    heavy    重度:重度拟人化 + 伏笔反转 + 完整剧情

仅依赖 Python 标准库 (argparse, sys)。
Windows 兼容。
"""

import argparse
import sys


# 风格档位描述
STYLE_DESC = {
    "light": "轻度档位:少量角色化点缀,贴近原知识,场景轻描淡写。",
    "standard": "标准档位:角色化 + 场景化 + 对话化,平衡可读性与准确性。",
    "heavy": "重度档位:重度拟人化 + 伏笔反转 + 完整剧情线,二次元浓度拉满。",
}

VALID_STYLES = ("light", "standard", "heavy")


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="generate_template.py",
        description="生成四步转换流程的 markdown 骨架。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
示例:
  python generate_template.py --topic "贝叶斯定理" --style standard
  python generate_template.py --topic "区块链" --style heavy
  python generate_template.py --topic "P(A|B)=..." --style standard --with-formula
""",
    )
    parser.add_argument(
        "-t", "--topic",
        required=True,
        help="知识点名称(必填)",
    )
    parser.add_argument(
        "-s", "--style",
        default="standard",
        choices=VALID_STYLES,
        help="风格强度:light/standard/heavy(默认 standard)",
    )
    parser.add_argument(
        "--with-formula",
        action="store_true",
        help='添加「公式含义」小节占位(当知识点含 LaTeX 公式时使用)',
    )
    return parser


def render(topic: str, style: str, with_formula: bool) -> str:
    """渲染 markdown 骨架。"""
    style_desc = STYLE_DESC[style]
    lines = []

    # 标题
    lines.append(f"# {topic}")
    lines.append("")
    lines.append(f"> 风格档位:**{style}** — {style_desc}")
    lines.append("")

    # 公式含义小节(可选)
    if with_formula:
        lines.append("## 公式含义")
        lines.append("")
        lines.append("<!-- 提示:先逐符号解释公式中每个符号的物理/数学含义,再说明整体表达的关系。例如:P(A|B) 表示在 B 发生条件下 A 的概率。 -->")
        lines.append("")
        lines.append("- 待解释符号:")
        lines.append("- 整体含义:")
        lines.append("")
        lines.append("<!-- 提示:用一句大白话复述公式,让非专业读者也能理解它在说什么。 -->")
        lines.append("")

    # 第一步:理解
    lines.append("### 1. 理解")
    lines.append("")
    lines.append('<!-- 提示:用通用语言复述知识点的核心含义,不堆术语,确保自己先真的「懂了」。回答:它解决什么问题?关键变量是什么?边界条件是什么? -->')
    lines.append("")
    lines.append("- 核心定义:")
    lines.append("- 解决的问题:")
    lines.append("- 关键要素:")
    lines.append("")

    # 第二步:提炼
    lines.append("### 2. 提炼")
    lines.append("")
    lines.append('<!-- 提示:剥离专业外壳,抽象出「骨架概念」。哪些是必须保留的硬核要素(不能丢的真相),哪些是可替换的表层表述(可二次元化的部分)? -->')
    lines.append("")
    lines.append("- 必须保留的硬核要素:")
    lines.append("  - ")
    lines.append("- 可替换/拟人化的部分:")
    lines.append("  - ")
    lines.append("")

    # 第三步:意象映射(映射关系表)
    lines.append("### 3. 意象映射")
    lines.append("")
    lines.append('<!-- 提示:建立「专业概念 ↔ 故事元素」映射表。每个专业元素都要找到对应的二次元载体(角色/道具/场景/规则),并标注映射理由。 -->')
    lines.append("")
    lines.append("| 专业概念 | 二次元载体 | 映射理由 |")
    lines.append("| --- | --- | --- |")
    lines.append("|  |  |  |")
    lines.append("")

    # 第四步:转换
    lines.append("### 4. 转换")
    lines.append("")
    lines.append(f"<!-- 提示:基于第3步的映射,撰写二次元故事化讲解。风格档位 = {style}。 -->")
    lines.append("<!-- 提示(imperative):用角色对话推进;场景具体可感;概念用拟人/道具呈现;末尾设伏笔或反转,呼应知识本质。 -->")
    if style == "light":
        lines.append("<!-- 提示(light):保持克制,1~2 处角色化即可,主体仍是清晰讲解。 -->")
    elif style == "standard":
        lines.append("<!-- 提示(standard):角色化+场景化+对话化齐全,可读性与准确性并重。 -->")
    else:
        lines.append("<!-- 提示(heavy):重度拟人化,设置完整剧情线,伏笔+反转收尾,二次元浓度拉满。 -->")
    lines.append("")
    lines.append("[此处填写二次元故事化正文]")
    lines.append("")

    # 知识点校验
    lines.append("### 知识点校验")
    lines.append("")
    lines.append("<!-- 提示:对照第1步的核心定义,逐条核对转换后的故事是否准确传达了硬核要素,有无误导或遗漏。 -->")
    lines.append("")
    lines.append("- [ ] 核心定义是否传达:")
    lines.append("- [ ] 关键要素是否齐全:")
    lines.append("- [ ] 是否存在误导/夸大:")
    lines.append("- [ ] 映射关系是否自洽:")
    lines.append("")

    return "\n".join(lines)


def main(argv=None) -> int:
    """主入口。"""
    parser = build_parser()
    args = parser.parse_args(argv)
    md = render(args.topic, args.style, args.with_formula)
    sys.stdout.write(md)
    # 确保以换行结尾
    if not md.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
