# -*- coding: utf-8 -*-
"""
输入校验脚本 (validate_input.py)

用途:
    为"转换skill"(把晦涩专业知识转为二次元故事风格)做前置输入校验。
    接收一段文本(命令行参数或 stdin),判断是否为空、是否像闲聊、是否含 LaTeX 公式,
    并给出建议动作(proceed / explain_formula_first / ask_for_input)。

用法:
    python validate_input.py "贝叶斯定理 P(A|B) = ..."
    python validate_input.py -            # 从 stdin 读取
    echo "你好啊" | python validate_input.py -
    python validate_input.py --help

输出:
    JSON 到 stdout,字段:
      is_empty, is_chitchat, has_formula, recommend_action

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
]

# 闲聊判定的文本长度上限(短文本才视为闲聊候选)
CHITCHAT_MAX_LEN = 30

# 知识特征关键词:出现这些词说明更可能是知识文本而非闲聊
KNOWLEDGE_HINTS = [
    "定理", "定律", "原理", "公式", "定义", "概念", "算法", "函数", "方程",
    "矩阵", "向量", "微积分", "概率", "统计", "回归", "分布", "假设",
    "模型", "架构", "协议", "机制", "流程", "结构", "参数", "变量",
    "区块链", "神经网络", "编译", "递归", "复杂度",
    "is", "the", "=", "+", "-", "公式",
]

# LaTeX 公式检测模式
LATEX_PATTERNS = [
    r"\$\$.+?\$\$",          # $$...$$ 块公式
    r"(?<!\\)\$[^\$\n]+?\$", # $...$ 行内公式(避免与 $$ 冲突)
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
    has_knowledge = any(kw.lower() in lowered for kw in KNOWLEDGE_HINTS)
    return has_chitchat and not has_knowledge


def has_formula_text(text: str) -> bool:
    """检测是否含 LaTeX 公式模式。"""
    if not text:
        return False
    return bool(LATEX_REGEX.search(text))


def recommend(is_empty: bool, is_chitchat: bool, has_formula: bool) -> str:
    """根据三项判定给出建议动作。"""
    if is_empty:
        return "ask_for_input"
    if has_formula:
        return "explain_formula_first"
    if is_chitchat:
        return "ask_for_input"
    return "proceed"


def analyze(text: str) -> dict:
    """对文本做完整分析,返回结果字典。"""
    empty = is_empty_text(text)
    chitchat = is_chitchat_text(text)
    formula = has_formula_text(text)
    action = recommend(empty, chitchat, formula)
    return {
        "is_empty": empty,
        "is_chitchat": chitchat,
        "has_formula": formula,
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
        text = sys.stdin.read()
    else:
        text = read_input(args.text)

    result = analyze(text)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
