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
      is_empty, is_chitchat, has_formula, has_mixed_content, recommend_level, recommend_action

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


def recommend(is_empty: bool, is_chitchat: bool, has_formula: bool) -> str:
    """根据三项判定给出建议动作。"""
    if is_empty:
        return "ask_for_input"
    if has_formula:
        return "explain_formula_first"
    if is_chitchat:
        return "ask_for_input"
    return "proceed"


def recommend_output_level(text: str) -> str:
    """
    基于文本特征的启发式输出层次推荐。

    评估逻辑:
      - 计算文本长度(字符数)
      - 计算术语密度:统计 text 中出现 KNOWLEDGE_HINTS 关键词的数量(不重复计数)
      - 文本长度 < 500 且 术语命中数 < 3 → "简约"
      - 文本长度 > 2000 且 术语命中数 >= 5 → "专业"
      - 其余 → "适中"
    """
    if not text:
        return "适中"

    length = len(text)
    # 统计不重复命中的关键词数量
    hit_count = 0
    for kw in KNOWLEDGE_HINTS:
        if re.search(r"[A-Za-z]", kw):
            # 英文词用词边界匹配
            if re.search(r"\b" + re.escape(kw) + r"\b", text, re.IGNORECASE):
                hit_count += 1
        else:
            # 中文词用子串匹配
            if kw in text:
                hit_count += 1
        if hit_count >= 5:
            # 达到专业阈值上限即可提前结束,避免无谓遍历
            break

    if length < 500 and hit_count < 3:
        return "简约"
    # 密度优先:术语命中数≥5 即允许专业档(即使文本较短)
    if hit_count >= 5:
        return "专业"
    if length > 2000 and hit_count >= 3:
        return "专业"
    return "适中"


def analyze(text: str) -> dict:
    """对文本做完整分析,返回结果字典。"""
    empty = is_empty_text(text)
    chitchat = is_chitchat_text(text)
    formula = has_formula_text(text)
    mixed = has_mixed_content(text)
    action = recommend(empty, chitchat, formula)
    level = recommend_output_level(text)
    return {
        "is_empty": empty,
        "is_chitchat": chitchat,
        "has_formula": formula,
        "has_mixed_content": mixed,
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
