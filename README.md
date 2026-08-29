# conversion

> An [Agent Skill](https://agentskills.io) that turns obscure professional text into something an ordinary listener can understand.

读了好几遍还不懂的公式、协议、机理，转成能念给外行听、听完能复述的短文。默认用二次元轻小说当皮肤，但先过「老妪能解」门禁：不解则改。二次元是味道，不是目的。

兼容任何实现 [Agent Skills](https://agentskills.io) 的宿主：Claude Code、Grok、Cursor、Codex、Copilot、TRAE、Gemini CLI 等。一份 `SKILL.md`，无第三方依赖。

[![Agent Skills](https://img.shields.io/badge/SKILL.md-open_standard-blue)](https://agentskills.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![Python 3](https://img.shields.io/badge/python-3_stdlib-3776AB)](scripts/)

## 它做什么

| 输入 | 输出 |
|------|------|
| 贝叶斯定理公式 | 侦探按新脚印改写怀疑度（先验 / 似然 / 后验能对上） |
| 快速排序 | 运动会定达标线、分组、一组只剩一人就不比 |
| Raft 共识 | 议会过半数抄完才敲槌，议长病倒再选，校史不改 |
| Word「标题 1」再更新目录 | 轻度包装 + 可执行步骤清单，不编成闯关 |

和通用 ELI5 的差别：必须有 **概念 ↔ 故事元素** 映射表，正文之后有 **知识点校验**，听得懂但不能把机制讲反。

## 使用场景

技能会在自然语言里自动触发。也可以显式调用 `/conversion`。

**适合**

```
贝叶斯定理这个公式我看不懂，用比喻讲讲
Raft 太抽象了，希望用故事讲清楚
把这段分布式锁原理转成二次元风格
抗体免疫机制讲得生动一点，我要能复述给别人
这段论文腔完全读不懂，转换一下
Word 里设标题再更新目录，步骤别丢，别写成玄幻
老妪能解一下这段
```

**指定档位（可选，可组合）**

```
用轻度风格解释互斥锁          → 克制比喻，可几乎无角色
用重度/中二风格讲 Raft         → 夸张对白；仍须先过门禁
详细一点 / 再展开 / 写成篇     → 800–2500 字
用英文输出                     → 默认中文，声明语言才切换
```

**不适合**

- 只要一句话 ELI5、不要映射表
- 写原创小说、画二次元图
- 中英互译
- 纯闲聊（会请你贴一段要转换的知识）

## 快速开始

```bash
npx skills add songhangze985-eng/conversion-skill
```

[skills CLI](https://github.com/vercel-labs/skills) 会检测本机已安装的 Agent（Claude Code、Cursor、Codex、Copilot、Gemini CLI 等），装到对应 skills 目录。文件夹名必须是 `conversion`。

装好后直接说上面那些话即可，不必先打技能名。

### 手动安装

```bash
git clone https://github.com/songhangze985-eng/conversion-skill.git
```

把仓库根目录拷到宿主的 skills 路径，并命名为 `conversion`：

| 宿主 | 路径 |
|------|------|
| Claude Code | `~/.claude/skills/conversion/` |
| Grok | `~/.grok/skills/conversion/` |
| Cursor | `.cursor/skills/conversion/`（项目）或 `~/.cursor/skills/conversion/` |
| Codex | `.codex/skills/conversion/` |
| GitHub Copilot | `.github/skills/conversion/` |
| TRAE | 对应 skills 根目录下的 `conversion/` |

Windows 示例（Grok）：

```powershell
git clone https://github.com/songhangze985-eng/conversion-skill.git
Copy-Item -Recurse conversion-skill "$env:USERPROFILE\.grok\skills\conversion"
```

要求：目录内有 `SKILL.md`，YAML `name` 为 `conversion`（kebab-case）。不要用「转换skill」当技能名。

无终端时：下载 [SKILL.md](https://raw.githubusercontent.com/songhangze985-eng/conversion-skill/main/SKILL.md)，在 claude.ai **Settings → Capabilities → Skills** 上传并打开。

## 默认行为

| 项 | 默认 | 用户可改 |
|----|------|----------|
| 篇幅 | 正文 **≤800 字**（能一次念完） | 「详细一点」→ 800–2500；明确要长文才加长 |
| 皮肤 | 二次元标准档：一场景、少量对话 | 「轻度」/「重度」「中二」 |
| 版式 | 分析过程折叠，正文只出现一次 | — |
| 门禁 | 外行能用一句大白话复述「它在干什么」 | — |
| 校验 | 文末 1–3 句严谨复述原文 | — |

点名「写一万字 / 大量文本」或丢来很大的文件时，技能会先用番茄作家口吻回一句，再请你缩小范围或接受短稿。原句只住在 [`references/author-voice.md`](references/author-voice.md)，**不写进知识正文**。

空闲聊不会回「封禁中」。内容安全拒写走宿主规则，不套这个梗。

## 它怎么工作

五步流水线。前三步给纠错用，默认折叠。

1. **理解** — 用自己的话复述，标出最难点  
2. **提炼** — 概念、关系、约束（事实清单）  
3. **意象映射** — 每个概念对应一个故事元素；形似不够，机制必须同构（[mapping-principles.md](references/mapping-principles.md)）  
4. **转换** — 套当前皮肤写出正文（默认 [style-anime.md](references/style-anime.md)）  
5. **老妪能解** — 念给外行听，不懂就改，过关后再写知识点校验（[lao-yu-gate.md](references/lao-yu-gate.md)）

用户说某段没懂：回到第 2 步定位 → 改映射 → 只重写对应片段 → 再过门禁。不重跑全场。

操作步骤类知识（怎么做）：轻故事包装，步骤保留为清单，默认轻度皮肤。

## 命令

脚本可选。技能本体是 `SKILL.md`；脚本只做输入预检、骨架生成和结果校验。需要 **Python 3**，仅标准库，Windows / macOS / Linux 均可。

在仓库根目录执行：

```bash
# 输入预检：空输入、闲聊、公式、过大文件、是否点名万字
python scripts/validate_input.py "贝叶斯定理 P(A|B)=P(B|A)P(A)/P(B)"
python scripts/validate_input.py "你好啊"
python scripts/validate_input.py "请写成10000字"
echo "今天天气不错" | python scripts/validate_input.py -

# 生成五步骨架
python scripts/generate_template.py --topic "快速排序"
python scripts/generate_template.py --topic "区块链" --style heavy --level expand
python scripts/generate_template.py --topic "递归" --style light --level default --with-formula

# 校验一份转换结果（映射表、知识点校验、篇幅）
python scripts/check_output.py result.md
python scripts/check_output.py result.md --level default
python scripts/check_output.py result.md --level expand --json
```

Windows 若 `python` 不可用，改用 `py -3 scripts/...`。

### `validate_input.py`

| 参数 | 说明 |
|------|------|
| `text` | 要校验的文本；`-` 或省略则读 stdin |

stdout 为 JSON：`is_empty`、`is_chitchat`、`has_formula`、`has_mixed_content`、`is_too_large`、`wants_longform`、`recommend_level`（简约 / 展开 / 长篇）、`recommend_action`。

`recommend_action`：`proceed` · `explain_formula_first` · `ask_for_input` · `refuse_volume` · `refuse_length`。

### `generate_template.py`

| 参数 | 默认 | 说明 |
|------|------|------|
| `-t, --topic` | （必填） | 知识点名称 |
| `-s, --style` | `standard` | `light` · `standard` · `heavy` |
| `-l, --level` | `default` | `default`（≤800）· `expand`（800–2500）· `long` |
| `--with-formula` | 关 | 增加「公式含义」占位 |

### `check_output.py`

| 参数 | 默认 | 说明 |
|------|------|------|
| `file` / `-f` | （必填） | 转换结果 Markdown |
| `--level` | `default` | `default` ≤800 · `expand` 800–2500 · `long` 不限 |
| `--json` | 关 | JSON 输出 |

PASS 条件：有映射表、有非空「知识点校验」、正文篇幅落在指定档、正文和校验里没有情况回复原句。概念覆盖只作报告，不用术语是否原词出现卡死白话正文。

## 仓库结构

```
conversion/
├── SKILL.md                         # 技能入口（宿主只认这个 name + description）
├── LICENSE
├── README.md
├── scripts/
│   ├── validate_input.py            # 输入预检
│   ├── generate_template.py         # 五步骨架
│   └── check_output.py              # 结果校验
├── references/
│   ├── mapping-principles.md        # 形似 / 神似 / 保真（核心方法）
│   ├── lao-yu-gate.md               # 老妪能解门禁
│   ├── style-anime.md               # 二次元皮肤
│   ├── author-voice.md              # 番茄作家情况回复
│   ├── domain-examples.md           # 短篇达标样例
│   └── long-article-engine.md       # 仅用户明确要长文时
├── assets/templates/
│   ├── article-output-template.md   # 折叠分析 + 单次正文
│   ├── five-step-template.md        # 骨架入口（实际由 generate_template.py 生成）
│   └── character-archetypes.md      # 角色原型（皮肤按需读取）
└── evals/
    ├── cases.md                     # 评测题
    ├── rubric.md                    # 能懂 / 保真 / 同构 / 皮肤不挡懂
    └── description-triggers.md      # 应触发 / 不应触发样本
```

评测题与触发样本见 [`evals/`](evals/)。对照写法见 [`references/domain-examples.md`](references/domain-examples.md)。

`SKILL.md` 是给模型的工作流：触发靠 description，正文靠五步，交稿靠 Verification。README 只给人看怎么装、怎么用。

## FAQ

**故事会不会把原意讲歪？**  
不会当作可接受结果。映射要求机制同构；文末用 1–3 句还原定义。趣味和正确性冲突时，正确性优先。

**为什么默认只有八百字？**  
「老妪能解」的标准是听得懂，不是写得长。需要展开时说「详细一点」。点名万字会先按情况回复处理。

**必须跑脚本吗？**  
不必。对话里触发技能即可。脚本给要预检输入或检查输出结构的人用。

**能处理哪些领域？**  
公式、算法、系统、生理、操作步骤等「是什么 / 为什么 / 怎么做」的专业知识。主观闲聊会请你改贴知识文本。

**二次元看不懂怎么办？**  
说「用轻度」。皮肤挡懂时，门禁会降浓度，不会用黑话换正确性。

## License

[MIT](LICENSE)
