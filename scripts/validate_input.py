# -*- coding: utf-8 -*-
"""
输入校验脚本 (validate_input.py)

用途:
    为 conversion skill 做前置输入校验。
    判断空输入、闲聊、公式、过大文件、是否点名万字。
    建议动作: proceed / explain_formula_first / ask_for_input / refuse_volume / refuse_length。

用法:
    python validate_input.py "贝叶斯定理 P(A|B) = ..."
    python validate_input.py -            # 从 stdin 读取
    echo "你好啊" | python validate_input.py -
    python validate_input.py --help

输出:
    JSON 到 stdout,字段:
      is_empty, is_chitchat, has_formula, has_mixed_content, is_too_large,
      wants_longform, recommend_level, recommend_action

仅依赖 Python 标准库 (json, argparse, sys, re)。
Windows 兼容。
"""

import argparse
import json
import re
import sys


# 闲聊/问候关键词(出现即可能是闲聊)
CHITCHAT_KEYWORDS = [
    "你好", "您好", "早上好", "下午好", "晚上好", "嗨", "哈喽", "hello", "hi",
    "谢谢", "感谢", "多谢", "辛苦了", "thanks", "thank",
    "今天", "明天", "昨天", "天气", "周末",
    "哈哈", "嘿嘿", "呵呵", "嘻嘻", "啊啊", "呜呜",
    "再见", "拜拜", "bye",
    "在吗", "在不在", "忙吗",
    "吃了吗", "早安", "晚安",
    # 英文闲聊补充
    "how are you", "how's it going", "what's up", "good morning", "good afternoon",
    "good evening", "see you", "have a nice", "let us", "let's", "grab a coffee",
    "weather is", "nice day", "how about",
]

# 闲聊判定的文本长度上限(短文本才视为闲聊候选)
# 英文闲聊句子字符数天然更多,提高上限以覆盖英文
CHITCHAT_MAX_LEN = 80

# 知识特征关键词:出现这些词说明更可能是知识文本而非闲聊
KNOWLEDGE_HINTS = [
    "定理", "定律", "原理", "公式", "定义", "概念", "算法", "函数", "方程",
    "矩阵", "向量", "微积分", "概率", "统计", "回归", "分布", "假设",
    "模型", "架构", "协议", "机制", "流程", "结构", "参数", "变量",
    "区块链", "神经网络", "编译", "递归", "复杂度",
]

# LaTeX 公式检测模式
LATEX_PATTERNS = [
    r"\$\$.+?\$\$",          # $$...$$ 块公式
    r"(?<!\\)\$(?!\s*\d+(?:\.\d+)?\s*\$)[^\$\n]+?\$", # $...$ 行内公式(排除纯数字价格$5$)
    r"\\frac\b",
    r"\\dfrac\b",
    r"\\tfrac\b",
    r"\\sum\b",
    r"\\int\b",
    r"\\prod\b",
    r"\\lim\b",
    r"\\sqrt\b",
    r"\\alpha\b",
    r"\\beta\b",
    r"\\theta\b",
    r"\\lambda\b",
    r"\\partial\b",
    r"\\nabla\b",
    r"\\infty\b",
    r"\\le\b",
    r"\\ge\b",
    r"\\ne\b",
    r"\\approx\b",
    r"\\equiv\b",
    r"\\cdot\b",
    r"\\times\b",
    r"\\div\b",
    r"\\pm\b",
    r"\\begin\{",          # 环境如 matrix/align
    r"\\end\{",
    # 化学方程式:含 → 或 ⟶ 且含元素符号+下标(如 6 CO2 + 6 H2O → C6H12O6)
    r"(?:[A-Z][a-z]?\d*\s*(?:\+\s*)?){2,}\s*(?:→|⟶|->)\s*(?:[A-Z][a-z]?\d*\s*(?:\+\s*)?)+",
    # 内联等式:含 = 且至少一侧含字母或右括号(如 w = w - eta * grad, P(A|B)=P(B|A))
    r"(?<=[A-Za-z\)])(\s*=\s*)(?=[A-Za-z])",
]

# 合并后的正则
LATEX_REGEX = re.compile("|".join(LATEX_PATTERNS), re.DOTALL)


def is_empty_text(text: str) -> bool:
    """判断文本是否为空或仅含空白。"""
    return text is None or len(text.strip()) == 0


def is_chitchat_text(text: str) -> bool:
    """
    闲聊启发式判定:
      - 文本较短(<= CHITCHAT_MAX_LEN)
      - 含问候/语气词关键词
      - 且无明显知识特征
    """
    if not text:
        return False
    stripped = text.strip()
    # 长文本不太可能是闲聊
    if len(stripped) > CHITCHAT_MAX_LEN:
        return False
    lowered = stripped.lower()
    has_chitchat = any(kw in lowered for kw in CHITCHAT_KEYWORDS)
    has_knowledge = any(
        re.search(r"\b" + re.escape(kw) + r"\b", lowered) if re.search(r"[A-Za-z]", kw) else (kw in text)
        for kw in KNOWLEDGE_HINTS
    )
    return has_chitchat and not has_knowledge


def has_formula_text(text: str) -> bool:
    """检测是否含 LaTeX 公式模式。"""
    if not text:
        return False
    return bool(LATEX_REGEX.search(text))


def has_mixed_content(text: str) -> bool:
    """
    检测输入是否为混合内容(同时含表格、清单、公式等多种结构)。

    检测逻辑:
      - 表格:含 `|` 且至少有 2 行(简化的表格检测)
      - 清单:含 `- ` 或 `* ` 开头的行至少 2 行
      - 公式:含 `$`(行内或块级)
      - 若以上 3 种中至少出现 2 种,则判定为混合内容
    """
    if not text:
        return False

    lines = text.splitlines()

    # 表格:含 `|` 且至少有 2 行
    has_table = "|" in text and len([ln for ln in lines if ln.strip()]) >= 2

    # 清单:含 `- ` 或 `* ` 开头的行至少 2 行
    list_lines = [
        ln for ln in lines
        if ln.lstrip().startswith("- ") or ln.lstrip().startswith("* ")
    ]
    has_list = len(list_lines) >= 2

    # 公式:含 `$`(行内或块级)
    has_formula = "$" in text

    # 至少出现 2 种则判定为混合内容
    count = sum([has_table, has_list, has_formula])
    return count >= 2


LARGE_INPUT_CHARS = 6000
LONGFORM_HINTS = ("10000", "一万", "万字", "大量文本", "专业层", "长篇连载", "写水文")
EXPAND_HINTS = ("详细一点", "再展开", "写成篇", "展开讲")


def is_too_large_text(text: str) -> bool:
    return bool(text) and len(text) >= LARGE_INPUT_CHARS


def wants_longform_text(text: str) -> bool:
    if not text:
        return False
    return any(h in text for h in LONGFORM_HINTS)


def recommend(is_empty: bool, is_chitchat: bool, has_formula: bool,
              too_large: bool, longform: bool) -> str:
    if is_empty:
        return "ask_for_input"
    if is_chitchat:
        return "ask_for_input"
    if too_large:
        return "refuse_volume"
    if longform:
        return "refuse_length"
    if has_formula:
        return "explain_formula_first"
    return "proceed"


def recommend_output_level(text: str) -> str:
    """默认简约。仅当用户要展开/长篇，或输入极大时改档。"""
    if not text:
        return "简约"
    if wants_longform_text(text):
        return "长篇"
    if any(h in text for h in EXPAND_HINTS):
        return "展开"
    if is_too_large_text(text):
        return "简约"
    return "简约"


def analyze(text: str) -> dict:
    empty = is_empty_text(text)
    chitchat = is_chitchat_text(text)
    formula = has_formula_text(text)
    mixed = has_mixed_content(text)
    too_large = is_too_large_text(text)
    longform = wants_longform_text(text)
    action = recommend(empty, chitchat, formula, too_large, longform)
    level = recommend_output_level(text)
    return {
        "is_empty": empty,
        "is_chitchat": chitchat,
        "has_formula": formula,
        "has_mixed_content": mixed,
        "is_too_large": too_large,
        "wants_longform": longform,
        "recommend_level": level,
        "recommend_action": action,
    }


def read_input(arg: str) -> str:
    """
    读取输入:
      - arg == "-" 时从 stdin 读取
      - 否则 arg 即为输入文本
    """
    if arg == "-":
        return sys.stdin.read()
    return arg


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="validate_input.py",
        description="输入校验:判断文本是否为空、闲聊、含公式,给出建议动作。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
示例:
  python validate_input.py "贝叶斯定理 P(A|B)=P(B|A)P(A)/P(B)"
  python validate_input.py "你好啊"
  echo "今天天气不错" | python validate_input.py -
  python validate_input.py -
""",
    )
    parser.add_argument(
        "text",
        nargs="?",
        default=None,
        help='要校验的文本;使用 "-" 表示从 stdin 读取(默认 stdin)',
    )
    return parser


def main(argv=None) -> int:
    """主入口。"""
    parser = build_parser()
    args = parser.parse_args(argv)

    # 获取文本:位置参数缺失时回退到 stdin
    if args.text is None:
        # 交互终端下给出提示,避免用户以为卡死
        if sys.stdin.isatty():
            sys.stderr.write("请输入要校验的文本(Ctrl+D 或 Ctrl+Z 结束输入):\n")
        text = sys.stdin.read()
    else:
        text = read_input(args.text)

    result = analyze(text)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
